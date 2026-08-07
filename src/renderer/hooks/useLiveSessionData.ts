import { useEffect, useMemo, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import {
  LiveCaptureDriver,
  LiveCaptureIncident,
  LiveSessionData,
  SessionType,
} from '@types';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';
import {
  LiveIncident,
  LiveIncidentClassification,
  LivePitStatus,
  LiveSectorTimes,
  LiveSessionPhase,
  LiveSessionState,
  LiveStanding,
} from '../components/Live/liveFixtures';

const POLL_INTERVAL_MS = 1000;

const EMPTY: LiveSessionData = {
  status: { state: 'detached' },
  drivers: [],
  incidents: [],
  battles: [],
};

/**
 * LMU reports classes as full names ("Hyper", "LMP2", "LMGT3"); the shared
 * CarClassBadge expects the short codes used throughout the app.
 */
const CLASS_CODES: Record<string, string> = {
  hyper: 'HY',
  hypercar: 'HY',
  lmp2: 'P2',
  lmp3: 'P3',
  lmgt3: 'GT3',
  gt3: 'GT3',
  gte: 'GTE',
};

export const toCarClassCode = (vehicleClass: string): string => {
  const key = vehicleClass.toLowerCase().replace(/[^a-z0-9]/g, '');
  return CLASS_CODES[key] ?? vehicleClass.slice(0, 3).toUpperCase();
};

/** LMU vehicle names commonly lead with the car number, e.g. "#7 Toyota GR010". */
export const toCarNumber = (driver: LiveCaptureDriver): string => {
  const match = driver.vehicleName.match(/#\s*(\d+)/);
  return match ? match[1] : String(driver.slotId);
};

export const formatLapTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(3).padStart(6, '0')}`;
};

/**
 * A time LMU actually holds, or nothing.
 *
 * The "no time" sentinel is not consistent within a single row — a driver with
 * no completed lap carries `mBestLapTime` `-1` but `mLastSector1` `0` — so the
 * test is `> 0` rather than `!== -1`. A `!== -1` check lets the zeros through
 * onto a timing screen as 0.000.
 */
const heldTime = (value?: number): number | undefined =>
  value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : undefined;

/**
 * Split a lap into its three sectors.
 *
 * **Sector 2 as LMU reports it is cumulative** — it is S1+S2 — so S2 alone is
 * `cumulativeSector2 - sector1` and S3 is `lapTime - cumulativeSector2`.
 * Verified to the millisecond against a real race lap: 29.008 / 60.249 / 77.233
 * splits to 29.008, 31.241, 16.984. Getting this wrong is the classic
 * timing-screen bug.
 *
 * A sector that does not come out positive is dropped rather than shown: a lap
 * with an invalidated sector leaves the pair inconsistent, and a negative
 * sector time is not a measurement.
 */
export const splitSectors = (
  sector1?: number,
  cumulativeSector2?: number,
  lapTime?: number,
): LiveSectorTimes => {
  const first = heldTime(sector1);
  const cumulative = heldTime(cumulativeSector2);
  const lap = heldTime(lapTime);

  return [
    first,
    first !== undefined && cumulative !== undefined && cumulative > first
      ? Number((cumulative - first).toFixed(3))
      : undefined,
    cumulative !== undefined && lap !== undefined && lap > cumulative
      ? Number((lap - cumulative).toFixed(3))
      : undefined,
  ];
};

/** Seconds as a signed gap, e.g. `+4.118`. */
const formatSecondsGap = (seconds: number): string => `+${seconds.toFixed(3)}`;

/**
 * Gap in a race, straight from LMU's own classification arithmetic.
 * `mTimeBehindLeader` and `mTimeBehindNext` compose exactly here — verified
 * live, P2 `0.653` + P3 `0.543` + P4 `0.395` against leader gaps `0.653`,
 * `1.196`, `1.591`.
 */
const formatRaceGap = (driver: LiveCaptureDriver): string => {
  if (driver.place === 1) {
    return '—';
  }
  if (driver.lapsBehindLeader > 0) {
    return `+${driver.lapsBehindLeader}L`;
  }
  if (
    !Number.isFinite(driver.timeBehindLeader) ||
    driver.timeBehindLeader <= 0
  ) {
    return '—';
  }
  return formatSecondsGap(driver.timeBehindLeader);
};

const formatRaceInterval = (driver: LiveCaptureDriver): string => {
  if (driver.place === 1) {
    return '—';
  }
  if ((driver.lapsBehindNext ?? 0) > 0) {
    return `+${driver.lapsBehindNext}L`;
  }
  const interval = driver.timeBehindNext;
  if (interval === undefined || !Number.isFinite(interval) || interval <= 0) {
    return '—';
  }
  return formatSecondsGap(interval);
};

/**
 * Gap outside a race, as the delta between two best laps.
 *
 * **LMU's own gap fields cannot be used here.** Practice and qualifying rank by
 * best lap, so the car one place higher is not the car ahead on track:
 * `mTimeBehindNext` read 0.0 for almost a whole practice field, with stray
 * values including a negative one. This is the same reason `live-pressure.ts`
 * derives its gaps from `lapDist`. So the interval is recomputed from the
 * quantity the field is actually ordered by, which is what a timing screen
 * shows in practice anyway.
 */
const formatBestLapDelta = (bestLap?: number, reference?: number): string => {
  if (bestLap === undefined || reference === undefined) {
    return '—';
  }
  const delta = bestLap - reference;
  return delta >= 0 ? formatSecondsGap(delta) : '—';
};

/**
 * Track / pits / garage.
 *
 * Read from the two booleans rather than from `mPitState`, whose documented
 * 0–4 range is wrong: an undocumented 5 was the resting value on 34 of 37 cars
 * at a qualifying green. The raw number is carried alongside for detail, but
 * nothing branches on it.
 */
const toPitStatus = (driver: LiveCaptureDriver): LivePitStatus => {
  if (driver.inGarageStall) {
    return 'GAR';
  }
  return driver.inPits ? 'PIT' : 'TRK';
};

const classifyIncident = (
  incident: LiveCaptureIncident,
): LiveIncidentClassification => {
  if (incident.kind === 'track-limits') {
    return 'track-limits';
  }
  if (incident.objectStruck && incident.objectStruck !== 'another vehicle') {
    return 'loss-of-control';
  }
  return 'contact';
};

const formatEt = (etSeconds: number): string => {
  const total = Math.max(0, Math.floor(etSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

interface DriverTally {
  incidents: number;
  trackLimits: number;
  /** LMU's own running points total, taken from the most recent element. */
  points?: number;
}

/**
 * Per-driver running totals for the watchlist.
 *
 * A `<TrackLimits>` element is only a strike when it actually added warning
 * points — the same element is emitted with `WarningPoints="0"` to report "No
 * Further Action", and counting those would inflate every driver's tally.
 */
export const tallyByDriver = (
  incidents: LiveCaptureIncident[],
): Map<number, DriverTally> => {
  const tallies = new Map<number, DriverTally>();

  const forSlot = (slotId: number) => {
    const existing = tallies.get(slotId);
    if (existing) {
      return existing;
    }
    const created: DriverTally = { incidents: 0, trackLimits: 0 };
    tallies.set(slotId, created);
    return created;
  };

  incidents.forEach((incident) => {
    if (incident.kind === 'track-limits') {
      const [party] = incident.parties;
      if (party?.slotId === undefined) {
        return;
      }
      const tally = forSlot(party.slotId);
      if ((incident.warningPoints ?? 0) > 0) {
        tally.trackLimits += 1;
      }
      if (incident.currentPoints !== undefined) {
        tally.points = incident.currentPoints;
      }
      return;
    }

    // Both parties to a collision carry the incident on their record; sorting
    // out who was responsible is the steward's job, not the counter's.
    incident.parties.forEach((party) => {
      if (party.slotId !== undefined) {
        forSlot(party.slotId).incidents += 1;
      }
    });
  });

  return tallies;
};

/**
 * Steam ID is the right identity key in multiplayer, because slot ids are
 * reused once a driver leaves. But it is not always populated: every AI entry
 * and every offline session reports `0`, so a 54-car single-player field would
 * collapse to a single identity — duplicate React keys, and a driver lookup
 * that returns whichever car happened to be first.
 *
 * Fall back to the slot whenever there is no usable Steam ID.
 */
const UNSET_STEAM_IDS = new Set(['', '0']);

export const driverIdentity = (driver: LiveCaptureDriver): string =>
  UNSET_STEAM_IDS.has(driver.steamId)
    ? `slot-${driver.slotId}`
    : driver.steamId;

/**
 * The field, ordered by classification, with everything a timing screen needs.
 *
 * `sessionType` is not decoration: it decides which gap arithmetic is honest.
 * In a race LMU's own `mTimeBehindLeader` / `mTimeBehindNext` are exact; in
 * practice and qualifying they are meaningless and the same two columns are
 * best-lap deltas instead. Absent — an old sidecar, or no session — is treated
 * as "not a race", because that path never touches the untrustworthy fields.
 */
export const buildStandings = (
  drivers: LiveCaptureDriver[],
  incidents: LiveCaptureIncident[] = [],
  sessionType: SessionType | undefined = undefined,
): LiveStanding[] => {
  const byClass = new Map<string, number>();
  const tallies = tallyByDriver(incidents);
  const isRace = sessionType === 'RACE';
  const ordered = [...drivers].sort((a, b) => a.place - b.place);
  const leaderBestLap = heldTime(ordered[0]?.bestLapTime);

  return ordered.map((driver, index) => {
    const carClass = toCarClassCode(driver.vehicleClass);
    const classPosition = (byClass.get(carClass) ?? 0) + 1;
    byClass.set(carClass, classPosition);
    const tally = tallies.get(driver.slotId);
    const bestLapSeconds = heldTime(driver.bestLapTime);

    return {
      steamId: driverIdentity(driver),
      slotId: driver.slotId,
      position: driver.place,
      classPosition,
      displayName: driver.driverName,
      carNumber: toCarNumber(driver),
      carClass,
      gapToLeader: isRace
        ? formatRaceGap(driver)
        : formatBestLapDelta(
            index === 0 ? undefined : bestLapSeconds,
            leaderBestLap,
          ),
      interval: isRace
        ? formatRaceInterval(driver)
        : formatBestLapDelta(
            index === 0 ? undefined : bestLapSeconds,
            heldTime(ordered[index - 1]?.bestLapTime),
          ),
      lastLap: formatLapTime(driver.lastLapTime),
      lastLapSeconds: heldTime(driver.lastLapTime),
      lastSectors: splitSectors(
        driver.lastSector1,
        driver.lastSector2,
        driver.lastLapTime,
      ),
      bestLap: formatLapTime(driver.bestLapTime ?? 0),
      bestLapSeconds,
      /*
        The sectors *from* the best lap, not the best sectors. LMU reports a
        true best S1 and a cumulative best S1+S2 and no best S3 at all, so
        there is no consistent per-sector best to compare against — and the two
        are genuinely different numbers (28.708 vs 28.748 on one observed
        driver). One reference lap for all three sectors is the honest choice.
      */
      bestLapSectors: splitSectors(
        driver.bestLapSector1,
        driver.bestLapSector2,
        driver.bestLapTime,
      ),
      outstandingPenalties: driver.penalties,
      trackLimitStrikes: tally?.trackLimits ?? 0,
      trackLimitPoints: tally?.points,
      incidentCount: tally?.incidents ?? 0,
      inPits: driver.inPits,
      pitStatus: toPitStatus(driver),
      pitState: driver.pitState,
      isAiDriver: driver.control === 1,
    };
  });
};

const identityForSlot = (
  slotId: number | undefined,
  bySlot: Map<number, LiveCaptureDriver>,
  fallbackLabel?: string,
): string => {
  const match = slotId !== undefined ? bySlot.get(slotId) : undefined;
  return match
    ? driverIdentity(match)
    : `slot-${slotId ?? fallbackLabel ?? ''}`;
};

const buildIncident = (
  incident: LiveCaptureIncident,
  bySlot: Map<number, LiveCaptureDriver>,
): LiveIncident => {
  const parties = incident.parties.map((party) => {
    const match =
      party.slotId !== undefined ? bySlot.get(party.slotId) : undefined;
    return {
      steamId: identityForSlot(party.slotId, bySlot, party.displayName),
      slotId: party.slotId,
      displayName: party.displayName,
      carNumber: match ? toCarNumber(match) : String(party.slotId ?? ''),
      carClass: match ? toCarClassCode(match.vehicleClass) : '',
      isAiDriver: match?.control === 1,
    };
  });

  const nameForSlot = (slotId: number) =>
    incident.parties.find((party) => party.slotId === slotId)?.displayName ??
    bySlot.get(slotId)?.driverName ??
    `Car ${slotId}`;

  const derived = incident.evidence;

  return {
    /*
      The persisted id when there is one, which is almost always. It is
      stable where `incident.id` is not: that carries the sidecar
      generation, so a mid-session sidecar restart renumbers every incident
      — moving the steward's selection and detaching decisions from the
      incidents they were made on.
    */
    id: incident.persistedId ?? incident.id,
    etSeconds: incident.etSeconds,
    timestampLabel: formatEt(incident.etSeconds),
    lapLabel: incident.lap !== undefined ? `L${incident.lap}` : '—',
    classification: classifyIncident(incident),
    contactMagnitude: incident.magnitude,
    drivers: parties,
    // Fault is the steward's call, never the app's.
    atFaultSteamId: undefined,
    rawText: incident.raw.replace(/<[^>]*>/g, '').trim(),
    // Lifted onto the incident by capture so it survives the context strip;
    // the fallback is for fixtures and anything still carrying a full window.
    anchorErrorSeconds:
      incident.anchorErrorSeconds ?? incident.context?.anchorErrorSeconds,
    evidence: {
      closingSpeedKph: derived?.closingSpeedKph,
      aheadDriverSteamId:
        derived?.aheadSlotId === undefined
          ? undefined
          : identityForSlot(derived.aheadSlotId, bySlot),
      isTrafficIncident: derived?.isTrafficIncident,
      trackPositionLabel: derived?.trackPositionLabel,
      cars: (derived?.cars ?? []).map((car) => ({
        steamId: identityForSlot(car.slotId, bySlot),
        speedKph: car.speedKph,
        peakDecelMps2: car.peakDecelMps2,
        brakeApplied: car.brakeApplied,
        blueFlagShown: car.blueFlagShown,
        peakYawRateDegPerSec: car.peakYawRateDegPerSec,
        offTrack: car.offTrack,
      })),
    },
    /*
      Present only when a full window came with the incident, which live is
      never — capture strips it and the dossier fetches the one window it is
      actually showing. Dev-mode fixtures still carry theirs inline.
    */
    traces: incident.context?.cars.map((car) => ({
      steamId: identityForSlot(car.slotId, bySlot),
      displayName: nameForSlot(car.slotId),
      frames: car.frames,
    })),
    hasTrace: incident.hasContext ?? Boolean(incident.context),
    state: 'NEW' as const,
  };
};

export const buildIncidents = (
  captured: LiveCaptureIncident[],
  drivers: LiveCaptureDriver[],
): LiveIncident[] => {
  const bySlot = new Map<number, LiveCaptureDriver>();
  drivers.forEach((driver) => bySlot.set(driver.slotId, driver));

  return [...captured]
    .sort((a, b) => b.etSeconds - a.etSeconds)
    .map((incident) => buildIncident(incident, bySlot));
};

/**
 * Everything about the roster that a built incident actually depends on.
 *
 * Not the whole driver record: place, gap and last lap change every tick and
 * change nothing about an incident. Rebuilding four hundred incidents because
 * somebody set a lap time is the churn this cache exists to avoid.
 */
const rosterSignature = (drivers: LiveCaptureDriver[]): string =>
  drivers
    .map(
      (driver) =>
        `${driver.slotId}:${driverIdentity(driver)}:${driver.vehicleName}:${
          driver.vehicleClass
        }:${driver.control}`,
    )
    .join('|');

/**
 * What can change about one captured incident after it first arrives.
 *
 * In practice, exactly one thing: its context window lands a few seconds late
 * and brings the derived evidence with it. Everything else is written once at
 * push time and never touched again — see `applyIncidentContext` in
 * live-capture.ts, the only code that updates a held incident.
 */
const incidentRevision = (incident: LiveCaptureIncident): string =>
  `${incident.hasContext || incident.context ? 1 : 0}:${
    incident.evidence ? 1 : 0
  }:${incident.etSeconds}:${incident.parties.length}`;

export interface LiveIncidentCache {
  roster: string;
  byId: Map<string, { revision: string; built: LiveIncident }>;
  last: LiveIncident[];
}

export const createLiveIncidentCache = (): LiveIncidentCache => ({
  roster: '',
  byId: new Map(),
  last: [],
});

/**
 * `buildIncidents`, but reusing the object it built last time for every
 * incident that has not changed.
 *
 * The poll hands the renderer a freshly deserialised array once a second, so
 * without this every incident has a new identity every second and nothing
 * downstream — no `React.memo`, no `useMemo` — can skip any work. The building
 * itself is cheap (measured under a millisecond at four hundred incidents);
 * what is expensive is what the new identities force everything else to redo.
 *
 * Returns the previous array outright when nothing at all changed, so the
 * whole live view can bail out on a quiet tick rather than just its rows.
 */
export const buildIncidentsCached = (
  captured: LiveCaptureIncident[],
  drivers: LiveCaptureDriver[],
  cache: LiveIncidentCache,
): LiveIncident[] => {
  const bySlot = new Map<number, LiveCaptureDriver>();
  drivers.forEach((driver) => bySlot.set(driver.slotId, driver));

  const roster = rosterSignature(drivers);
  const previous = cache.roster === roster ? cache.byId : undefined;

  // Rebuilt rather than pruned, so an incident that has left the queue — a
  // session change clears it — cannot keep its entry alive forever.
  const byId = new Map<string, { revision: string; built: LiveIncident }>();
  let changed = captured.length !== cache.last.length || previous === undefined;

  const built = [...captured]
    .sort((a, b) => b.etSeconds - a.etSeconds)
    .map((incident, index) => {
      const id = incident.persistedId ?? incident.id;
      const revision = incidentRevision(incident);
      const cached = previous?.get(id);

      if (cached?.revision === revision) {
        byId.set(id, cached);
        if (cache.last[index] !== cached.built) {
          changed = true;
        }
        return cached.built;
      }

      changed = true;
      const entry = { revision, built: buildIncident(incident, bySlot) };
      byId.set(id, entry);
      return entry.built;
    });

  cache.roster = roster;
  cache.byId = byId;
  if (changed) {
    cache.last = built;
  }

  return cache.last;
};

/**
 * mGamePhase: 5 is green, 7 is a stopped session, 8 is over. The race-start
 * phases (1-4) and FCY (6) are treated as green — FCY because LMU does not
 * meaningfully implement it, so a phase 6 must not put the UI into a caution
 * mode the game is not actually in.
 */
export const toSessionPhase = (gamePhase?: number): LiveSessionPhase => {
  if (gamePhase === 7) {
    return 'red';
  }
  if (gamePhase === 8) {
    return 'finished';
  }
  return 'green';
};

/**
 * The fallback exists for dev mode, where the fixture supplies the whole state.
 * Live, every field has to come from the capture or be absent — spreading the
 * fixture and overriding only some keys is how a frozen fixture countdown ended
 * up being presented as a live session clock.
 */
export const buildSessionState = (
  data: LiveSessionData,
  fallback: LiveSessionState,
): LiveSessionState => {
  if (data.status.state !== 'live') {
    return { ...fallback, connected: false };
  }

  return {
    trackName: data.status.trackName ?? '',
    sessionType: data.status.sessionType ?? 'PRACTICE',
    serverName: data.status.detail ?? '',
    phase: toSessionPhase(data.status.gamePhase),
    timeRemainingSeconds: data.status.timeRemainingSeconds ?? 0,
    lapsCompleted: Math.max(0, ...data.drivers.map((d) => d.lapsCompleted), 0),
    trackLimitStepsPerPenalty: data.trackLimitStepsPerPenalty ?? 0,
    connected: true,
    /*
      Passed through undefined-and-all: a sidecar built before Step 3 sends
      none of these, and the header renders `—` for each rather than a zero
      that reads as a measurement.
    */
    timeOfDay: data.status.timeOfDay,
    ambientTempC: data.status.ambientTempC,
    trackTempC: data.status.trackTempC,
    raining: data.status.raining,
    avgPathWetness: data.status.avgPathWetness,
  };
};

/** `HH:MM:SS` from seconds since midnight. */
export const formatTimeOfDay = (seconds?: number): string | undefined => {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return undefined;
  }
  const total = Math.floor(((seconds % 86400) + 86400) % 86400);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0',
  )}:${String(total % 60).padStart(2, '0')}`;
};

