/**
 * The suite default is jsdom, which has no `setImmediate` — both zip libraries
 * need it, so this file runs against node.
 *
 * @jest-environment node
 */

/*
 * Bulk import: reading an archive, honouring a manifest, and the round trip.
 *
 * The restarted-race case is the point of most of this. Four races from one
 * weekend share an event DateTime, a track, a session type and an identical
 * grid — every automatic axis agrees, so roster overlap cannot separate them
 * and neither can the date. Locally the tie breaks on modified time, but that
 * does not survive every transfer path. A manifest is the only thing left, and
 * without one those rows have to reach the user rather than be guessed at.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import {
  buildExportManifest,
  buildWeekendLayout,
  buildWeekendManifest,
  EXPORT_MANIFEST_NAME,
  ExportReplayRequest,
  writeArchive,
  WeekendSessionSource,
} from './replay-export';
import {
  extractArchive,
  inspectArchive,
  resolveArchiveEntryPath,
} from './archive-reader';
import { readManifestFile, scanManifests } from './import-manifest';
import { scanImportSource } from './replay-import';

const MAGIC_OFFSET = 0x2c;
const POINTER_OFFSET = 0x35;
const HEADER_LENGTH = 0x40;

const lengthPrefixed = (value: string): Buffer => {
  const body = Buffer.from(value, 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(body.length, 0);
  return Buffer.concat([prefix, body]);
};

const bytePrefixed = (value: string): Buffer => {
  const body = Buffer.from(value, 'utf8');
  return Buffer.concat([Buffer.from([body.length]), body]);
};

const buildVcr = (
  sceneDesc: string,
  session: string,
  driverNames: string[],
): Buffer => {
  const trailer = Buffer.concat([
    lengthPrefixed(JSON.stringify({ sceneDesc, session })),
    lengthPrefixed(`${sceneDesc}.SCN`),
    lengthPrefixed(`${sceneDesc}.AIW`),
    lengthPrefixed('Daytona_2024'),
    lengthPrefixed('1.10'),
    lengthPrefixed('8cd7325da1ec405aa0358a60a7d79fc1616b05041491164ae829aa488'),
    lengthPrefixed('C:\\Games\\Le Mans Ultimate\\Installed\\Locations\\'),
    Buffer.alloc(24),
  ]);

  const count = Buffer.alloc(4);
  count.writeUInt32LE(driverNames.length, 0);

  const drivers = Buffer.concat([
    count,
    Buffer.from([0x00]),
    ...driverNames.map((name, index) =>
      Buffer.concat([
        bytePrefixed(name),
        bytePrefixed(`${index}_26_TEAM`),
        bytePrefixed(''),
        bytePrefixed(name),
        bytePrefixed(String(index + 1)),
        Buffer.alloc(28),
      ]),
    ),
  ]);

  const body = Buffer.alloc(256, 0x41);
  const header = Buffer.alloc(HEADER_LENGTH);
  header[MAGIC_OFFSET] = 0x0a;
  header.write('IRSR', MAGIC_OFFSET + 1, 'latin1');
  header.writeUInt32LE(HEADER_LENGTH + body.length, POINTER_OFFSET);

  return Buffer.concat([header, body, trailer, drivers]);
};

const buildLog = (
  eventDateTime: number,
  sessionDateTime: number,
  sessionTag: 'Race' | 'Qualify' | 'Practice1',
  driverNames: string[],
): string =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rFactorXML version="1.0">',
    '<RaceResults>',
    `<DateTime>${eventDateTime}</DateTime>`,
    '<TrackVenue>Daytona International Speedway</TrackVenue>',
    '<TrackCourse>Daytona International Speedway</TrackCourse>',
    '<TrackEvent>Daytona International Speedway</TrackEvent>',
    `<${sessionTag}>`,
    `<DateTime>${sessionDateTime}</DateTime>`,
    ...driverNames.map((name) => `<Driver><Name>${name}</Name></Driver>`),
    `</${sessionTag}>`,
    '</RaceResults>',
    '</rFactorXML>',
  ].join('\n');

/*
 * The real hand-off a steward was sent: nine replays and 190 logs, two events
 * at one track on one evening, one race recorded on two PCs, and an in-progress
 * .tmp. Gitignored, so its absence skips rather than fails.
 */
