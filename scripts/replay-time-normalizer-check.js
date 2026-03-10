#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const toArray = (value) => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const parseScoreEtFromText = (scoreEntry) => {
  const sourceText = String(scoreEntry?._ ?? '');
  const match = sourceText.match(/\bet=([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1]) : Number.NaN;
};

const pickSessionData = (replay) => {
  const sessionType = replay?.metadata?.session;
  const logData = replay?.logData ?? {};

  if (sessionType === 'PRACTICE') {
    return logData.Practice1 ?? null;
  }

  if (sessionType === 'QUALIFY') {
    return logData.Qualify ?? logData.Qualifying ?? null;
  }

  return (
    logData.Race ??
    logData.Race1 ??
    logData.Race2 ??
    logData.Race3 ??
    logData.Race4 ??
    logData.Race5 ??
    logData.Race6 ??
    logData.Race7 ??
    logData.Race8 ??
    logData.Race9 ??
    logData.Race10 ??
    null
  );
};

const readJson = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content);
};

const toStandingsEntries = (raw) => {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (Array.isArray(raw?.entries)) {
    return raw.entries;
  }

  if (Array.isArray(raw?.data?.entries)) {
    return raw.data.entries;
  }

  return [];
};

const getReplay = (rawReplay) => {
  if (Array.isArray(rawReplay)) {
    return rawReplay[0] ?? null;
  }

  if (rawReplay && typeof rawReplay === 'object' && rawReplay.metadata) {
    return rawReplay;
  }

  return null;
};

const compute = (replay, standingsPayload) => {
  const sessionData = pickSessionData(replay) ?? {};
  const stream = sessionData.Stream ?? {};

  const scoreEntries = toArray(stream.Score);
  const scoreEtRaw = scoreEntries
    .map((entry) => Number(entry?.et))
    .filter(Number.isFinite);
  const scoreEtParsed = scoreEntries
    .map((entry) => parseScoreEtFromText(entry))
    .filter(Number.isFinite);

  const allScoreEt = [...scoreEtRaw, ...scoreEtParsed].filter(Number.isFinite);
  const scoreEtBaseline = allScoreEt.length ? Math.min(...allScoreEt) : Number.NaN;

  const incidentEvents = toArray(stream.Incident)
    .map((item) => ({
      source: 'incident',
      text: String(item?._ ?? '').trim(),
      et: Number(item?.et),
    }))
    .filter((item) => Number.isFinite(item.et));

  const penaltyEvents = toArray(stream.Penalty)
    .map((item) => ({
      source: 'penalty',
      text: String(item?._ ?? '').trim(),
      et: Number(item?.et),
    }))
    .filter((item) => Number.isFinite(item.et));

  const trackLimitEvents = toArray(stream.TrackLimits)
    .map((item) => ({
      source: 'track-limit',
      text: String(item?._ ?? '').trim(),
      et: Number(item?.et),
    }))
    .filter((item) => Number.isFinite(item.et));

  const eventEt = [...incidentEvents, ...penaltyEvents, ...trackLimitEvents]
    .map((item) => item.et)
    .filter(Number.isFinite);

  const firstEventEt = eventEt.length ? Math.min(...eventEt) : Number.NaN;

  const standings = toStandingsEntries(standingsPayload);
  const count = standings.length;
  const allZeroLaps =
    count > 0 && standings.every((entry) => Number(entry?.lapsCompleted ?? -1) === 0);
  const pittingRatio =
    count > 0
      ? standings.filter((entry) => Boolean(entry?.pitting) === true).length / count
      : 0;
  const exitingRatio =
    count > 0
      ? standings.filter((entry) => String(entry?.pitState ?? '') === 'EXITING').length / count
      : 0;
  const nearZeroNegativeTimeIntoLapRatio =
    count > 0
      ? standings.filter((entry) => {
          const value = Number(entry?.timeIntoLap);
          return Number.isFinite(value) && value < 0 && value > -5;
        }).length / count
      : 0;

  const shouldNormalize =
    Number.isFinite(scoreEtBaseline) &&
    scoreEtBaseline > 90 &&
    allZeroLaps &&
    pittingRatio > 0.9 &&
    exitingRatio > 0.9 &&
    nearZeroNegativeTimeIntoLapRatio > 0.9;

  const sortedEvents = [...incidentEvents, ...penaltyEvents, ...trackLimitEvents].sort(
    (left, right) => left.et - right.et,
  );

  const preview = sortedEvents.slice(0, 5).map((event) => {
    const beforeSeek = Math.max(event.et - 5, 0);
    const normalizedEt = Number.isFinite(scoreEtBaseline)
      ? Math.max(event.et - scoreEtBaseline, 0)
      : event.et;
    const afterSeek = Math.max(normalizedEt - 5, 0);

    return {
      source: event.source,
      et: Number(event.et.toFixed(3)),
      beforeSeek: Number(beforeSeek.toFixed(3)),
      normalizedEt: Number(normalizedEt.toFixed(3)),
      afterSeek: Number(afterSeek.toFixed(3)),
      text: event.text.slice(0, 120),
    };
  });

  return {
    session: replay?.metadata?.session,
    hash: replay?.hash,
    scoreEtBaseline: Number.isFinite(scoreEtBaseline)
      ? Number(scoreEtBaseline.toFixed(3))
      : null,
    firstEventEt: Number.isFinite(firstEventEt) ? Number(firstEventEt.toFixed(3)) : null,
    firstEventMinusBaseline:
      Number.isFinite(firstEventEt) && Number.isFinite(scoreEtBaseline)
        ? Number((firstEventEt - scoreEtBaseline).toFixed(3))
        : null,
    standingsSignals: {
      count,
      allZeroLaps,
      pittingRatio: Number(pittingRatio.toFixed(3)),
      exitingRatio: Number(exitingRatio.toFixed(3)),
      nearZeroNegativeTimeIntoLapRatio: Number(
        nearZeroNegativeTimeIntoLapRatio.toFixed(3),
      ),
    },
    shouldNormalize,
    preview,
  };
};

const main = () => {
  const replayPath = process.argv[2];
  const standingsPath = process.argv[3];

  if (!replayPath || !standingsPath) {
    console.error(
      'Usage: node scripts/replay-time-normalizer-check.js <replay.json> <standings.json>',
    );
    process.exit(1);
  }

  const replayRaw = readJson(path.resolve(replayPath));
  const standingsRaw = readJson(path.resolve(standingsPath));

  const replay = getReplay(replayRaw);
  if (!replay) {
    console.error('Replay payload not found in first file.');
    process.exit(1);
  }

  const result = compute(replay, standingsRaw);
  console.log(JSON.stringify(result, null, 2));
};

main();
