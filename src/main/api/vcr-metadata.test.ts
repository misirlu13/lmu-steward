/*
 * The synthetic replays below are built byte for byte from the layout observed
 * in real .Vcr files, so this suite runs anywhere. `fixture-test-set/` holds the
 * nine real replays a steward sent in, but it is gitignored — the block that
 * uses it is skipped rather than failed when it is not present.
 */
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readVcrTrailer, readVcrTrailerResult } from './vcr-metadata';

const MAGIC_OFFSET = 0x2c;
const POINTER_OFFSET = 0x35;
const HEADER_LENGTH = 0x40;

/*
 * Lengths count bytes, not characters, and the encoding is UTF-8 — an accented
 * name is longer on disk than in JavaScript.
 */
const lengthPrefixed = (value: string): Buffer => {
  const body = Buffer.from(value, 'utf8');
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(body.length, 0);
  return Buffer.concat([prefix, body]);
};

/** uint8 length-prefixed, as the driver entry fields are stored. */
const bytePrefixed = (value: string): Buffer => {
  const body = Buffer.from(value, 'utf8');
  return Buffer.concat([Buffer.from([body.length]), body]);
};

interface SyntheticDriver {
  name: string;
  vehicleId: string;
  contentId: string;
  teamName: string;
  carNumber: string;
}

interface SyntheticReplay {
  sceneDesc: string;
  session: string;
  /**
   * Format 8 wraps the scene and session in a larger object describing the
   * official event, with sceneDesc no longer the first key.
   */
  officialEvent?: boolean;
  trackFolder?: string;
  trackVersion?: string;
  installPath?: string;
  drivers?: SyntheticDriver[];
  /** Overrides the header pointer, to exercise the fallback scan. */
  pointerOverride?: number;
  corruptMagic?: boolean;
}

const buildVcr = (replay: SyntheticReplay): Buffer => {
  const {
    sceneDesc,
    session,
    trackFolder = 'Monza_2023',
    trackVersion = '1.27',
    installPath = 'C:\\Games\\Le Mans Ultimate\\Installed\\Locations\\Monza_2023\\1.27\\',
    drivers = [],
  } = replay;

  const metadataBlob = replay.officialEvent
    ? JSON.stringify({
        eventId: '1edc8e7e-48c1-405f-83c6-d52b4142ea99',
        eventTitle: 'LMGT3 Sprint Cup',
        eventType: 'daily',
        sceneDesc,
        seriesId: '2f3e32e6-41e1-471c-9a85-6151c736ed4a',
        session,
        splitNo: 3,
      })
    : JSON.stringify({ sceneDesc, session });

  const trailer = Buffer.concat([
    lengthPrefixed(metadataBlob),
    lengthPrefixed(`${sceneDesc}.SCN`),
    lengthPrefixed(`${sceneDesc}.AIW`),
    lengthPrefixed(trackFolder),
    lengthPrefixed(trackVersion),
    lengthPrefixed(
      '8cd7325da1ec405aa0358a60a7d79fc1616b05041491164ae829aa48848609a2',
    ),
    lengthPrefixed(installPath),
    // Binary run between the string fields and the driver count.
    Buffer.alloc(24),
  ]);

  const driverCount = Buffer.alloc(4);
  driverCount.writeUInt32LE(drivers.length, 0);

  const driverBlock = Buffer.concat([
    driverCount,
    Buffer.from([0x00]),
    ...drivers.map((driver) =>
      Buffer.concat([
        bytePrefixed(driver.name),
        bytePrefixed(driver.vehicleId),
        bytePrefixed(driver.contentId),
        bytePrefixed(driver.teamName),
        bytePrefixed(driver.carNumber),
        // Fixed binary run separating entries, 28 bytes in real replays.
        Buffer.alloc(28),
      ]),
    ),
  ]);

  // Stand-in for the frame data a real replay carries.
  const body = Buffer.alloc(512, 0x41);
  const header = Buffer.alloc(HEADER_LENGTH);
  header.write('//[[gMb1.002f (c)2016    ]] [[          ]]', 0, 'latin1');
  header[MAGIC_OFFSET] = 0x0a;
  header.write(
    replay.corruptMagic ? 'XXXX' : 'IRSR',
    MAGIC_OFFSET + 1,
    'latin1',
  );

  const trailerOffset = header.length + body.length;
  header.writeUInt32LE(replay.pointerOverride ?? trailerOffset, POINTER_OFFSET);

  return Buffer.concat([header, body, trailer, driverBlock]);
};