const FIXTURE_ROOT = join(
  __dirname,
  '../../../fixture-test-set/import-replay-data-set',
);
const FIXTURE_REPLAYS = join(FIXTURE_ROOT, 'Replays');
const FIXTURE_RESULTS = join(FIXTURE_ROOT, 'Results');

/** One event time for the whole weekend, exactly as LMU writes it. */
const EVENT_TIME = 1785495847;

/** Identical across all four races. That is what makes them inseparable. */
const GRID = [
  'Anna One',
  'Bob Two',
  'Cara Three',
  'Dan Four',
  'Eve Five',
  'Finn Six',
];

describe('main/archive entry paths', () => {
  const target = 'C:\\Temp\\unpack';

  it('places an ordinary entry inside the target', () => {
    expect(
      resolveArchiveEntryPath(target, '03 Race - Daytona R1 2/replay.Vcr'),
    ).toBe(join(target, '03 Race - Daytona R1 2', 'replay.Vcr'));
  });

  /**
   * A steward opens archives sent by strangers, and nothing in the zip format
   * stops an entry naming a path outside it. These are the shapes that matter.
   */
  it.each([
    ['../escape.Vcr', 'a parent traversal'],
    ['a/../../escape.Vcr', 'a traversal buried mid-path'],
    ['/etc/passwd', 'an absolute posix path'],
    ['C:\\Windows\\System32\\evil.dll', 'an absolute Windows path'],
    ['..\\..\\escape.Vcr', 'a backslash traversal'],
    ['nested\\file.Vcr', 'a backslash separator'],
    ['', 'an empty name'],
  ])('refuses %s (%s)', (entryName) => {
    expect(resolveArchiveEntryPath(target, entryName)).toBeNull();
  });
});