/** `H:MM:SS` for a countdown, which is a duration rather than a clock. */
export const formatSessionClock = (totalSeconds: number): string => {
  const total = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(
    total % 60,
  ).padStart(2, '0')}`;
};

/**
 * The weather, in one word, from the two fields that mean something.
 *
 * Three states and no severity bands. Every session observed so far has been
 * dry, so a "Light rain / Heavy rain" scale would be a guess at where the
 * boundaries sit — and `cloudCoverage` and `trackGripLevel`, the other two
 * candidates, are small integers on an unknown scale. Rain that has not yet
 * wet the line and a line still wet after the rain stopped are genuinely
 * different conditions, which is why "Damp" is its own answer.
 */
export const summariseWeather = (
  session: Pick<LiveSessionState, 'raining' | 'avgPathWetness'>,
): string | undefined => {
  const { raining, avgPathWetness } = session;
  if (raining === undefined && avgPathWetness === undefined) {
    return undefined;
  }
  if ((raining ?? 0) > 0) {
    return 'Rain';
  }
  return (avgPathWetness ?? 0) > 0 ? 'Damp' : 'Dry';
};

export const useLiveSessionData = () => {
  const { subscribeToApiChannel } = useApi();
  const [data, setData] = useState<LiveSessionData>(EMPTY);

  useEffect(() => {
    const unsubscribe = subscribeToApiChannel(
      CONSTANTS.API.GET_LIVE_SESSION_DATA,
      (payload: unknown) => {
        const response = payload as { status?: string; data?: LiveSessionData };
        if (response?.status === 'success' && response.data) {
          setData(response.data);
        }
      },
    );

    const poll = () => sendMessage(CONSTANTS.API.GET_LIVE_SESSION_DATA);
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
      unsubscribe?.();
    };
  }, [subscribeToApiChannel]);

  const standings = useMemo(
    () => buildStandings(data.drivers, data.incidents, data.status.sessionType),
    [data.drivers, data.incidents, data.status.sessionType],
  );
  /*
    A ref, not state: the cache is an implementation detail of building the
    list and must never itself cause a render. It lives for the life of the
    hook, which is the life of the view.
  */
  const incidentCache = useRef(createLiveIncidentCache());
  const incidents = useMemo(
    () =>
      buildIncidentsCached(data.incidents, data.drivers, incidentCache.current),
    [data.drivers, data.incidents],
  );

  return { data, standings, incidents, sessionKey: data.sessionKey ?? '' };
};