const MONZA_DRIVERS: SyntheticDriver[] = [
  {
    name: 'Sergey Kukish',
    vehicleId: '13_25_AWA_ED386DBB',
    contentId: '',
    teamName: 'Sergey Kukish',
    carNumber: '999',
  },
  {
    name: 'Artyom Manisha',
    vehicleId: '397_26_Z06GT3R',
    contentId: '6a2dd3936d4ef24dd46513a6',
    teamName: 'Artyom Manisha',
    carNumber: '46',
  },
  {
    /*
     * Accents and a shorter content id together. Both were rejected outright
     * before, and either one takes the whole roster down with it — one bad
     * entry ends the walk.
     */
    name: 'Sébastien Buemi',
    vehicleId: '59_25_RSL_DF69FBFB',
    contentId: '6971afbaff2181d017c969',
    teamName: 'Racing Spirit of Léman 2025 #59',
    carNumber: '23',
  },
  {
    // A solo player on base content: the team name is the manufacturer, not a
    // repeat of the driver's name.
    name: 'Pedro Couceiro',
    vehicleId: '992S_PC',
    contentId: '',
    teamName: 'Porsche',
    carNumber: '00',
  },
];

describe('main/vcr metadata', () => {
  let dir: string;

  const writeReplay = (fileName: string, replay: SyntheticReplay): string => {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, buildVcr(replay));
    return filePath;
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'lmu-steward-vcr-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads scene, session and track content from the trailer', async () => {
    const filePath = writeReplay('race.Vcr', {
      sceneDesc: 'MONZAWEC',
      session: 'RACE',
    });

    const trailer = await readVcrTrailer(filePath);

    expect(trailer).toMatchObject({
      sceneDesc: 'MONZAWEC',
      session: 'RACE',
      trackScene: 'MONZAWEC.SCN',
      trackAiw: 'MONZAWEC.AIW',
      trackFolder: 'Monza_2023',
      trackVersion: '1.27',
    });
    expect(trailer?.originInstallPath).toContain('Le Mans Ultimate');
  });

  it('reads names and teams containing accents', async () => {
    const filePath = writeReplay('accented.Vcr', {
      sceneDesc: 'SILVERSTONEELMS',
      session: 'RACE',
      drivers: MONZA_DRIVERS,
    });

    const trailer = await readVcrTrailer(filePath);

    const accented = trailer?.drivers.find((driver) =>
      driver.name.startsWith('Séb'),
    );

    expect(accented?.name).toBe('Sébastien Buemi');
    expect(accented?.teamName).toBe('Racing Spirit of Léman 2025 #59');
    // Decoded as UTF-8, not latin1 — "LÃ©man" would mean the wrong codec.
    expect(accented?.teamName).not.toContain('Ã');
  });

  it('accepts content ids that are not 24 characters', async () => {
    const filePath = writeReplay('shortcontentid.Vcr', {
      sceneDesc: 'SILVERSTONEELMS',
      session: 'RACE',
      drivers: MONZA_DRIVERS,
    });

    const trailer = await readVcrTrailer(filePath);

    // A rejected entry ends the walk, so the count is the real assertion here.
    expect(trailer?.drivers).toHaveLength(MONZA_DRIVERS.length);
    expect(
      trailer?.drivers.some((driver) => driver.contentId.length === 22),
    ).toBe(true);
  });

  it('reads the driver roster, including entries whose team is not the driver', async () => {
    const filePath = writeReplay('roster.Vcr', {
      sceneDesc: 'MONZAWEC',
      session: 'RACE',
      drivers: MONZA_DRIVERS,
    });

    const trailer = await readVcrTrailer(filePath);

    expect(trailer?.drivers).toEqual(MONZA_DRIVERS);
  });

  /**
   * The format that broke in the wild. Anchoring on the blob starting with
   * `{"sceneDesc"` meant every replay from a current LMU build was rejected as
   * unreadable — the fixture set is all format 7, so nothing caught it.
   */
  it('reads an official-event replay whose blob does not start with sceneDesc', async () => {
    const filePath = writeReplay('official.Vcr', {
      sceneDesc: 'LAGUNASECA',
      session: 'RACE',
      officialEvent: true,
      drivers: MONZA_DRIVERS,
    });

    const trailer = await readVcrTrailer(filePath);

    expect(trailer).toMatchObject({
      sceneDesc: 'LAGUNASECA',
      session: 'RACE',
      eventTitle: 'LMGT3 Sprint Cup',
      eventType: 'daily',
      splitNo: 3,
    });
    expect(trailer?.drivers).toHaveLength(MONZA_DRIVERS.length);
  });

  it('leaves event fields unset on a replay that has none', async () => {
    const filePath = writeReplay('plain-event.Vcr', {
      sceneDesc: 'MONZAWEC',
      session: 'RACE',
    });

    const trailer = await readVcrTrailer(filePath);

    expect(trailer?.eventTitle).toBeUndefined();
    expect(trailer?.splitNo).toBeUndefined();
  });

  it('falls back to scanning for an official-event blob too', async () => {
    const filePath = writeReplay('official-badpointer.Vcr', {
      sceneDesc: 'LAGUNASECA',
      session: 'QUALIFY',
      officialEvent: true,
      pointerOverride: 0xfffffff,
      drivers: MONZA_DRIVERS,
    });

    const trailer = await readVcrTrailer(filePath);

    expect(trailer?.sceneDesc).toBe('LAGUNASECA');
    expect(trailer?.session).toBe('QUALIFY');
  });

  it('falls back to scanning when the header pointer is unusable', async () => {
    const filePath = writeReplay('badpointer.Vcr', {
      sceneDesc: 'SPAWEC',
      session: 'QUALIFY',
      pointerOverride: 0xfffffff,
      drivers: MONZA_DRIVERS,
    });

    const trailer = await readVcrTrailer(filePath);

    expect(trailer?.sceneDesc).toBe('SPAWEC');
    expect(trailer?.drivers).toHaveLength(MONZA_DRIVERS.length);
  });

  it('returns null when the magic does not match', async () => {
    const filePath = writeReplay('notareplay.Vcr', {
      sceneDesc: 'MONZAWEC',
      session: 'RACE',
      corruptMagic: true,
    });

    expect(await readVcrTrailer(filePath)).toBeNull();
  });

  it('returns null for a truncated file', async () => {
    const filePath = join(dir, 'truncated.Vcr');
    writeFileSync(filePath, Buffer.alloc(16));

    expect(await readVcrTrailer(filePath)).toBeNull();
  });

  it('returns null for a file with no trailer at all', async () => {
    const filePath = join(dir, 'headeronly.Vcr');
    const header = Buffer.alloc(HEADER_LENGTH);
    header[MAGIC_OFFSET] = 0x0a;
    header.write('IRSR', MAGIC_OFFSET + 1, 'latin1');
    header.writeUInt32LE(0, POINTER_OFFSET);
    writeFileSync(filePath, Buffer.concat([header, Buffer.alloc(4096)]));

    expect(await readVcrTrailer(filePath)).toBeNull();
  });

  it('returns null for a missing file rather than throwing', async () => {
    expect(await readVcrTrailer(join(dir, 'does-not-exist.Vcr'))).toBeNull();
  });

  /**
   * A corrupt length prefix must be rejected on its face. If the cap were not
   * enforced, this would attempt a 4 GB read against a 4 KB file.
   */
  it('rejects an absurd length prefix without over-allocating', async () => {
    const filePath = join(dir, 'absurd.Vcr');
    const header = Buffer.alloc(HEADER_LENGTH);
    header[MAGIC_OFFSET] = 0x0a;
    header.write('IRSR', MAGIC_OFFSET + 1, 'latin1');
    header.writeUInt32LE(HEADER_LENGTH, POINTER_OFFSET);

    const absurd = Buffer.alloc(4096);
    absurd.writeUInt32LE(0xffffffff, 0);
    writeFileSync(filePath, Buffer.concat([header, absurd]));

    expect(await readVcrTrailer(filePath)).toBeNull();
  });
});

