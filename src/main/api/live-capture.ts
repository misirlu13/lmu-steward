import { ChildProcessByStdio, spawn } from 'child_process';
import { Readable } from 'stream';
import { existsSync } from 'fs';
import path from 'path';
import log from 'electron-log';
import { app } from 'electron';
import {
  LiveCaptureDriver,
  LiveCaptureIncident,
  LiveIncidentContext,
  LiveIncidentContextRecord,
  LiveIncidentKind,
  LiveSessionData,
  LiveSessionStatus,
} from '@types';
import { parseStewardEvent } from './live-incident-parser';
import { deriveIncidentEvidence } from './live-incident-evidence';
import {
  deriveLivePressureBattles,
  resetLivePressureState,
} from './live-pressure';
import {
  buildLiveIncidentContextRecord,
  buildLiveIncidentRecord,
  buildLiveSessionRecord,
  persistLiveIncident,
  persistLiveIncidentContext,
  persistLiveSession,
  readLiveSessions,
  resolveLiveSessionKey,
} from './live-session-store';

/**
 * Supervises the native live capture sidecar.
 *
 * The sidecar reads LMU's first-party shared memory and emits one JSON object
 * per line on stdout. It is deliberately a separate process rather than an
 * in-process addon: a struct-layout mismatch after an LMU update crashes the
 * sidecar rather than the app, and stdio keeps us clear of firewall prompts and
 * antivirus heuristics that a local socket would attract.
 *
 * See docs/live-capture-investigation.md for the shared memory contract.
 */

const SIDECAR_RELATIVE_PATHS = [
  path.join('tools', 'live-capture-spike', 'build', 'lmu-spike.exe'),
  path.join('resources', 'lmu-spike.exe'),
];

const RESTART_DELAY_MS = 5000;
const STALE_STATUS_MS = 8000;
const MAX_PENDING_LINE_BYTES = 4_000_000;

const DETACHED: LiveSessionStatus = {
  state: 'detached',
  detail: 'Live capture is not running.',
};

type SidecarProcess = ChildProcessByStdio<null, Readable, Readable>;

let child: SidecarProcess | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let stopped = true;
const MAX_RETAINED_INCIDENTS = 500;

let latest: LiveSessionStatus = DETACHED;
let latestAt = 0;
let stdoutBuffer = '';
let drivers: LiveCaptureDriver[] = [];
let incidents: LiveCaptureIncident[] = [];
let trackLimitStepsPerPenalty: number | undefined;
let incidentSequence = 0;
let sessionKey = '';
let sessionRaw = 0;
let sessionTrackName = '';
/** Needed to unwrap on-track gaps across the start line. */
let trackLengthMetres = 0;
let lastSessionPersistAt = 0;

/** Heartbeat for rewriting the session row; see `persistSessionIfDue`. */
const SESSION_PERSIST_MS = 30_000;

/** Set once this session's own standings have arrived. */
let hasStandingsForSession = false;
/** True while a replay is being watched rather than a session driven. */
let isReplayPlayback = false;

let lastCurrentEt = 0;

/**
 * Whether anything about the current session should reach the disk.
 *
 * Three conditions, and all three earn their place:
 *
 * - a session key, or the record is unreachable from the UI and cannot be
 *   deleted — invisible permanent clutter;
 * - standings seen, because until they arrive there is no way to tell a
 *   session from the game merely being open;
 * - not a replay, because watching one populates shared memory just like
 *   driving does and would otherwise be recorded as a session that never
 *   happened.
 */
const canPersistCapture = (): boolean =>
  latest.state === 'live' &&
  Boolean(sessionKey) &&
  hasStandingsForSession &&
  !isReplayPlayback;

/**
 * Writes the session row on a slow heartbeat.
 *
 * The row exists mainly so incidents have a session to belong to, which has to
 * be true before the first incident arrives — but rewriting it at 1Hz for the
 * whole of a 24-hour race would be tens of thousands of pointless writes.
 *
 * Called from the standings as well as the status line, because the standings
 * are what confirm this is a session worth recording; waiting for the next
 * status tick would leave a real session unwritten for a second for no reason.
 */
const persistSessionIfDue = () => {
  if (!canPersistCapture()) {
    return;
  }

  const now = Date.now();
  if (
    lastSessionPersistAt !== 0 &&
    now - lastSessionPersistAt < SESSION_PERSIST_MS
  ) {
    return;
  }

  lastSessionPersistAt = now;
  persistLiveSession(
    buildLiveSessionRecord({
      sessionKey,
      trackName: sessionTrackName,
      session: sessionRaw,
      sessionType: latest.sessionType,
      driverCount: latest.driverCount,
      trackLimitStepsPerPenalty,
      drivers,
      now,
    }),
  );
};