describe('main/bulk import', () => {
  let root = '';
  let sourceDirectory = '';
  let logDirectory = '';
  let archivePath = '';
  let unpackDirectory = '';

  /*
   * A Daytona weekend as it really occurs: one practice, one qualifying, and
   * four races from restarts. Every race carries the same grid and the same
   * event time; only the log file name and the session start differ.
   */
  const races = [
    { replayName: 'Daytona R1 2', log: '2026_07_30_23_09_50-12R1.xml' },
    { replayName: 'Daytona R1 3', log: '2026_07_30_23_10_40-76R1.xml' },
    { replayName: 'Daytona R1 4', log: '2026_07_30_23_11_34-17R1.xml' },
    { replayName: 'Daytona R1 5', log: '2026_07_30_23_16_01-71R1.xml' },
  ];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'lmu-steward-bulk-'));
    sourceDirectory = join(root, 'handoff');
    logDirectory = join(root, 'Results');
    unpackDirectory = join(root, 'unpack');
    mkdirSync(sourceDirectory, { recursive: true });
    mkdirSync(logDirectory, { recursive: true });

    races.forEach((race, index) => {
      writeFileSync(
        join(sourceDirectory, `${race.replayName}.Vcr`),
        buildVcr('DAYTONA', 'RACE', GRID),
      );
      writeFileSync(
        join(sourceDirectory, race.log),
        buildLog(EVENT_TIME, EVENT_TIME + index * 60, 'Race', GRID),
      );
    });

    archivePath = join(root, 'weekend.zip');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Builds the archive weekend export would write for these sessions. */
  const buildWeekendArchive = async (): Promise<void> => {
    const sources: WeekendSessionSource[] = races.map((race) => {
      const vcrPath = join(sourceDirectory, `${race.replayName}.Vcr`);
      const logPath = join(sourceDirectory, race.log);
      const request: ExportReplayRequest = {
        hash: race.replayName,
        replayName: race.replayName,
        sceneDesc: 'DAYTONA',
        session: 'RACE',
        timestamp: EVENT_TIME,
        logDataFileName: race.log,
      };

      return {
        request,
        vcrPath,
        logPath,
        vcrSize: readFileSync(vcrPath).length,
        logSize: readFileSync(logPath).length,
      };
    });

    const { entries } = buildWeekendLayout(sources);

    const manifest = buildWeekendManifest(
      {
        weekendLabel: 'Daytona International Speedway',
        timestamp: EVENT_TIME,
        sessions: sources.map((source) => source.request),
      },
      entries,
      [
        {
          replayName: 'Daytona P1 4',
          session: 'PRACTICE',
          reason: 'This replay has no result log, so it cannot be exported.',
        },
      ],
    );

    await writeArchive(
      [
        {
          source: { buffer: Buffer.from(JSON.stringify(manifest, null, 2)) },
          entryName: EXPORT_MANIFEST_NAME,
        },
        ...entries.flatMap((entry) => [
          {
            source: { filePath: entry.vcrPath },
            entryName: entry.vcrEntryName,
          },
          {
            source: { filePath: entry.logPath },
            entryName: entry.logEntryName,
          },
          {
            source: {
              buffer: Buffer.from(
                JSON.stringify(
                  buildExportManifest(
                    entry.request,
                    entry.vcrPath,
                    entry.logPath,
                  ),
                  null,
                  2,
                ),
              ),
            },
            entryName: entry.manifestEntryName,
          },
        ]),
      ],
      archivePath,
    );
  };

  it('reads an archive without unpacking it', async () => {
    await buildWeekendArchive();

    const { entries, totalUncompressedBytes } =
      await inspectArchive(archivePath);

    // Four sessions: replay, log and manifest each, plus the weekend manifest.
    expect(entries.filter((entry) => !entry.isDirectory)).toHaveLength(13);
    expect(totalUncompressedBytes).toBeGreaterThan(0);
  });

  it('unpacks every session into its own directory', async () => {
    await buildWeekendArchive();

    const { files, rejectedEntries } = await extractArchive(
      archivePath,
      unpackDirectory,
    );

    expect(rejectedEntries).toEqual([]);
    expect(files).toHaveLength(13);
    expect(
      existsSync(
        join(unpackDirectory, '01 Race - Daytona R1 2', 'Daytona R1 2.Vcr'),
      ),
    ).toBe(true);
    expect(existsSync(join(unpackDirectory, EXPORT_MANIFEST_NAME))).toBe(true);
  });

  /**
   * Byte-for-byte, not "the file is there".
   *
   * Counting progress with a 'data' listener on the read stream put it into
   * flowing mode before the pipeline attached its writable, and every chunk
   * that arrived in that window was dropped. Nothing errored: the files existed
   * at the right paths and were simply short, which showed up much later as a
   * .Vcr whose trailer would not parse. An existence check passes straight
   * through that; only comparing content catches it.
   */
  it('unpacks every file with its bytes intact', async () => {
    await buildWeekendArchive();
    await extractArchive(archivePath, unpackDirectory);

    for (const race of races) {
      const extractedReplay = readFileSync(
        join(
          unpackDirectory,
          `0${races.indexOf(race) + 1} Race - ${race.replayName}`,
          `${race.replayName}.Vcr`,
        ),
      );
      const originalReplay = readFileSync(
        join(sourceDirectory, `${race.replayName}.Vcr`),
      );

      expect(extractedReplay.length).toBe(originalReplay.length);
      expect(extractedReplay.equals(originalReplay)).toBe(true);
    }

    // The manifest is the smallest file in the archive and the first written,
    // so it is where a lost leading chunk shows up first.
    expect(
      JSON.parse(
        readFileSync(join(unpackDirectory, EXPORT_MANIFEST_NAME), 'utf-8'),
      ),
    ).toMatchObject({ createdBy: 'lmu-steward', kind: 'weekend' });
  });

  it('reports extraction progress up to the archive total', async () => {
    await buildWeekendArchive();

    const reported: number[] = [];
    await extractArchive(archivePath, unpackDirectory, ({ bytesWritten }) =>
      reported.push(bytesWritten),
    );

    const { totalUncompressedBytes } = await inspectArchive(archivePath);

    expect(reported.length).toBeGreaterThan(0);
    expect([...reported].sort((a, b) => a - b)).toEqual(reported);
    expect(reported[reported.length - 1]).toBe(totalUncompressedBytes);
  });

  /**
   * The case the whole manifest path exists for. Without it these four rows
   * are indistinguishable; with it every one lands on its own log.
   */
  it('pairs a restarted-race weekend from the manifest alone', async () => {
    await buildWeekendArchive();
    await extractArchive(archivePath, unpackDirectory);

    const { rows, manifestSessionCount, omittedSessions } =
      await scanImportSource({
        sourceDirectory: unpackDirectory,
        imported: {},
      });

    expect(manifestSessionCount).toBe(4);
    expect(rows).toHaveLength(4);

    for (const row of rows) {
      expect(row.pairing.reason).toBe('manifest');
      expect(row.manifest?.timestamp).toBe(EVENT_TIME);

      const expected = races.find((race) => race.replayName === row.replayName);
      expect(basename(row.pairing.proposed!.candidate.filePath)).toBe(
        expected!.log,
      );
    }

    // A partial weekend has to stay distinguishable from a complete one.
    expect(omittedSessions).toHaveLength(1);
    expect(omittedSessions[0].replayName).toBe('Daytona P1 4');
  });

  /**
   * The same weekend without its manifests. Nothing automatic can separate
   * these, and the scan has to say so rather than propose one at random.
   */
  it('reports a restarted-race weekend as ambiguous with no manifest', async () => {
    const { rows, manifestSessionCount } = await scanImportSource({
      sourceDirectory,
      imported: {},
    });

    expect(manifestSessionCount).toBe(0);
    expect(rows).toHaveLength(4);

    for (const row of rows) {
      expect(row.pairing.reason).toBe('ambiguous');
      expect(row.pairing.proposed).toBeNull();
      // Every candidate is still offered, so the user can pick.
      expect(row.pairing.ranked).toHaveLength(4);
    }
  });

  /**
   * Most files a steward receives did not come from this app, so the manifest
   * path must be an addition rather than a requirement.
   */
  it('still pairs by roster when there is no manifest at all', async () => {
    const other = join(root, 'other');
    mkdirSync(other, { recursive: true });

    writeFileSync(
      join(other, 'Daytona R1 9.Vcr'),
      buildVcr('DAYTONA', 'RACE', GRID),
    );
    writeFileSync(
      join(other, 'race.xml'),
      buildLog(EVENT_TIME, EVENT_TIME, 'Race', GRID),
    );
    writeFileSync(
      join(other, 'different-race.xml'),
      buildLog(EVENT_TIME, EVENT_TIME, 'Race', [
        'Zach Nine',
        'Yara Ten',
        'Xena Eleven',
        'Walt Twelve',
      ]),
    );

    const { rows } = await scanImportSource({
      sourceDirectory: other,
      imported: {},
    });

    expect(rows[0].pairing.reason).toBe('proposed');
    expect(rows[0].pairing.proposed?.candidate.fileName).toBe('race.xml');
    expect(rows[0].manifest).toBeNull();
  });

  /**
   * A manifest whose files were renamed after export is worse than none: it
   * would propose a log that is not there. Scoring has to take back over.
   */
  it('falls back to scoring when a manifest names a missing log', async () => {
    await buildWeekendArchive();
    await extractArchive(archivePath, unpackDirectory);

    rmSync(join(unpackDirectory, '01 Race - Daytona R1 2', races[0].log), {
      force: true,
    });

    const { rows, manifestSessionCount } = await scanImportSource({
      sourceDirectory: unpackDirectory,
      imported: {},
    });

    const orphaned = rows.find((row) => row.replayName === 'Daytona R1 2');

    expect(manifestSessionCount).toBe(3);
    expect(orphaned?.manifest).toBeNull();
    expect(orphaned?.pairing.reason).toBe('ambiguous');
  });

  it('reads a flat single-session archive', async () => {
    const vcrPath = join(sourceDirectory, `${races[0].replayName}.Vcr`);
    const logPath = join(sourceDirectory, races[0].log);
    const flatArchive = join(root, 'session.zip');

    await writeArchive(
      [
        { source: { filePath: vcrPath }, entryName: basename(vcrPath) },
        { source: { filePath: logPath }, entryName: basename(logPath) },
        {
          source: {
            buffer: Buffer.from(
              JSON.stringify(
                buildExportManifest(
                  {
                    hash: 'h',
                    replayName: races[0].replayName,
                    sceneDesc: 'DAYTONA',
                    session: 'RACE',
                    timestamp: EVENT_TIME,
                    logDataFileName: races[0].log,
                  },
                  vcrPath,
                  logPath,
                ),
              ),
            ),
          },
          entryName: EXPORT_MANIFEST_NAME,
        },
      ],
      flatArchive,
    );

    await extractArchive(flatArchive, unpackDirectory);

    const { rows, manifestSessionCount } = await scanImportSource({
      sourceDirectory: unpackDirectory,
      imported: {},
    });

    // A version 1 manifest carries no `kind`; its absence means "session".
    expect(manifestSessionCount).toBe(1);
    expect(rows[0].pairing.reason).toBe('manifest');
    expect(rows[0].manifest?.timestamp).toBe(EVENT_TIME);
  });

  it('ignores a manifest that is not ours, or will not parse', async () => {
    writeFileSync(
      join(sourceDirectory, EXPORT_MANIFEST_NAME),
      '{ this is not json',
    );

    expect(
      await readManifestFile(join(sourceDirectory, EXPORT_MANIFEST_NAME)),
    ).toBeNull();

    writeFileSync(
      join(sourceDirectory, EXPORT_MANIFEST_NAME),
      JSON.stringify({ createdBy: 'something-else', vcrFileName: 'a.Vcr' }),
    );

    expect(
      await readManifestFile(join(sourceDirectory, EXPORT_MANIFEST_NAME)),
    ).toBeNull();
  });

  /**
   * A manifest is data from elsewhere. A file name carrying a separator would
   * point the import at a file outside the archive entirely.
   */
  it('scans the fixture hand-off and reports why each row is where it is', async () => {
    // Deliberately part of the bulk describe so it shares the temp root, but
    // gated: the fixture set is local-only and its absence is not a regression.
    if (!existsSync(FIXTURE_REPLAYS)) {
      return;
    }

    const { rows } = await scanImportSource({
      sourceDirectory: FIXTURE_REPLAYS,
      existingLogDirectory: FIXTURE_RESULTS,
      imported: {},
    });

    const byName = Object.fromEntries(rows.map((row) => [row.replayName, row]));

    // The .tmp in-progress recording is not an importable replay.
    expect(
      rows.some((row) => row.vcrFileName.toLowerCase().endsWith('.tmp')),
    ).toBe(false);

    /*
     * Two events at one track on one evening. The 40- and 33-driver grids are
     * what separate them; the date and the track cannot.
     */
    expect(
      byName['Autodromo Nazionale Monza P1 12']?.pairing.proposed,
    ).not.toBeNull();
    expect(
      byName['Autodromo Nazionale Monza Q1 1']?.pairing.proposed,
    ).not.toBeNull();

    /*
     * One- and two-name rosters cannot discriminate, so these decline rather
     * than propose. Reported, not hidden — the user pairs them by hand.
     */
    for (const name of [
      'Autodromo Nazionale Monza P1 9',
      'Autodromo Nazionale Monza P1 10',
      'Autodromo Nazionale Monza P1 11',
    ]) {
      expect(byName[name]?.pairing.proposed).toBeNull();
      expect(byName[name]?.pairing.reason).toBe('roster-too-small');
    }

    // No hand-off has a manifest unless it came from this app.
    expect(rows.every((row) => row.manifest === null)).toBe(true);
  });

  it('refuses manifest entries whose names are paths', async () => {
    writeFileSync(
      join(sourceDirectory, EXPORT_MANIFEST_NAME),
      JSON.stringify({
        createdBy: 'lmu-steward',
        version: 2,
        kind: 'weekend',
        sessions: [
          {
            directory: '../../elsewhere',
            vcrFileName: 'a.Vcr',
            logFileName: 'a.xml',
          },
          {
            directory: 'ok',
            vcrFileName: '..\\..\\Windows\\evil.Vcr',
            logFileName: 'a.xml',
          },
        ],
        omittedSessions: [],
      }),
    );

    const { sessions } = await scanManifests(sourceDirectory);

    expect(sessions.size).toBe(0);
  });

  /*
   * The capture riding along with a replay.
   *
   * Two separate things are checked here because they can disagree. The import
   * restores whatever file is beside the .Vcr, so the preview has to report
   * presence from the same place — reading it off the manifest instead would
   * let the dialog promise evidence that is no longer in the hand-off.
   */
  describe('captured sessions travelling with a replay', () => {
    const liveDataFor = (replayName: string) =>
      JSON.stringify({
        version: 1,
        session: { sessionKey: `live|Daytona|1|${EVENT_TIME}` },
        incidents: [],
        includesTelemetry: true,
        replayName,
      });

    const writeSessionManifest = (
      directory: string,
      vcrPath: string,
      logPath: string,
      liveData: { includesTelemetry: boolean } | null,
    ) =>
      writeFileSync(
        join(directory, EXPORT_MANIFEST_NAME),
        JSON.stringify(
          buildExportManifest(
            {
              hash: 'h',
              replayName: races[0].replayName,
              sceneDesc: 'DAYTONA',
              session: 'RACE',
              timestamp: EVENT_TIME,
              logDataFileName: basename(logPath),
            },
            vcrPath,
            logPath,
            liveData,
          ),
        ),
      );

    it('reports the capture and the telemetry the manifest declared', async () => {
      await buildWeekendArchive();
      await extractArchive(archivePath, unpackDirectory);

      const sessionDirectory = join(unpackDirectory, '01 Race - Daytona R1 2');

      writeFileSync(
        join(sessionDirectory, 'lmu-steward-live.json'),
        liveDataFor(races[0].replayName),
      );
      writeSessionManifest(
        sessionDirectory,
        join(sessionDirectory, `${races[0].replayName}.Vcr`),
        join(sessionDirectory, races[0].log),
        { includesTelemetry: true },
      );

      const { rows } = await scanImportSource({
        sourceDirectory: unpackDirectory,
        imported: {},
      });

      const carrying = rows.find(
        (row) => row.replayName === races[0].replayName,
      );

      expect(carrying?.liveData).toEqual({ includesTelemetry: true });
      // Every other session in the weekend brought nothing.
      expect(
        rows
          .filter((row) => row.replayName !== races[0].replayName)
          .every((row) => row.liveData === null),
      ).toBe(true);
    });

    it('records telemetry as declined when the manifest says so', async () => {
      writeFileSync(
        join(sourceDirectory, 'lmu-steward-live.json'),
        liveDataFor(races[0].replayName),
      );
      writeSessionManifest(
        sourceDirectory,
        join(sourceDirectory, `${races[0].replayName}.Vcr`),
        join(sourceDirectory, races[0].log),
        { includesTelemetry: false },
      );

      const { rows } = await scanImportSource({
        sourceDirectory,
        imported: {},
      });

      expect(
        rows.find((row) => row.replayName === races[0].replayName)?.liveData,
      ).toEqual({ includesTelemetry: false });
    });

    /**
     * A capture with no manifest to describe it. Presence is still reported —
     * the restore will find the file regardless — but nothing is asserted
     * about telemetry, because nothing said.
     */
    it('leaves telemetry unknown when no manifest describes the capture', async () => {
      writeFileSync(
        join(sourceDirectory, 'lmu-steward-live.json'),
        liveDataFor(races[0].replayName),
      );

      const { rows } = await scanImportSource({
        sourceDirectory,
        imported: {},
      });

      expect(
        rows.every((row) => row.liveData?.includesTelemetry === null),
      ).toBe(true);
    });

    /**
     * The disagreement that matters. A manifest naming a capture that is no
     * longer in the hand-off must not produce a preview promising one, because
     * the restore reads the file and would find nothing.
     */
    it('reports no capture when the manifest names one that is absent', async () => {
      writeSessionManifest(
        sourceDirectory,
        join(sourceDirectory, `${races[0].replayName}.Vcr`),
        join(sourceDirectory, races[0].log),
        { includesTelemetry: true },
      );

      const { rows } = await scanImportSource({
        sourceDirectory,
        imported: {},
      });

      expect(rows.every((row) => row.liveData === null)).toBe(true);
    });
  });
});