/*
 * The nine replays from the real hand-off: two events at Monza on one evening,
 * one race recorded on two different PCs, and an in-progress .tmp recording.
 */
const REAL_REPLAY_DIR = join(
  __dirname,
  '../../../fixture-test-set/import-replay-data-set/Replays',
);

const describeWithRealFixtures = existsSync(REAL_REPLAY_DIR)
  ? describe
  : describe.skip;

describeWithRealFixtures('main/vcr metadata against real replays', () => {
  jest.setTimeout(120_000);

  /*
   * Files are skipped rather than failed when absent. This directory is a local
   * scratch area that gets renamed and shuffled while testing, and a missing
   * fixture is not a code regression.
   */
  it.each([
    ['Autodromo Nazionale Monza P1 9.Vcr', 'PRACTICE', 2],
    ['Autodromo Nazionale Monza P1 10.Vcr', 'PRACTICE', 2],
    ['Autodromo Nazionale Monza P1 11.Vcr', 'PRACTICE', 2],
    ['Autodromo Nazionale Monza P1 12.Vcr', 'PRACTICE', 40],
    ['Autodromo Nazionale Monza P1 13.Vcr', 'PRACTICE', 33],
    ['Autodromo Nazionale Monza Q1 1.Vcr', 'QUALIFY', 40],
    ['Autodromo Nazionale Monza Q1 2.Vcr', 'QUALIFY', 33],
    ['Autodromo Nazionale Monza R1 1.Vcr', 'RACE', 33],
    ['Autodromo Nazionale Monza R1 2.Vcr', 'RACE', 33],
  ])('reads %s', async (fileName, session, driverCount) => {
    if (!existsSync(join(REAL_REPLAY_DIR, fileName as string))) {
      return;
    }

    const trailer = await readVcrTrailer(join(REAL_REPLAY_DIR, fileName));

    expect(trailer?.sceneDesc).toBe('MONZAWEC');
    expect(trailer?.session).toBe(session);
    expect(trailer?.trackFolder).toBe('Monza_2023');
    expect(trailer?.drivers).toHaveLength(driverCount);
    expect(trailer?.drivers.every((driver) => driver.name.length > 0)).toBe(
      true,
    );
  });

  it('rejects the in-progress .tmp recording', async () => {
    const tmpRecording = readdirSync(REAL_REPLAY_DIR).find((file) =>
      file.endsWith('.tmp'),
    );

    expect(tmpRecording).toBeDefined();
    expect(
      await readVcrTrailer(join(REAL_REPLAY_DIR, tmpRecording!)),
    ).toBeNull();
  });

  /**
   * R1 1 came off a different PC than the rest — its trailer names an E:\ install
   * where the others name C:\. That is the signal that a steward has been sent
   * the same race recorded by two different drivers.
   */
  it('reads every replay in the directory', async () => {
    const replayFiles = readdirSync(REAL_REPLAY_DIR).filter((file) =>
      /\.vcr$/i.test(file),
    );

    expect(replayFiles.length).toBeGreaterThan(0);

    const trailers = await Promise.all(
      replayFiles.map((file) => readVcrTrailer(join(REAL_REPLAY_DIR, file))),
    );

    // Every real replay parses; a null here means the reader has regressed.
    expect(trailers.filter(Boolean)).toHaveLength(replayFiles.length);
    trailers.forEach((trailer) => {
      expect(trailer?.drivers.length).toBeGreaterThan(0);
    });
  });

  /**
   * One of these replays was recorded on a different PC than the rest — its
   * trailer names an E: install where the others name C:. That is the signal
   * that a steward has been sent the same race by two different drivers.
   */
  it('preserves the originating install path', async () => {
    const replayFiles = readdirSync(REAL_REPLAY_DIR).filter((file) =>
      /\.vcr$/i.test(file),
    );

    const installPaths = new Set(
      (
        await Promise.all(
          replayFiles.map((file) =>
            readVcrTrailer(join(REAL_REPLAY_DIR, file)),
          ),
        )
      )
        .map((trailer) => trailer?.originInstallPath)
        .filter(Boolean),
    );

    expect(installPaths.size).toBeGreaterThan(1);
  });
});