/**
 * How far the session clock may slip backwards before it counts as a restart.
 * Generous, because the clock jitters by a scoring tick and a false restart
 * would orphan everything captured so far.
 */
const SESSION_RESTART_ET_TOLERANCE = 5;

// The sidecar numbers steward events itself so a context arriving seconds later
// can be matched back to one. That counter restarts with the sidecar, so ids
// are qualified by a generation to stay unique across a restart — steward
// decisions are keyed on incident id and must never land on the wrong incident.
let sidecarGeneration = 0;

const resolveSidecarPath = (): string | null => {
  const roots = [
    process.cwd(),
    app.getAppPath(),
    path.dirname(app.getPath('exe')),
  ];

  for (const root of roots) {
    for (const relative of SIDECAR_RELATIVE_PATHS) {
      const candidate = path.join(root, relative);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
};

/*
  Three readers for the fields the sidecar added in the field expansion.

  They exist because "absent" has two causes here and neither may surface as a
  zero. A sidecar built before a field existed emits nothing for it, and LMU
  writes its own sentinel — -1 for a time it does not have, -1 for an invalid
  yellow-flag state — for a value it has not got yet. A timing screen showing
  0.000 for a driver who has not completed a lap is a fabricated fact, so both
  cases have to come out as undefined.

  `typeof value === 'number'` rather than `Number(value)`: JSON null coerces to
  0 and an empty string coerces to 0, and either would be read as a real value.
*/
const optionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * For lap and sector times, and for 1-based positions.
 *
 * `> 0` rather than `!== -1` because LMU is not consistent about which sentinel
 * it writes: observed live, a driver with no completed lap has `bestLapTime`
 * -1 but `lastSector1` 0, in the same row. Both mean the same thing and both
 * have to go.
 */
const optionalPositive = (value: unknown): number | undefined => {
  const parsed = optionalNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
};

/** For the 0-1 weather and wetness fractions. */
const optionalFraction = (value: unknown): number | undefined => {
  const parsed = optionalNumber(value);
  return parsed !== undefined && parsed >= 0 && parsed <= 1
    ? parsed
    : undefined;
};

/**
 * Last full-course flag state logged, so transitions are logged and a steady
 * state is not.
 *
 * `mYellowFlagState` is carried but unverified: LMU does not meaningfully
 * implement full-course yellows, which is why `gamePhase` 6 is already treated
 * as green everywhere else in the app. Logging the transitions is how that gets
 * settled one way or the other from a real session, and it is worth keeping
 * afterwards — a caution coming out is exactly the kind of thing a steward
 * reading back through a log wants to see.
 */
let lastLoggedYellowFlagState: number | undefined;

const applyStatus = (parsed: Record<string, unknown>) => {
  const state = parsed.state === 'live' ? 'live' : 'detached';
  const driverCount = Number(parsed.driverCount);
  const { sessionType } = parsed;
  const trackName =
    typeof parsed.trackName === 'string' && parsed.trackName
      ? parsed.trackName
      : undefined;

  /*
    Session identity is track, the raw session enum, and the session's start
    instant reconstructed as `now - currentEt`. Reconstructing the start is what
    lets the key survive a sidecar restart: the supervisor respawns the sidecar
    on exit, and the new process arrives at the same session rather than opening
    a second one.

    Falls back to track|type when the sidecar predates the currentEt field, so
    an un-rebuilt sidecar still groups incidents rather than mixing sessions.
  */
  const rawSession = Number(parsed.session);
  const currentEt = Number(parsed.currentEt);
  const canDeriveIdentity =
    state === 'live' &&
    Number.isFinite(currentEt) &&
    Number.isFinite(rawSession);

  /*
    A session already in progress keeps its key outright, rather than
    re-deriving it every tick and hoping the answer stays the same. The
    reconstructed start drifts — the sim clock and the wall clock diverge, and
    a pause stops one but not the other — so re-deriving would eventually
    disagree with itself and split a long session in two.

    A genuine restart is caught by the session clock going backwards, which is
    unambiguous and immune to that drift.
  */
  const isContinuingSession =
    canDeriveIdentity &&
    Boolean(sessionKey) &&
    trackName === sessionTrackName &&
    rawSession === sessionRaw &&
    currentEt >= lastCurrentEt - SESSION_RESTART_ET_TOLERANCE;

  let nextKey: string;
  if (!canDeriveIdentity) {
    nextKey = `${trackName ?? ''}|${String(sessionType ?? '')}`;
  } else if (isContinuingSession) {
    nextKey = sessionKey;
  } else {
    // Rejoining or starting: prefer a session already on disk over minting a
    // key that may land in the neighbouring bucket.
    nextKey = resolveLiveSessionKey(
      trackName ?? '',
      rawSession,
      currentEt,
      Object.values(readLiveSessions()),
    );
  }

  lastCurrentEt = canDeriveIdentity ? currentEt : 0;

  // A change of key means a different session; drop incidents so the in-memory
  // queue never mixes two sessions together.
  const isNewSession = nextKey !== sessionKey;
  if (isNewSession) {
    sessionKey = nextKey;
    incidents = [];
    /*
      Standings are cleared too, and must be. They used to survive a session
      change, so the first row written for a new session carried the *previous*
      session's field — and, worse, its control values, which is what says
      whether this is a real session at all. Both facts have to be re-learned
      from the new session's own standings.
    */
    drivers = [];
    hasStandingsForSession = false;
    isReplayPlayback = false;
    // So the new session writes its row on the first tick that can, rather than
    // inheriting the previous session's place in the heartbeat.
    lastSessionPersistAt = 0;
    // Closing-speed trends belong to the session that produced them.
    resetLivePressureState();
  }

  sessionRaw = Number.isFinite(rawSession) ? rawSession : 0;
  sessionTrackName = trackName ?? '';

  const steps = Number(parsed.trackLimitStepsPerPenalty);
  trackLimitStepsPerPenalty =
    Number.isFinite(steps) && steps > 0 ? steps : undefined;

  const length = Number(parsed.trackLength);
  if (Number.isFinite(length) && length > 0) {
    trackLengthMetres = length;
  }

  const timeRemaining = Number(parsed.timeRemainingSeconds);
  const gamePhase = Number(parsed.gamePhase);

  // -1 is LMU's "invalid", not a flag state.
  const rawYellow = optionalNumber(parsed.yellowFlagState);
  const yellowFlagState =
    rawYellow !== undefined && rawYellow >= 0 ? rawYellow : undefined;

  if (yellowFlagState !== lastLoggedYellowFlagState) {
    log.info(
      `live-capture: yellowFlagState ${lastLoggedYellowFlagState ?? 'none'} -> ${yellowFlagState ?? 'none'}`,
    );
    lastLoggedYellowFlagState = yellowFlagState;
  }

  /*
    LMU writes the literal string "-none-" offline, observed in shared memory
    and in the REST sessionInfo payload alike. That is a placeholder, not a
    server, and a header reading "Server: -none-" would be the same fabrication
    as a 0.000 lap time.
  */
  const rawServerName =
    typeof parsed.serverName === 'string' ? parsed.serverName.trim() : '';
  const serverName =
    rawServerName && rawServerName !== '-none-' ? rawServerName : undefined;

  latest = {
    state,
    trackName,
    sessionType:
      sessionType === 'RACE' ||
      sessionType === 'QUALIFY' ||
      sessionType === 'PRACTICE'
        ? sessionType
        : undefined,
    driverCount:
      Number.isFinite(driverCount) && driverCount > 0 ? driverCount : undefined,
    detail: typeof parsed.detail === 'string' ? parsed.detail : undefined,
    timeRemainingSeconds: Number.isFinite(timeRemaining)
      ? timeRemaining
      : undefined,
    gamePhase: Number.isFinite(gamePhase) ? gamePhase : undefined,
    timeOfDay: optionalNumber(parsed.timeOfDay),
    startTimeOfDay: optionalNumber(parsed.startTimeOfDay),
    ambientTempC: optionalNumber(parsed.ambientTempC),
    trackTempC: optionalNumber(parsed.trackTempC),
    raining: optionalFraction(parsed.raining),
    darkCloud: optionalFraction(parsed.darkCloud),
    cloudCoverage: optionalNumber(parsed.cloudCoverage),
    trackGripLevel: optionalNumber(parsed.trackGripLevel),
    minPathWetness: optionalFraction(parsed.minPathWetness),
    maxPathWetness: optionalFraction(parsed.maxPathWetness),
    avgPathWetness: optionalFraction(parsed.avgPathWetness),
    yellowFlagState,
    serverName,
  };
  latestAt = Date.now();

  persistSessionIfDue();
};

/**
 * Every car under replay control means this is a replay being watched, not a
 * session being driven.
 *
 * `mControl` is LMU's own field: -1 nobody, 0 local player, 1 local AI, 2
 * remote, 3 replay. Watching a replay populates shared memory exactly as a
 * live session does — same track, same field, a running session clock — so
 * nothing in the status line distinguishes them. This does.
 *
 * Requires *every* car rather than any, which is the conservative direction: a
 * real session never contains a replay-controlled car, so unanimity cannot
 * produce a false positive, whereas a single stray value could.
 */
const REPLAY_CONTROL = 3;

/**
 * Takes the sentinels out of one standings row.
 *
 * The row is otherwise carried through as the sidecar sent it. Only the fields
 * that can arrive as a sentinel — or not arrive at all, from a sidecar built
 * before them — are rewritten, so an un-rebuilt sidecar produces exactly the
 * row it always did with the new keys simply undefined.
 */
const normaliseDriver = (row: LiveCaptureDriver): LiveCaptureDriver => ({
  ...row,
  lastSector1: optionalPositive(row.lastSector1),
  lastSector2: optionalPositive(row.lastSector2),
  curSector1: optionalPositive(row.curSector1),
  curSector2: optionalPositive(row.curSector2),
  bestSector1: optionalPositive(row.bestSector1),
  bestSector2: optionalPositive(row.bestSector2),
  bestLapTime: optionalPositive(row.bestLapTime),
  bestLapSector1: optionalPositive(row.bestLapSector1),
  bestLapSector2: optionalPositive(row.bestLapSector2),
  // Negative before the start rather than absent, so only finiteness is checked.
  timeIntoLap: optionalNumber(row.timeIntoLap),
  estimatedLapTime: optionalPositive(row.estimatedLapTime),
  // 0 is "not pitting", a real state; only a missing value is absent.
  pitState: optionalNumber(row.pitState),
  inGarageStall:
    typeof row.inGarageStall === 'boolean' ? row.inGarageStall : undefined,
  /*
    Carried at face value including 0, which is what the leader legitimately
    has, matching how `timeBehindLeader` is already carried. Deciding that a
    zero gap means "no car ahead" is the renderer's business — `formatGap`
    already does it — not something to bake in here.
  */
  timeBehindNext: optionalNumber(row.timeBehindNext),
  lapsBehindNext: optionalNumber(row.lapsBehindNext),
  qualification: optionalPositive(row.qualification),
  posX: optionalNumber(row.posX),
  posZ: optionalNumber(row.posZ),
});

const applyStandings = (parsed: Record<string, unknown>) => {
  if (!Array.isArray(parsed.drivers)) {
    return;
  }

  drivers = (parsed.drivers as LiveCaptureDriver[])
    .filter((driver) => driver && typeof driver.slotId === 'number')
    .map(normaliseDriver);

  if (drivers.length > 0) {
    hasStandingsForSession = true;
    const nextIsReplay = drivers.every(
      (driver) => driver.control === REPLAY_CONTROL,
    );

    if (nextIsReplay !== isReplayPlayback) {
      log.info(
        `live-capture: ${nextIsReplay ? 'replay playback detected, not recording' : 'live session detected, recording'}`,
      );
    }

    isReplayPlayback = nextIsReplay;
  }

  // The standings are what settle whether this is a session at all, so the row
  // is written here rather than waiting for the next status line.
  persistSessionIfDue();
};

const applyStewardEvent = (parsed: Record<string, unknown>) => {
  // Mirrored collisions are the same event seen from the other car; the sidecar
  // has already matched them, so folding here would double-count.
  if (parsed.mirror === true) {
    return;
  }

  const raw = typeof parsed.raw === 'string' ? parsed.raw : '';
  if (!raw) {
    return;
  }

  const kindValue = parsed.kind;
  const kind: LiveIncidentKind =
    kindValue === 'track-limits' || kindValue === 'penalty'
      ? kindValue
      : 'incident';

  const et = Number(parsed.et);
  const seq = Number(parsed.seq);
  incidentSequence += 1;

  const id =
    Number.isFinite(seq) && seq > 0
      ? `live-${sidecarGeneration}-${seq}`
      : `live-${sidecarGeneration}-x${incidentSequence}`;

  const incident = {
    ...parseStewardEvent(raw, kind, Number.isFinite(et) ? et : 0, id),
    seq: Number.isFinite(seq) && seq > 0 ? seq : undefined,
  };

  // Written now, not at session end. SME_END_SESSION is not guaranteed to fire,
  // and the in-memory queue is capped — an incident dropped from the tail of a
  // long race must already be on disk.
  const record = buildLiveIncidentRecord(sessionKey, incident);

  /*
    The stable id rides along on the in-memory incident. Steward decisions key
    on it, and `id` above cannot serve: it carries the sidecar generation, so a
    mid-session restart renumbers every incident and a call made before the
    restart would no longer point at anything.
  */
  incidents.push({ ...incident, persistedId: record.id });

  // Shown live either way — a replay's incidents are still worth seeing on
  // screen — but only a real session leaves anything behind.
  if (canPersistCapture()) {
    persistLiveIncident(record);
  }

  if (incidents.length > MAX_RETAINED_INCIDENTS) {
    incidents = incidents.slice(-MAX_RETAINED_INCIDENTS);
  }
};

/**
 * Context arrives a few seconds after the incident it belongs to, because the
 * window straddles the contact and the second half does not exist yet. By then
 * the incident may have been dropped — a session change clears the queue — so
 * an unmatched context is simply discarded.
 *
 * Matched on the generation-qualified id, never on the bare seq. The sidecar
 * restarts its seq counter at 1 with each process, while the incident queue
 * survives a restart within one session, so a bare seq match attaches the new
 * process's traces to the previous process's incidents — silently, and to an
 * incident that happened seconds earlier. Observed live: three contexts landed
 * on the wrong incidents after one restart.
 */
const applyIncidentContext = (parsed: Record<string, unknown>) => {
  const seq = Number(parsed.seq);
  if (!Number.isFinite(seq) || seq <= 0 || !Array.isArray(parsed.cars)) {
    return;
  }

  const expectedId = `live-${sidecarGeneration}-${seq}`;
  const index = incidents.findIndex((incident) => incident.id === expectedId);
  if (index === -1) {
    return;
  }

  const cars = (parsed.cars as LiveIncidentContext['cars']).filter(
    (car) => car && typeof car.slotId === 'number' && Array.isArray(car.frames),
  );

  const sectorFlags = Array.isArray(parsed.sectorFlags)
    ? (parsed.sectorFlags as number[])
    : [];

  const context: LiveIncidentContext = {
    seq,
    et: Number(parsed.et) || 0,
    trackLength: Number(parsed.trackLength) || 0,
    anchorErrorSeconds: Number(parsed.anchorErrorSeconds) || 0,
    sectorFlags: [
      sectorFlags[0] ?? 0,
      sectorFlags[1] ?? 0,
      sectorFlags[2] ?? 0,
    ],
    cars,
  };

  try {
    incidents[index] = {
      ...incidents[index],
      context,
      hasContext: true,
      anchorErrorSeconds: context.anchorErrorSeconds,
      evidence: deriveIncidentEvidence(context, drivers),
    };
  } catch (error) {
    log.error(
      'live-capture: failed to derive evidence for incident',
      seq,
      error,
    );
  }

  /*
    Evidence and the context window are the only two things here that the
    post-session XML cannot rebuild, so they are written even if deriving
    evidence just threw — a trace with no evidence is still the raw material a
    steward can look at, whereas nothing is nothing.

    Two writes, because the incident row carries the derived evidence and the
    trace goes to its own table.
  */
  if (canPersistCapture()) {
    const record = buildLiveIncidentRecord(sessionKey, incidents[index]);
    persistLiveIncident(record);
    persistLiveIncidentContext(
      // Keyed on the record's stable id, not the incident's per-process one, so
      // the trace stays attached to its incident across an app restart.
      buildLiveIncidentContextRecord(sessionKey, record.id, context),
    );
  }
};

const applyLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    log.warn(`live-capture: unparseable line: ${trimmed.slice(0, 200)}`);
    return;
  }

  switch (parsed.type) {
    case 'status':
      applyStatus(parsed);
      break;
    case 'standings':
      applyStandings(parsed);
      break;
    case 'steward_event':
      applyStewardEvent(parsed);
      break;
    case 'incident_context':
      applyIncidentContext(parsed);
      break;
    default:
      break;
  }
};

