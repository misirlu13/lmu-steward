import { SessionExport, SessionExportIncident } from './sessionExportModel';

/**
 * Three serializations of one session record.
 *
 * All of them are pure string builders so they can be unit tested and so the
 * clipboard path and the file path produce byte-identical output.
 */

export type SessionExportFormat = 'csv' | 'markdown' | 'json';

/**
 * Excel assumes the system code page for a bare .csv, which mangles the
 * accented driver names LMU emits as UTF-8 (`José María López`). A BOM is the
 * only thing that reliably makes it read the file correctly.
 */
export const UTF8_BOM = '﻿';

/**
 * RFC 4180 quoting. LMU driver names are user-supplied and routinely contain
 * commas, quotes and hashes (`S F#7575`), so nothing here can assume a value is
 * safe to drop in unquoted.
 */
export const csvCell = (value: unknown): string => {
  if (value === undefined || value === null) {
    return '';
  }

  const text = String(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
};

const csvRow = (cells: unknown[]): string => cells.map(csvCell).join(',');

/**
 * LMU's `<TrackEvent>` is a real event name in some logs ("6 Hours of
 * Spa-Francorchamps") and simply the track name in others. Only the first is
 * worth showing — repeating the track under a different label reads like two
 * facts where there is one.
 */
const distinctEvent = (data: SessionExport): string | undefined =>
  data.session.event && data.session.event !== data.session.track
    ? data.session.event
    : undefined;

const incidentDriverNames = (incident: SessionExportIncident): string =>
  incident.drivers.map((driver) => driver.displayName).join(' / ');

const incidentDriverIds = (incident: SessionExportIncident): string =>
  incident.drivers.map((driver) => driver.driverId ?? '').join(' / ');

const typeLabels: Record<SessionExportIncident['type'], string> = {
  collision: 'Collision',
  'track-limit': 'Track limits',
  penalty: 'Penalty',
};

/**
 * A session has two natural tables, so a single flat sheet would either
 * duplicate the standings against every incident or lose one of them. They are
 * emitted as two labelled blocks in one file, which every spreadsheet imports
 * without complaint.
 */
export const toSessionCsv = (data: SessionExport): string => {
  const lines: string[] = [];

  lines.push(csvRow(['LMU Steward session export']));
  lines.push(csvRow(['Generated', data.generatedAt]));
  lines.push(csvRow(['Track', data.session.track]));
  const csvEvent = distinctEvent(data);
  if (csvEvent) {
    lines.push(csvRow(['Event', csvEvent]));
  }
  lines.push(csvRow(['Session', data.session.sessionType]));
  lines.push(csvRow(['Setting', data.session.setting ?? '']));
  lines.push(csvRow(['Date', data.session.date ?? '']));
  if (data.session.dedicated !== undefined) {
    lines.push(
      csvRow(['Dedicated server', data.session.dedicated ? 'yes' : 'no']),
    );
  }
  // Only ever populated on a hosted server; an empty row reads as missing data
  // rather than as "there was no server name to report".
  if (data.session.serverName) {
    lines.push(csvRow(['Server', data.session.serverName]));
  }
  lines.push(csvRow(['Laps completed', data.session.lapsCompleted]));
  lines.push(csvRow(['Drivers', data.session.driverCount]));
  lines.push(
    csvRow([
      'Incidents',
      data.counts.total,
      `${data.counts.collisions} collisions`,
      `${data.counts.trackLimits} track limits`,
      `${data.counts.penalties} penalties`,
    ]),
  );
  lines.push('');

  lines.push(csvRow(['STANDINGS']));
  lines.push(
    csvRow([
      'Position',
      'Started',
      'Driver',
      'Driver ID',
      'Slot',
      'Team',
      'Car',
      'Class',
      'Fastest lap',
      'Incidents',
      'AI',
    ]),
  );
  data.standings.forEach((driver) => {
    lines.push(
      csvRow([
        driver.position,
        driver.startingPosition ?? '',
        driver.driverName,
        driver.driverId ?? '',
        driver.slotId ?? '',
        driver.teamName,
        driver.carName,
        driver.carClass,
        driver.fastestLap,
        driver.incidents,
        driver.isAiDriver ? 'yes' : 'no',
      ]),
    );
  });
  lines.push('');

  lines.push(csvRow(['INCIDENTS']));
  lines.push(
    csvRow([
      'Time',
      'Lap',
      'Elapsed seconds',
      'Type',
      'Severity',
      'Drivers',
      'Driver IDs',
      'Description',
    ]),
  );
  data.incidents.forEach((incident) => {
    lines.push(
      csvRow([
        incident.timestampLabel,
        incident.lapLabel,
        incident.etSeconds ?? '',
        typeLabels[incident.type],
        incident.severity ?? '',
        incidentDriverNames(incident),
        incidentDriverIds(incident),
        incident.description,
      ]),
    );
  });

  lines.push('');
  lines.push(csvRow(['DECISIONS']));
  lines.push(
    csvRow([
      'Decided at',
      'Driver',
      'Steam ID',
      'Outcome',
      'Basis',
      'State',
      'Status',
      'Lap',
      'Elapsed seconds',
      'Steward',
      'Revisions',
      'Reasoning',
    ]),
  );
  if (data.decisions.length === 0) {
    lines.push(csvRow(['No steward decisions were recorded.']));
  }
  data.decisions.forEach((decision) => {
    lines.push(
      csvRow([
        new Date(decision.decidedAt).toISOString(),
        decision.driverName ?? '',
        decision.driverSteamId ?? '',
        decision.outcome ?? '',
        decision.basis,
        decision.state,
        decision.status,
        decision.lapLabel ?? '',
        decision.etSeconds ?? '',
        decision.stewardAuthor,
        decision.revisionCount,
        decision.reasoning ?? '',
      ]),
    );
  });

  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`;
};

/** Pipes would otherwise break out of the cell they are in. */
const mdCell = (value: unknown): string =>
  String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ');

/**
 * The publication format. Leagues post stewarding output to Discord and forums,
 * so this is expected to see more real use than any file format.
 */
export const toSessionMarkdown = (data: SessionExport): string => {
  const lines: string[] = [];

  // The event name reads far better at the top of a published report than the
  // track does: "6 Hours of Spa-Francorchamps" rather than "Spa-Francorchamps".
  const heading = [
    distinctEvent(data) ?? data.session.track,
    data.session.sessionType,
  ]
    .filter(Boolean)
    .join(' — ');
  lines.push(`# ${heading || 'Session report'}`);
  lines.push('');

  const facts: string[] = [];
  if (data.session.date) {
    facts.push(`**Date:** ${data.session.date.slice(0, 10)}`);
  }
  if (distinctEvent(data) && data.session.track) {
    facts.push(`**Track:** ${data.session.track}`);
  }
  // Built from both parts rather than as a suffix on the setting, so a log that
  // reports a dedicated server without a setting does not drop it silently.
  const settingParts = [
    data.session.setting,
    data.session.dedicated ? 'dedicated server' : undefined,
  ].filter(Boolean);
  if (settingParts.length > 0) {
    facts.push(`**Setting:** ${settingParts.join(' · ')}`);
  }
  if (data.session.serverName) {
    facts.push(`**Server:** ${data.session.serverName}`);
  }
  facts.push(`**Laps:** ${data.session.lapsCompleted}`);
  facts.push(`**Drivers:** ${data.session.driverCount}`);
  lines.push(facts.join(' · '));
  lines.push('');

  lines.push(
    `**Incidents:** ${data.counts.total} — ${data.counts.collisions} collisions, ${data.counts.trackLimits} track limits, ${data.counts.penalties} penalties`,
  );
  lines.push('');

  lines.push('## Standings');
  lines.push('');
  lines.push('| Pos | Driver | Team | Car | Class | Fastest lap | Inc |');
  lines.push('| ---: | --- | --- | --- | --- | --- | ---: |');
  data.standings.forEach((driver) => {
    lines.push(
      `| ${driver.position} | ${mdCell(driver.driverName)}${
        driver.isAiDriver ? ' _(AI)_' : ''
      } | ${mdCell(driver.teamName)} | ${mdCell(driver.carName)} | ${mdCell(
        driver.carClass,
      )} | ${mdCell(driver.fastestLap)} | ${driver.incidents} |`,
    );
  });
  lines.push('');

  lines.push('## Incidents');
  lines.push('');
  if (data.incidents.length === 0) {
    lines.push('_No incidents were recorded in this session._');
  } else {
    lines.push('| Time | Lap | Type | Drivers | Description |');
    lines.push('| --- | --- | --- | --- | --- |');
    data.incidents.forEach((incident) => {
      lines.push(
        `| ${mdCell(incident.timestampLabel)} | ${mdCell(
          incident.lapLabel,
        )} | ${typeLabels[incident.type]} | ${mdCell(
          incidentDriverNames(incident),
        )} | ${mdCell(incident.description)} |`,
      );
    });
  }
  lines.push('');
  lines.push('## Steward decisions');
  lines.push('');
  if (data.decisions.length === 0) {
    lines.push('_No steward decisions were recorded for this session._');
  } else {
    lines.push('| Lap | Driver | Decision | Steward | Status | Reasoning |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    data.decisions.forEach((decision) => {
      lines.push(
        `| ${mdCell(decision.lapLabel ?? '')} | ${mdCell(
          // An incident-scoped finding has no driver, and saying so is more
          // honest than leaving the cell blank.
          decision.driverName ?? '_(incident)_',
        )} | ${mdCell(decision.outcome ?? decision.state)} | ${mdCell(
          decision.stewardAuthor,
        )} | ${mdCell(decision.status)}${
          decision.revisionCount > 1 ? ` (rev ${decision.revisionCount})` : ''
        } | ${mdCell(decision.reasoning ?? '')} |`,
      );
    });
  }

  lines.push('');
  lines.push(
    `_Exported from LMU Steward on ${data.generatedAt.slice(0, 10)}._`,
  );

  return `${lines.join('\n')}\n`;
};

/** For programmatic import into a league's own database. */
export const toSessionJson = (data: SessionExport): string =>
  `${JSON.stringify(data, null, 2)}\n`;

export const serializeSessionExport = (
  data: SessionExport,
  format: SessionExportFormat,
): string => {
  if (format === 'csv') {
    return toSessionCsv(data);
  }
  if (format === 'markdown') {
    return toSessionMarkdown(data);
  }
  return toSessionJson(data);
};

const FILE_EXTENSIONS: Record<SessionExportFormat, string> = {
  csv: 'csv',
  markdown: 'md',
  json: 'json',
};

/**
 * Suggested name only — the main process owns the actual path. Anything that
 * could confuse a shell or a filesystem is stripped rather than escaped.
 */
export const sessionExportFileName = (
  data: SessionExport,
  format: SessionExportFormat,
): string => {
  const parts = [data.session.track, data.session.sessionType]
    .filter(Boolean)
    .join('-');

  const slug =
    parts
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'session';

  const date = (data.session.date ?? data.generatedAt).slice(0, 10);

  return `${slug}-${date}.${FILE_EXTENSIONS[format]}`;
};