/*
 * Six different situations used to arrive as one message naming only the
 * rarest of them, which sent real debugging in the wrong direction twice.
 * Each of these is something the person who picked the file can act on, and
 * the action differs: wait, copy it again, or update the app.
 */
describe('main/vcr metadata failure reasons', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'lmu-steward-vcr-fail-'));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const writeRaw = (fileName: string, contents: Buffer): string => {
    const filePath = join(dir, fileName);
    writeFileSync(filePath, contents);
    return filePath;
  };

  const headerOnly = (pointer: number): Buffer => {
    const header = Buffer.alloc(HEADER_LENGTH);
    header[MAGIC_OFFSET] = 0x0a;
    header.write('IRSR', MAGIC_OFFSET + 1, 'latin1');
    header.writeUInt32LE(pointer, POINTER_OFFSET);
    return header;
  };

  it('reports a file that is not a replay', async () => {
    const result = await readVcrTrailerResult(
      writeRaw('notes.txt', Buffer.from('just some text, not a replay at all')),
    );

    expect(result).toMatchObject({ ok: false, reason: 'not-a-replay' });
  });

  it('reports a recording that is still in progress', async () => {
    const result = await readVcrTrailerResult(
      writeRaw(
        '_vcr7239104.tmp',
        Buffer.concat([headerOnly(0), Buffer.alloc(4096)]),
      ),
    );

    expect(result).toMatchObject({ ok: false, reason: 'still-recording' });
    expect((result as { message: string }).message).toMatch(
      /still being recorded/i,
    );
  });

  /**
   * Identical to an in-progress recording from inside the file — the trailer is
   * simply absent. Only the name separates them, so a .Vcr gets the advice that
   * actually helps: copy it again.
   */
  it('reports a replay whose trailer never arrived', async () => {
    const result = await readVcrTrailerResult(
      writeRaw(
        'Half Copied R1 1.Vcr',
        Buffer.concat([headerOnly(0), Buffer.alloc(4096)]),
      ),
    );

    expect(result).toMatchObject({ ok: false, reason: 'incomplete' });
    expect((result as { message: string }).message).toMatch(/finish copying/i);
  });

  it('reports a replay whose trailer is cut short', async () => {
    const partial = Buffer.concat([
      lengthPrefixed(
        JSON.stringify({ sceneDesc: 'MONZAWEC', session: 'RACE' }),
      ),
      lengthPrefixed('MONZAWEC.SCN'),
    ]);
    const header = headerOnly(HEADER_LENGTH);

    const result = await readVcrTrailerResult(
      writeRaw('Truncated R1 1.Vcr', Buffer.concat([header, partial])),
    );

    expect(result).toMatchObject({ ok: false, reason: 'incomplete' });
  });

  it('reports a metadata blob it does not understand', async () => {
    const trailer = Buffer.concat([
      // Scene is where it should be; the session type is one this app has
      // never heard of, which is what a newer LMU build would look like.
      lengthPrefixed(
        JSON.stringify({ sceneDesc: 'MONZAWEC', session: 'WARMUP' }),
      ),
      lengthPrefixed('MONZAWEC.SCN'),
      lengthPrefixed('MONZAWEC.AIW'),
      lengthPrefixed('Monza_2023'),
      lengthPrefixed('1.27'),
      lengthPrefixed('abc'),
      lengthPrefixed('C:/LMU/Installed/Locations/Monza_2023/1.27/'),
    ]);

    const result = await readVcrTrailerResult(
      writeRaw(
        'Future R1 1.Vcr',
        Buffer.concat([headerOnly(HEADER_LENGTH), trailer]),
      ),
    );

    expect(result).toMatchObject({ ok: false, reason: 'unsupported-format' });
    expect((result as { message: string }).message).toMatch(/newer version/i);
  });

  it('reports a file it cannot open', async () => {
    const result = await readVcrTrailerResult(join(dir, 'does-not-exist.Vcr'));

    expect(result).toMatchObject({ ok: false, reason: 'unreadable' });
  });

  it('still returns the trailer for a readable replay', async () => {
    const result = await readVcrTrailerResult(
      writeRaw(
        'good.Vcr',
        buildVcr({ sceneDesc: 'MONZAWEC', session: 'RACE' }),
      ),
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.trailer.sceneDesc).toBe('MONZAWEC');
  });

  it('keeps readVcrTrailer null for callers that only need to skip', async () => {
    expect(await readVcrTrailer(join(dir, 'does-not-exist.Vcr'))).toBeNull();
  });
});