const consumeStdout = (chunk: string) => {
  stdoutBuffer += chunk;

  let newlineIndex = stdoutBuffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = stdoutBuffer.slice(0, newlineIndex);
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    applyLine(line);
    newlineIndex = stdoutBuffer.indexOf('\n');
  }

  // Guard against a pathological producer never emitting a newline. This has to
  // clear a whole incident context, which is a single line carrying a few
  // hundred frames per car — comfortably over 100 KB.
  if (stdoutBuffer.length > MAX_PENDING_LINE_BYTES) {
    log.warn(
      'live-capture: discarding an oversized partial line from the sidecar',
    );
    stdoutBuffer = '';
  }
};

const scheduleRestart = () => {
  if (stopped || restartTimer) {
    return;
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    spawnSidecar();
  }, RESTART_DELAY_MS);
};

function spawnSidecar(): void {
  if (stopped || child) {
    return;
  }

  const sidecarPath = resolveSidecarPath();
  if (!sidecarPath) {
    latest = { state: 'detached', detail: 'Live capture sidecar not found.' };
    latestAt = Date.now();
    return;
  }

  try {
    // --parent-pid lets the sidecar exit on its own when this process dies.
    // stopLiveCapture() only covers orderly shutdowns; a crash or a Task Manager
    // kill would otherwise strand the sidecar, still contending for LMU's
    // machine-wide shared memory lock.
    child = spawn(sidecarPath, ['--json', `--parent-pid=${process.pid}`], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    log.error('live-capture: failed to spawn sidecar', error);
    child = null;
    scheduleRestart();
    return;
  }

  stdoutBuffer = '';
  sidecarGeneration += 1;
  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', consumeStdout);

  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => {
    log.info(`live-capture sidecar: ${chunk.trim()}`);
  });

  child.on('error', (error) => {
    log.error('live-capture: sidecar error', error);
  });

  // The sidecar exits when LMU is not running. Restarting on a delay makes the
  // app pick up a session that starts later without any user action.
  child.on('exit', () => {
    child = null;
    latest = DETACHED;
    latestAt = Date.now();
    drivers = [];
    /*
      Cleared with the standings they were derived from. Leaving this set while
      `drivers` is empty would let the next tick write a session row with no
      field at all — the ghost row this whole guard exists to prevent.
    */
    hasStandingsForSession = false;
    scheduleRestart();
  });
}

export const startLiveCapture = (): void => {
  stopped = false;
  spawnSidecar();
};

export const stopLiveCapture = (): void => {
  stopped = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (child) {
    child.kill();
    child = null;
  }

  latest = DETACHED;
};

/**
 * A sidecar that is running but has gone quiet should not leave a stale "live"
 * badge on screen, so status expires if it stops being refreshed.
 */
export const getLiveCaptureStatus = (): LiveSessionStatus => {
  if (latest.state === 'live' && Date.now() - latestAt > STALE_STATUS_MS) {
    return { state: 'detached', detail: 'Live capture stopped responding.' };
  }

  return latest;
};

/**
 * The captured window for one incident, from the in-memory queue.
 *
 * Keyed the way the renderer knows the incident — persisted id where there is
 * one — because that is what a dossier asks with. Memory rather than disk
 * matters for the one case disk cannot serve: watching a replay captures
 * incidents and shows them live but deliberately persists nothing, so a trace
 * that only ever existed in memory would otherwise be unreachable.
 */
export const getLiveIncidentContextInMemory = (
  incidentId: string,
): LiveIncidentContextRecord | null => {
  const context = incidents.find(
    (incident) => (incident.persistedId ?? incident.id) === incidentId,
  )?.context;

  return context ? { incidentId, sessionKey, context } : null;
};

/**
 * Strips the context window, leaving everything the queue and dossier render.
 *
 * This reply goes out once a second. Carrying the windows made it roughly 24 MB
 * per tick at 400 incidents — measured — which is an order of magnitude more
 * work than everything the renderer then does with it put together. The
 * replay side already reached the same conclusion; see `getLiveIncidentContext`
 * in live-session-handlers.ts.
 */
const withoutContext = (incident: LiveCaptureIncident): LiveCaptureIncident => {
  if (!incident.context) {
    return incident;
  }
  const { context: _window, ...rest } = incident;
  return rest;
};

export const getLiveSessionData = (): LiveSessionData => {
  const status = getLiveCaptureStatus();

  if (status.state !== 'live') {
    return { status, drivers: [], incidents: [], battles: [] };
  }

  return {
    status,
    drivers,
    incidents: incidents.map(withoutContext),
    trackLimitStepsPerPenalty,
    // Derived on read rather than cached: it is a pure function of the standings
    // the renderer is already polling for, and it goes stale within a tick.
    battles: deriveLivePressureBattles(drivers, trackLengthMetres),
    // The real key, so a decision made live belongs to the session on disk
    // rather than to a key the renderer invented for itself.
    sessionKey,
  };
};
