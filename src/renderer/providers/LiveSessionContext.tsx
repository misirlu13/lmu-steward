import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import { CONSTANTS } from '@constants';
import {
  LiveSessionSummary,
  SessionType,
  StewardDecision,
  StewardDecisionState,
} from '@types';
import { sendMessage } from '../utils/postMessage';
import { buildStewardDecisionId } from '../utils/stewardDecisionId';
import { useApi } from './ApiContext';
import { LiveIndicator, deriveLiveIndicator } from '../hooks/useLiveIndicator';
import {
  buildSessionState,
  useLiveSessionData,
} from '../hooks/useLiveSessionData';
import { LiveTrackMapResult, useLiveTrackMap } from '../hooks/useLiveTrackMap';
import { useLiveSessionSegments } from '../hooks/useLiveSessionSegments';
import {
  LiveGameCameraReading,
  useLiveGameState,
} from '../hooks/useLiveGameState';
import {
  isDriverScopedOutcome,
  outcomeForShortcut,
} from '../utils/stewardActions';
import {
  DEFAULT_LIVE_INCIDENT_FILTERS,
  LiveDecisionOutcome,
  LiveDriverRef,
  LiveIncident,
  LiveIncidentFilterOptions,
  LiveIncidentFilters,
  LiveIncidentState,
  LivePressureBattle,
  LivePriorCall,
  LiveSessionState,
  LiveStanding,
  buildLiveIncidentFilterOptions,
  liveIncidentsFixture,
  livePressureFixture,
  liveSessionFixture,
  liveStandingsFixture,
} from '../components/Live/liveFixtures';

/**
 * Where the number keys and `F` mean "call this incident".
 *
 * Scoped rather than global because the live shell now has sections that are
 * not about adjudicating: a steward reading a timing screen must be able to
 * type without issuing penalties against whatever was last selected.
 */
const SHORTCUT_ROUTES = new Set(['/live', '/live/incidents']);

/** Where a keystroke is text the steward is writing, not a command. */
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * How long a focus the app has asked for outranks the focus the game reports.
 *
 * Long enough to cover a burst of stepping — the game confirms in 5–8 ms, so
 * any wait beyond a poll tick or two means the request did not land — and short
 * enough that a slot LMU quietly refused does not leave the bar naming a car
 * nobody is watching. Slots outside the field are the known case: `38`–`100`
 * answer 200 and no-op.
 */
const FOCUS_CONFIRM_TIMEOUT_MS = 3000;

/**
 * Which session a call is being made *about*, which is not always the one the
 * game is running.
 *
 * A steward reviewing practice during the race is adjudicating practice, and
 * the record has to say so — the denormalised track and type are what a decision
 * is read back by once its evidence has aged out.
 */
interface DecisionSessionIdentity {
  trackName: string;
  sessionType: SessionType;
  serverName?: string;
}

/**
 * Builds the durable record. Session, driver, time and classification are
 * denormalised onto it deliberately: live incident ids do not survive a
 * sidecar restart, so the decision has to stand on its own.
 */
const buildDecision = (
  incident: LiveIncident,
  identity: DecisionSessionIdentity,
  sessionKey: string,
  stewardAuthor: string,
  state: StewardDecisionState,
  outcome?: LiveDecisionOutcome,
  target?: LiveDriverRef,
  reasoning?: string,
): StewardDecision => ({
  id: buildStewardDecisionId(sessionKey, incident.id, target?.steamId),
  basis: 'incident',
  incidentId: incident.id,
  sessionKey,
  sessionTrack: identity.trackName,
  sessionType: identity.sessionType,
  sessionDate: Date.now(),
  serverName: identity.serverName || undefined,
  target: target
    ? {
        steamId: target.steamId,
        slotId: target.slotId,
        driverName: target.displayName,
      }
    : undefined,
  involvedParties: incident.drivers.map((driver) => ({
    steamId: driver.steamId,
    slotId: driver.slotId,
    driverName: driver.displayName,
  })),
  lapLabel: incident.lapLabel,
  etSeconds: incident.etSeconds,
  trackPositionLabel: incident.evidence.trackPositionLabel,
  classification: incident.classification,
  outcome,
  /*
    Optional by design. Both design docs are explicit that a live call must not
    be gated on typing an explanation — under time pressure the call itself is
    the thing — and that reasoning is prompted for properly during post-session
    review. An empty box records nothing rather than an empty string, so an
    export can tell "no reasoning given" from "reasoning given as blank".
  */
  reasoning: reasoning?.trim() || undefined,
  /*
    Passed in, never read from settings here. `ApiContext` resolves the one
    value the replay dossier also writes with, so the two cannot disagree — and
    it is already non-blank by the time it arrives.
  */
  stewardAuthor,
  decidedAt: Date.now(),
  state,
  // Provisional until the session syncs and the call can be reviewed against
  // the full replay.
  status: 'provisional',
  revisions: [],
});

/**
 * Every decision that belongs to one session, indexed by the incident it is
 * about.
 *
 * Parameterised on the key rather than closing over "the current session",
 * because there are now two sessions in play at once: the one the steward is
 * reading and the one the game is running. The nav badge has to keep counting
 * the second while the queue shows the first.
 */
const buildDecisionIndex = (
  decisions: Record<string, StewardDecision>,
  sessionKey: string,
): Map<string, StewardDecision[]> => {
  const byIncident = new Map<string, StewardDecision[]>();

  Object.values(decisions).forEach((decision) => {
    if (!decision.incidentId || decision.sessionKey !== sessionKey) {
      return;
    }
    const existing = byIncident.get(decision.incidentId);
    if (existing) {
      existing.push(decision);
    } else {
      byIncident.set(decision.incidentId, [decision]);
    }
  });

  return byIncident;
};

/**
 * Deliberately returns the incidents it was given, untouched, where no decision
 * applies — so a quiet poll tick leaves both the array and every entry on it
 * with the identity the build cache gave them.
 */
const applyDecisions = (
  incidents: LiveIncident[],
  byIncident: Map<string, StewardDecision[]>,
): LiveIncident[] =>
  incidents.map((incident) => {
    const forIncident = byIncident.get(incident.id);
    if (!forIncident?.length) {
      return incident;
    }

    const decided = forIncident.find((entry) => entry.state === 'DECIDED');
    if (decided) {
      return {
        ...incident,
        state: 'DECIDED' as const,
        decision: decided.outcome,
        decisionReasoning: decided.reasoning,
        atFaultSteamId: decided.target?.steamId,
      };
    }

    /*
      Ranked, because an incident can carry more than one record: a per-driver
      call is keyed on its target, an incident-scoped one is not. A decision
      settles it, a deferral is a deliberate hand-off to post-session, and a
      flag is the weakest claim of the three.
    */
    if (forIncident.some((entry) => entry.state === 'DEFERRED')) {
      return { ...incident, state: 'DEFERRED' as const };
    }

    return { ...incident, state: 'FLAGGED' as const };
  });

/**
 * How many incidents would come out of `applyDecisions` still in `NEW`.
 *
 * Counted rather than merged, because the one caller that needs this separately
 * from the rendered list wants only the number — and merging four hundred
 * incidents once a second to produce an integer would allocate four hundred
 * objects nothing ever renders.
 *
 * **It must agree with `applyDecisions` exactly, and "has no decision record" is
 * not the same test.** A decision record always moves an incident out of `NEW`,
 * but an incident with no record keeps whatever state it arrived carrying — which
 * live is always `NEW` and in the dev fixtures is deliberately not. Counting on
 * the record alone made the rail badge read 7 against a queue showing 3.
 */
const countUnreviewed = (
  incidents: LiveIncident[],
  byIncident: Map<string, StewardDecision[]>,
): number =>
  incidents.reduce((total, incident) => {
    if (byIncident.get(incident.id)?.length) {
      return total;
    }
    return incident.state === 'NEW' ? total + 1 : total;
  }, 0);

/**
 * A driver's history in one session, from the same store the incident states
 * come from.
 *
 * Indexed on the target where there is one, and on every involved party where
 * there is not: a penalty against one driver of a two-car contact is a call
 * about that driver only, while a "no action" is a finding about the incident
 * and belongs to everyone who was in it.
 *
 * Parameterised on the key for the same reason `buildDecisionIndex` is — the
 * dossier wants the history of the session being *read* and the watchlist wants
 * the one being *driven*, and those stopped being the same session.
 */
const buildPriorCallsByDriver = (
  decisions: Record<string, StewardDecision>,
  sessionKey: string,
): Map<string, LivePriorCall[]> => {
  const byDriver = new Map<string, LivePriorCall[]>();

  Object.values(decisions).forEach((decision) => {
    if (decision.sessionKey !== sessionKey) {
      return;
    }

    const targetSteam = decision.target?.steamId;
    const keys = targetSteam
      ? [targetSteam]
      : decision.involvedParties
          .map((party) => party.steamId)
          .filter((id): id is string => Boolean(id));

    const call: LivePriorCall = {
      decisionId: decision.id,
      incidentId: decision.incidentId,
      lapLabel: decision.lapLabel,
      state: decision.state,
      outcome: decision.outcome,
      wasTarget: Boolean(targetSteam),
      decidedAt: decision.decidedAt,
    };

    keys.forEach((key) => {
      const existing = byDriver.get(key);
      if (existing) {
        existing.push(call);
      } else {
        byDriver.set(key, [call]);
      }
    });
  });

  // Newest first: the most recent call is the one that sets the precedent the
  // steward is about to either follow or depart from.
  byDriver.forEach((calls) => calls.sort((a, b) => b.decidedAt - a.decidedAt));

  return byDriver;
};

/**
 * Penalties the steward has assigned, per driver.
 *
 * Only calls against a driver count — a finding about the incident as a whole is
 * not a penalty, and a watchlist that counted them would flag the drivers who
 * were cleared. Derived from the history rather than counted separately, so the
 * watchlist and the dossier cannot disagree about what has already been called.
 *
 * The test is the record's own `target`, which is what `wasTarget` reports: a
 * decision only names a driver when the action it was made under was
 * driver-scoped. Asking the *configured* tariff instead would make a past call
 * change meaning when the action behind it is renamed or deleted, and would stop
 * counting decisions made under an earlier vocabulary altogether.
 */
const countPenaltiesByDriver = (
  priorCalls: Map<string, LivePriorCall[]>,
): Map<string, number> => {
  const byDriver = new Map<string, number>();

  priorCalls.forEach((calls, steamId) => {
    const penalties = calls.filter(
      (call) =>
        call.wasTarget &&
        call.state === 'DECIDED' &&
        call.outcome !== undefined,
    ).length;
    if (penalties > 0) {
      byDriver.set(steamId, penalties);
    }
  });

  return byDriver;
};

/** Identity-stable stand-in for a record that has been asked for and has not landed. */
const NO_INCIDENTS: LiveIncident[] = [];

export interface LiveSessionContextValue {
  /* Session-wide data, polled once for the whole shell. */
  session: LiveSessionState;
  /**
   * The session everything on this context is *about*.
   *
   * Usually the running one. While the steward is reading a past segment it is
   * that segment's key instead, which is what keeps a call made against
   * practice attached to practice.
   */
  sessionKey: string;
  /** The running session's key, whatever is being read. */
  activeSessionKey: string;
  /**
   * The segments of this weekend at this track, oldest first.
   *
   * Empty until the running session has been persisted, and short — a weekend
   * is three to six sessions. Fewer than two and there is nothing to pick
   * between, which is what the picker checks before drawing itself.
   */
  segments: LiveSessionSummary[];
  /** The summary row for `sessionKey`, when the group knows about it. */
  selectedSegment?: LiveSessionSummary;
  /**
   * True when the queue, the dossier and the counts are showing a session that
   * has finished rather than the one being captured.
   *
   * **Only the incident side follows the selection.** The field, the timing
   * screen, the track map, the pressure monitor and the camera bar all stay on
   * the running session, because that is what they are: a picture of the cars
   * on track now. A steward reading practice's incidents during the race is
   * still stewarding the race.
   */
  isReviewingRecord: boolean;
  /** A past segment has been chosen and its incidents are still being read. */
  segmentRecordLoading: boolean;
  standings: LiveStanding[];
  battles: LivePressureBattle[];
  incidents: LiveIncident[];
  liveIndicator: LiveIndicator;
  /** Dev mode: the renderer is showing its own fixtures, not a live session. */
  useFixtures: boolean;

  /**
   * Incidents with no decision record at all. Deferred incidents are
   * deliberately absent from this: the steward has already dealt with them by
   * saying "not live", and a badge that keeps counting them would train them to
   * ignore it.
   */
  unreviewedCount: number;
  flaggedCount: number;
  deferredCount: number;
  decidedCount: number;
  /**
   * Unreviewed incidents in the *running* session, whichever segment is being
   * read.
   *
   * The one count that deliberately does not follow the selection. Every other
   * number here describes what is on screen; this one is the rail badge, which
   * is the app's only persistent "there is work waiting" signal — and a badge
   * that went quiet because the steward opened practice would hide a race
   * filling up with incidents behind them. Identical to `unreviewedCount`
   * whenever the running session is the one being read, which is almost always.
   */
  liveUnreviewedCount: number;

  /* Selection. Held here so it survives navigating between live sections. */
  selectedIncidentId?: string;
  selectedIncident?: LiveIncident;
  /** Which driver a penalty would be assigned to, defaults resolved. */
  targetSteamId?: string;
  stateFilter: LiveIncidentState | 'ALL';
  /**
   * The rest of the quick filters. Held here rather than in the incidents view
   * because they outlive it: a filter the steward set survives navigating to
   * another section and back, and Step 7's timing view shares the class filter.
   */
  incidentFilters: LiveIncidentFilters;
  /** Derived from every incident, not the filtered ones — see the builder. */
  incidentFilterOptions: LiveIncidentFilterOptions;

  /**
   * The car class the timing side of the shell is narrowed to, or `ALL`.
   *
   * Held here because it outlives the timing view: the track map and the
   * pressure monitor both apply it, and all three are meant to agree about
   * which cars the steward is watching.
   *
   * Deliberately *not* the same value as `incidentFilters.carClass`. They read
   * alike and mean different things — one narrows a session's history, the
   * other narrows the field on track — and a steward filtering the timing
   * screen to GT3 would be surprised to find their incident queue had quietly
   * hidden every Hypercar contact.
   */
  classFilter: string;
  /** Every class present in the field, with its car count, in field order. */
  fieldByClass: { carClass: string; count: number }[];

  /**
   * The running session's track geometry, for the live map.
   *
   * Here rather than in the timing view for the same reason the poll is: it is
   * one fetch per session, and a view that owned it would re-request 107 KB
   * every time the steward navigated back to it — and start again from "not
   * ready yet" each time.
   */
  trackMap: LiveTrackMapResult;

  /**
   * Every call already made in this session, indexed by the driver it concerns.
   * Keyed on the same identity the standings and incident parties use, so a
   * lookup works from either side.
   */
  priorCallsByDriver: Map<string, LivePriorCall[]>;
  /**
   * Penalties the *steward* has assigned, per driver — the other half of the
   * watchlist's penalty picture. LMU's own `outstandingPenalties` counts what
   * the game is making a driver serve; this counts what the steward has called
   * and the game knows nothing about.
   */
  stewardPenaltiesByDriver: Map<string, number>;

  /**
   * The optional explanation attached to the next call, held here rather than
   * in the dossier so the keyboard path picks it up too. A steward who types a
   * reason and then hits `1` would otherwise watch it vanish.
   */
  reasoningDraft: string;

  /**
   * The slot the camera is on.
   *
   * Now a readout rather than a wish. It is still set optimistically when the
   * app moves the camera — a control that waits for a round trip before naming
   * the car it just moved to feels broken — but it is reconciled against
   * `GET /rest/watch/focus` on every poll tick, so a camera moved from inside
   * the game or by LMU's own auto-director corrects it within a second.
   */
  focusedSlotId?: number;
  /**
   * Whether anything can drive the camera at all: a live session, or dev mode's
   * fixtures standing in for one.
   *
   * Resolved here rather than in the shell so the bar's existence, the poll that
   * feeds it and the shell's bottom padding are one decision. They were briefly
   * three, and a bar that renders without its poll is a bar that guesses.
   */
  canDriveCamera: boolean;
  /**
   * Whether the *game* is showing a rewound picture rather than the live edge.
   *
   * Null when it could not be asked. Polled, never assumed:
   * `/rest/replay/toggleactive` is a toggle with no setter, and the steward can
   * press the game's own LIVE button at any moment — a footer holding its own
   * idea of this would offer "View live" while already live, and toggle
   * *into* a replay.
   *
   * The rest of the app stays live while this is true, and says so. Scoring
   * does not follow the picture: standings, timing, the track map and the
   * pressure monitor all keep showing the running session. That is the same
   * ruling segment selection took — a half-moved view is worse than either
   * whole one — and the reason the footer announces the split in words.
   */
  isReplayActive: boolean | null;
  /** What the game reports its camera is doing, for the bar to reconcile against. */
  gameCamera?: LiveGameCameraReading;

  /*
    Every callback below is referentially stable for the life of the provider.
    That is load-bearing, not incidental: `LiveTriageRow` is memoised, and a
    provider that handed down a fresh arrow function each render would
    re-render all four hundred rows every poll tick with no test failing.
    See LiveSessionContext.stability.test.tsx.
  */
  onSelectIncident: (incidentId: string) => void;
  /**
   * Open a segment of this weekend.
   *
   * Choosing the running one returns to following it, rather than pinning it —
   * so a steward who clicks "Race" while the race is on is still moved to
   * qualifying automatically if the game goes back to qualifying.
   */
  onSelectSegment: (sessionKey: string) => void;
  onSelectTarget: (steamId: string) => void;
  onChangeStateFilter: (next: LiveIncidentState | 'ALL') => void;
  onChangeClassFilter: (next: string) => void;
  /** Patches one filter without the caller having to hold the rest. */
  onChangeIncidentFilters: (patch: Partial<LiveIncidentFilters>) => void;
  onResetIncidentFilters: () => void;
  onChangeReasoning: (next: string) => void;
  onFocusCar: (slotId: number | undefined) => void;
  /** Step the camera through the field, honouring the class filter. */
  onCycleFocus: (direction: 'previous' | 'next') => void;
  /**
   * Rewind the game's picture to just before an incident, without leaving the
   * live session.
   *
   * One call, because the sequence behind it is not separable: entering replay
   * mode on its own lands at lap 1, and a seek sent before the mode change is
   * inert. Main reads `isActive` and does both in order.
   */
  onRewatchIncident: (incidentId: string) => void;
  /** Put the picture back on the live edge. A no-op if it is already there. */
  onReturnToLive: () => void;
  onFlag: (incidentId: string) => void;
  onDefer: (incidentId: string) => void;
  onDecide: (incidentId: string, outcome: LiveDecisionOutcome) => void;
}

const LiveSessionContext = createContext<LiveSessionContextValue | undefined>(
  undefined,
);

export const LiveSessionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { pathname } = useLocation();
  const {
    isConnected,
    hasApiStatusResponse,
    liveSessionStatus,
    stewardDecisions,
    saveStewardDecision,
    stewardAuthor,
    stewardActions,
  } = useApi();

  /*
    One poller for the whole shell. Each section mounting its own would
    multiply the IPC traffic, and — since the incident build cache lives in the
    hook — give each section a cache of its own to warm up from cold on every
    navigation.
  */
  const {
    data: liveData,
    standings: liveStandings,
    incidents: liveIncidents,
    sessionKey: liveSessionKey,
  } = useLiveSessionData();

  const liveIndicator = deriveLiveIndicator({
    isConnected,
    hasApiStatusResponse,
    liveSessionStatus,
  });

  // Devmode serves mocks from main and keeps the renderer on its own fixtures,
  // so the layout stays iterable without a running game.
  const useFixtures =
    (liveData as { useRendererFixtures?: boolean }).useRendererFixtures ===
    true;

  /*
    No camera controls when there is nothing to drive, and — the reason this
    lives here rather than in the shell — no poll either. A camera control that
    cannot move a camera is worse than none: the steward presses it, nothing
    happens, and they learn to distrust the row.
  */
  const canDriveCamera = useFixtures || liveIndicator.state === 'live';

  const { isReplayActive, camera: gameCamera } =
    useLiveGameState(canDriveCamera);

  const [selectedIncidentId, setSelectedIncidentId] = useState<
    string | undefined
  >();
  /**
   * A segment the steward has deliberately opened, or undefined for "follow the
   * running session".
   *
   * Undefined rather than "the active key" so the transition from practice to
   * qualifying carries a steward who was watching live along with it, while
   * leaving one who had opened a record where they put themselves. Storing the
   * active key would make those two states indistinguishable.
   */
  const [pinnedSegmentKey, setPinnedSegmentKey] = useState<
    string | undefined
  >();
  // Which driver a penalty would be assigned to. A penalty against a two-car
  // incident with no target is a call nobody can act on.
  const [targetSteamId, setTargetSteamId] = useState<string | undefined>();
  const [stateFilter, setStateFilter] = useState<LiveIncidentState | 'ALL'>(
    'ALL',
  );
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [focusedSlotId, setFocusedSlotId] = useState<number | undefined>();
  // The slot the app has asked for and the game has not yet confirmed.
  const pendingFocusRef = useRef<
    { slotId: number; requestedAt: number } | undefined
  >(undefined);
  const [incidentFilters, setIncidentFilters] = useState<LiveIncidentFilters>(
    DEFAULT_LIVE_INCIDENT_FILTERS,
  );
  // Cleared when the steward moves on, and again once a call is written — a
  // reason left over from the last incident is worse than none.
  const [reasoningDraft, setReasoningDraft] = useState('');

  /*
    Both raw enough to be referentially stable for the life of the provider:
    the patch form reads the previous value from the setter rather than closing
    over it, so neither depends on anything that changes on a poll tick.
  */
  const onChangeIncidentFilters = useCallback(
    (patch: Partial<LiveIncidentFilters>) =>
      setIncidentFilters((current) => ({ ...current, ...patch })),
    [],
  );
  const onResetIncidentFilters = useCallback(
    () => setIncidentFilters(DEFAULT_LIVE_INCIDENT_FILTERS),
    [],
  );

  const liveSourceIncidents = useFixtures
    ? liveIncidentsFixture
    : liveIncidents;
  const standings = useFixtures ? liveStandingsFixture : liveStandings;
  // Memoised for its identity, not its cost: `battles` defaults to a literal
  // when capture sends none, and a fresh `[]` every render would churn the
  // context value on a tick where nothing happened.
  const battles = useMemo(
    () => (useFixtures ? livePressureFixture : (liveData.battles ?? [])),
    [liveData.battles, useFixtures],
  );

  /*
    Dev mode takes the whole session from the fixture rather than from the mock
    status line. Devmode reports a live session, so `buildSessionState` would
    otherwise take its live branch and hand the header a session with no clock,
    no conditions and no laps — the one place where a fixture is the honest
    answer, since the shell already labels the view as fixture data.
  */
  const session = useMemo(
    () =>
      useFixtures
        ? liveSessionFixture
        : buildSessionState(liveData, liveSessionFixture),
    [liveData, useFixtures],
  );

  /*
    Keyed on the track rather than on the session: the geometry is a property of
    the circuit, so running practice then qualifying at the same venue must not
    throw away a map that is still correct. Asked for only once there is a
    session to draw — or in dev mode, where main serves the mock geometry.
  */
  const trackMap = useLiveTrackMap(
    session.trackName,
    useFixtures || liveIndicator.state === 'live',
  );

  /*
    The field breakdown behind the header's class counts and the timing view's
    filter chips. In field order, so the fastest class leads — which is the
    order a steward reads the timing screen in anyway.
  */
  const fieldByClass = useMemo(() => {
    const counts = new Map<string, number>();
    standings.forEach((standing) => {
      counts.set(standing.carClass, (counts.get(standing.carClass) ?? 0) + 1);
    });
    return [...counts.entries()].map(([carClass, count]) => ({
      carClass,
      count,
    }));
  }, [standings]);

  /*
    The session's real key, as capture persisted it. This used to be derived
    here as `track|type`, which matched no session on disk — so a live call
    could never be reconciled with the session it belonged to, nor revised
    against the replay afterwards. Falls back to the old shape only when capture
    has not supplied one, which is dev-mode fixtures.
  */
  const activeSessionKey =
    liveSessionKey || `${session.trackName}|${session.sessionType}`;

  /*
    Gated on there being a session to group around. With the game closed the
    session state falls back to the fixture, so an ungated fetch would ask for
    the segments of whatever track the fixture names — and get either nothing or
    somebody else's weekend.
  */
  const {
    segments,
    record: segmentRecord,
    loading: segmentRecordLoading,
  } = useLiveSessionSegments(
    activeSessionKey,
    pinnedSegmentKey,
    useFixtures || liveIndicator.state === 'live',
  );

  /*
    Pinning the running session is not reviewing a record — it is the ordinary
    case, and it is also what the picker collapses a click on the live segment
    into.
  */
  const isReviewingRecord =
    pinnedSegmentKey !== undefined && pinnedSegmentKey !== activeSessionKey;
  const sessionKey = isReviewingRecord ? pinnedSegmentKey : activeSessionKey;
  const selectedSegment = segments.find(
    (segment) => segment.sessionKey === sessionKey,
  );

  /*
    A pin has to be given up when the segment behind it goes away — the steward
    moved to another track, or deleted the capture. Guarded on the list being
    non-empty, because "not loaded yet" and "no longer there" look identical
    from here and dropping the pin on the first render would undo the selection
    before its record ever arrived.
  */
  useEffect(() => {
    if (pinnedSegmentKey === undefined || segments.length === 0) {
      return;
    }
    if (!segments.some((segment) => segment.sessionKey === pinnedSegmentKey)) {
      setPinnedSegmentKey(undefined);
    }
  }, [pinnedSegmentKey, segments]);

  /*
    The queue's source. A record is a fixed list read once from disk, so the
    1 Hz poll cannot overwrite it a second after the steward opened it: the poll
    writes `liveIncidents`, and while a record is open nothing reads that.

    `NO_INCIDENTS` rather than the live list while a record is loading. Showing
    the running session's incidents under a "Practice 1" heading for the half a
    second the read takes would be a lie, and briefly showing an empty queue is
    not.
  */
  const sourceIncidents = isReviewingRecord
    ? segmentRecord?.sessionKey === sessionKey
      ? segmentRecord.incidents
      : NO_INCIDENTS
    : liveSourceIncidents;

  // Decisions are persisted records, not view state, so a call survives a
  // reload, a navigation away, and the incident list being replaced every poll.
  const decisionsByIncident = useMemo(
    () => buildDecisionIndex(stewardDecisions, sessionKey),
    [sessionKey, stewardDecisions],
  );

  /*
    The dossier's history, for the session being read. Depends on nothing that
    changes on a poll tick, so the map — and every list in it — keeps its
    identity between decisions.
  */
  const priorCallsByDriver = useMemo(
    () => buildPriorCallsByDriver(stewardDecisions, sessionKey),
    [sessionKey, stewardDecisions],
  );

  /*
    The watchlist's penalty column, for the session being *driven*.

    Deliberately not the selected segment's, and this was wrong first time
    round: the watchlist is a live panel — its rows are the cars on track, its
    incident and track-limit tallies come from the running session — so taking
    one column of it from a record put "1 steward" against a driver whose live
    row said nothing had happened. Seen against a real Laguna practice.

    Reuses the map above whenever the two sessions are the same, which is almost
    always.
  */
  const stewardPenaltiesByDriver = useMemo(
    () =>
      countPenaltiesByDriver(
        isReviewingRecord
          ? buildPriorCallsByDriver(stewardDecisions, activeSessionKey)
          : priorCallsByDriver,
      ),
    [activeSessionKey, isReviewingRecord, priorCallsByDriver, stewardDecisions],
  );

  const incidents = useMemo<LiveIncident[]>(
    () => applyDecisions(sourceIncidents, decisionsByIncident),
    [decisionsByIncident, sourceIncidents],
  );

  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);

  /*
    A solo incident has one party, so targeting it needs no extra keystroke.

    Derived rather than written into state, for the same reason: anything stored
    from the incident list is at the mercy of the next poll. A contact has no
    default, because picking either driver would be the app quietly deciding
    fault.
  */
  const effectiveTargetSteamId =
    targetSteamId ??
    (selectedIncident?.drivers.length === 1
      ? selectedIncident.drivers[0].steamId
      : undefined);

  const counts = useMemo(
    () =>
      incidents.reduce(
        (acc, incident) => {
          if (incident.state === 'NEW') {
            acc.unreviewed += 1;
          } else if (incident.state === 'FLAGGED') {
            acc.flagged += 1;
          } else if (incident.state === 'DEFERRED') {
            acc.deferred += 1;
          } else {
            acc.decided += 1;
          }
          return acc;
        },
        { unreviewed: 0, flagged: 0, deferred: 0, decided: 0 },
      ),
    [incidents],
  );

  /*
    The rail badge's number, which is the running session's even while a record
    is open. Costs a second index and a scan only in that state; the ordinary
    case reuses what has already been computed.
  */
  const liveUnreviewedCount = useMemo(() => {
    if (!isReviewingRecord) {
      return counts.unreviewed;
    }
    return countUnreviewed(
      liveSourceIncidents,
      buildDecisionIndex(stewardDecisions, activeSessionKey),
    );
  }, [
    activeSessionKey,
    counts.unreviewed,
    isReviewingRecord,
    liveSourceIncidents,
    stewardDecisions,
  ]);

  /*
    Over every incident, not the filtered ones. Options that narrow themselves
    as filters are applied leave the steward unable to switch from one driver to
    another without clearing first. Recomputed only when the incident list
    genuinely changes — the build cache upstream keeps its identity across a
    quiet poll tick, which is what makes a memo over 400 incidents free.
  */
  const incidentFilterOptions = useMemo(
    () => buildLiveIncidentFilterOptions(incidents),
    [incidents],
  );

  /*
    What a call written right now is a call *about*.

    Taken from the segment being read, not from the running session. Without
    this, resolving a deferred practice incident during the race would write a
    record saying the incident happened in the race — and the denormalised type
    is what a decision is read back by once the capture behind it has expired.

    `serverName` is deliberately dropped for a record: it is not stored on the
    session row, and the running session's server is not this segment's.
  */
  const decisionIdentity = useMemo<DecisionSessionIdentity>(
    () =>
      isReviewingRecord
        ? {
            trackName: selectedSegment?.trackName ?? session.trackName,
            sessionType: selectedSegment?.sessionType ?? session.sessionType,
          }
        : {
            trackName: session.trackName,
            sessionType: session.sessionType,
            serverName: session.serverName || undefined,
          },
    [isReviewingRecord, selectedSegment, session],
  );

  /*
    Everything the callbacks below need, read at call time rather than closed
    over.

    The alternative — depending on `incidents` and `session` — rebuilds
    `onFlag` and `onDecide` on every poll tick, because both are new objects
    every tick. Those callbacks reach the dossier *and* the triage rows, and an
    unstable prop there defeats the memo on every row in the queue. Written
    during render, matching `useLiveIncidentContext`'s `wanted` ref: a keypress
    or a click always reads the render that is on screen.
  */
  const latest = useRef({
    incidents,
    decisionIdentity,
    sessionKey,
    stewardAuthor,
    stewardActions,
    activeSessionKey,
    selectedIncidentId,
    effectiveTargetSteamId,
    reasoningDraft,
    standings,
    classFilter,
    focusedSlotId,
  });
  latest.current = {
    incidents,
    decisionIdentity,
    sessionKey,
    stewardAuthor,
    stewardActions,
    activeSessionKey,
    selectedIncidentId,
    effectiveTargetSteamId,
    reasoningDraft,
    standings,
    classFilter,
    focusedSlotId,
  };

  /*
    Clicking the running session returns to following it rather than pinning it,
    so the picker has one control and not two — "Race" and "back to live" are
    the same button when the race is the live session.

    The selection is dropped with it: an incident id from practice means nothing
    in the race's queue, and leaving it set would show the steward a dossier for
    an incident that is no longer in the list beside it.
  */
  const onSelectSegment = useCallback((key: string) => {
    setPinnedSegmentKey(
      key === latest.current.activeSessionKey ? undefined : key,
    );
    setSelectedIncidentId(undefined);
  }, []);

  const onFlag = useCallback(
    (incidentId: string) => {
      const {
        incidents: held,
        decisionIdentity: heldIdentity,
        sessionKey: heldKey,
        stewardAuthor: heldAuthor,
        reasoningDraft: heldReasoning,
      } = latest.current;
      const incident = held.find((entry) => entry.id === incidentId);
      if (!incident) {
        return;
      }

      /*
        A flag carries the reason too, where one was typed. The record schema
        allows it on any state, and dropping a steward's note because they
        parked the incident rather than calling it would lose the one sentence
        that explains why they parked it.
      */
      saveStewardDecision(
        buildDecision(
          incident,
          heldIdentity,
          heldKey,
          heldAuthor,
          'FLAGGED',
          undefined,
          undefined,
          heldReasoning,
        ),
      );
      setReasoningDraft('');
    },
    [saveStewardDecision],
  );

  /*
    "Not for now, and not because I ran out of time." Recorded as its own state
    so the flags left at the chequered flag are the ones that genuinely went
    unresolved.

    What consumes it — an end-of-session prompt, and surfacing deferrals in the
    replay view once the session is linked — is not built. This records the
    state; nothing reads it back yet beyond the queue.
  */
  const onDefer = useCallback(
    (incidentId: string) => {
      const {
        incidents: held,
        decisionIdentity: heldIdentity,
        sessionKey: heldKey,
        stewardAuthor: heldAuthor,
        reasoningDraft: heldReasoning,
      } = latest.current;
      const incident = held.find((entry) => entry.id === incidentId);
      if (!incident) {
        return;
      }

      saveStewardDecision(
        buildDecision(
          incident,
          heldIdentity,
          heldKey,
          heldAuthor,
          'DEFERRED',
          undefined,
          undefined,
          heldReasoning,
        ),
      );
      setReasoningDraft('');
    },
    [saveStewardDecision],
  );

  const onDecide = useCallback(
    (incidentId: string, outcome: LiveDecisionOutcome) => {
      const {
        incidents: held,
        decisionIdentity: heldIdentity,
        sessionKey: heldKey,
        stewardAuthor: heldAuthor,
        stewardActions: heldActions,
        effectiveTargetSteamId: heldTarget,
        reasoningDraft: heldReasoning,
      } = latest.current;
      const incident = held.find((entry) => entry.id === incidentId);
      if (!incident) {
        return;
      }

      /*
        Whether this call names a driver is the action's own property, and the
        record follows it rather than following whoever happens to be selected.

        A finding about the incident as a whole is written with no target even
        when a driver is highlighted — `types.ts` has always said so, and it is
        what makes `target` the durable answer to "was this a call against
        someone" once the tariff behind it has moved on. Writing the selection
        onto a "No Action" would also mark that driver at fault in the replay
        dossier, which is the app deciding fault.
      */
      const needsTarget = isDriverScopedOutcome(heldActions, outcome);
      const target = needsTarget
        ? incident.drivers.find((driver) => driver.steamId === heldTarget)
        : undefined;

      // A penalty without a target is not a call. The dossier disables these
      // buttons, and this refuses the keyboard path for the same reason.
      if (needsTarget && !target) {
        return;
      }

      saveStewardDecision(
        buildDecision(
          incident,
          heldIdentity,
          heldKey,
          heldAuthor,
          'DECIDED',
          outcome,
          target,
          heldReasoning,
        ),
      );
      setReasoningDraft('');
    },
    [saveStewardDecision],
  );

  /*
    Cleared only when the steward moves to a different incident.

    Deliberately not keyed on the incident list: that array is rebuilt on every
    poll, once a second, so depending on it here wiped the steward's selection a
    second after they made it.
  */
  useEffect(() => {
    setTargetSteamId(undefined);
    setReasoningDraft('');
  }, [selectedIncidentId]);

  // Camera dispatch. LMU's /rest/watch/focus takes a slot id, so this is the one
  // place a slot is the right key rather than the driver's identity. The seek
  // half of the replay view's jump action is meaningless live and is not sent.
  const onFocusCar = useCallback((slotId: number | undefined) => {
    if (slotId === undefined) {
      return;
    }
    sendMessage(CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR, String(slotId));
    // Held so the camera bar can name the car it just moved to, and so
    // stepping through the field continues from wherever the steward jumped.
    setFocusedSlotId(slotId);
    pendingFocusRef.current = { slotId, requestedAt: Date.now() };
  }, []);

  /*
    Reconciling the app's pointer with the camera the game is actually on.

    The defect this fixes, reproduced live: step via the app to classification
    index 25, move the camera out-of-band to index 2 as LMU's own controls or
    its auto-director would, press **next** once — and it goes to index 26, its
    own pointer plus one, yanking the camera off what was on screen and then
    naming the wrong driver. Stepping now starts from what the game reports.

    A command the app has issued outranks the reading until the game confirms
    it. Without that, stepping would fight itself: `onFocusCar` is optimistic by
    design — twenty clicks at 142 ms apiece land twenty exact steps precisely
    because nothing waits for a round trip — and a poll landing between the
    click and the PUT would drag the pointer back one place. The pending slot is
    cleared the moment the game agrees, and abandoned after
    `FOCUS_CONFIRM_TIMEOUT_MS` whether it agrees or not: an app that cannot get
    its way is the case where trusting its own pointer is *most* wrong.

    Keyed on the reading object, not on the slot id, because the failure being
    caught is a request that changed nothing — "the value is the same as last
    tick" is the symptom, not a reason to skip the check.
  */
  useEffect(() => {
    const reported = gameCamera?.focusedSlotId;
    if (reported === undefined) {
      return;
    }

    const pending = pendingFocusRef.current;
    if (pending) {
      if (pending.slotId === reported) {
        pendingFocusRef.current = undefined;
      } else if (Date.now() - pending.requestedAt < FOCUS_CONFIRM_TIMEOUT_MS) {
        return;
      } else {
        pendingFocusRef.current = undefined;
      }
    }

    setFocusedSlotId((previous) =>
      previous === reported ? previous : reported,
    );
  }, [gameCamera]);

  /*
    Rewatching, and returning to live.

    Both are single messages because both are read-then-act sequences against a
    toggle with no setter, and main is where that read belongs — see
    `POST_REPLAY_REWATCH` in `constants.ts`. The renderer deliberately holds no
    "we are in replay now" flag of its own: the poll answers that, and a second
    copy would be the same defect as the camera pointer wearing a different hat.

    Nothing else moves. The timing screen, track map, pressure monitor and
    standings stay on the running session while the game shows a rewound
    picture, because scoring does not follow the replay — verified live, and the
    reason a live capture survives this at all.
  */
  const onRewatchIncident = useCallback((incidentId: string) => {
    const { incidents: held, effectiveTargetSteamId: heldTarget } =
      latest.current;
    const incident = held.find((entry) => entry.id === incidentId);
    if (!incident) {
      return;
    }

    /*
      Which car the camera lands on.

      The penalty target when the steward has picked one, otherwise the first
      party with a slot — the same preference the replay view's jump already
      makes (`resolveIncidentFocusTarget`). Usually nobody has picked yet at the
      moment Rewatch is pressed, so in practice this is the first driver; but a
      steward who *has* named a target is telling us who they are interested in,
      and swinging the camera to the other car would contradict them.

      Falls through to the first slot-bearing party rather than the literal
      first, because a party whose slot never reached the capture cannot be
      addressed — LMU's focus endpoint takes nothing but a slot.
    */
    const withSlot = incident.drivers.filter(
      (driver) => driver.slotId !== undefined,
    );
    const focus =
      withSlot.find((driver) => driver.steamId === heldTarget) ?? withSlot[0];

    /*
      The rewatch owns the camera from here, so a step the steward made a moment
      ago must stop outranking what the game reports — otherwise the confirm
      gate would suppress the new position for up to three seconds and the bar
      would name the car they were watching before.
    */
    pendingFocusRef.current = undefined;

    sendMessage(CONSTANTS.API.POST_REPLAY_REWATCH, {
      etSeconds: incident.etSeconds,
      slotId: focus?.slotId,
    });
  }, []);

  const onReturnToLive = useCallback(() => {
    sendMessage(CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE);
  }, []);

  /*
    Stepping the camera through the field, one car at a time.

    Ordered by the classification and narrowed by the class filter, so a
    steward watching GT3 steps through GT3 and nothing else — the same filter
    the timing screen is showing. Cars with no slot are skipped rather than
    silently doing nothing: the slot is what LMU's focus endpoint addresses,
    and the layout fixtures do not carry one.

    Starting fresh from either end rather than from the middle, because "next"
    before anything has been focused should mean the leader, not car two.
  */
  const onCycleFocus = useCallback(
    (direction: 'previous' | 'next') => {
      const {
        standings: held,
        classFilter: heldClass,
        focusedSlotId: current,
      } = latest.current;

      const cars = held.filter(
        (standing) =>
          standing.slotId !== undefined &&
          (heldClass === 'ALL' || standing.carClass === heldClass),
      );
      if (cars.length === 0) {
        return;
      }

      const at = cars.findIndex((standing) => standing.slotId === current);
      if (at === -1) {
        onFocusCar(
          direction === 'next' ? cars[0].slotId : cars[cars.length - 1].slotId,
        );
        return;
      }

      const step = direction === 'next' ? 1 : -1;
      onFocusCar(cars[(at + step + cars.length) % cars.length].slotId);
    },
    [onFocusCar],
  );

  const shortcutsEnabled = SHORTCUT_ROUTES.has(
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname,
  );

  useEffect(() => {
    if (!shortcutsEnabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      /*
        The shortcuts live on `window`, and the dossier now has a text field in
        it. Without this, typing "contact at turn 1" into the reasoning box
        would issue a drive-through on the `3` and flag the incident on the `f`.
      */
      const source = event.target as HTMLElement | null;
      if (
        source?.isContentEditable ||
        (source?.tagName && EDITABLE_TAGS.has(source.tagName))
      ) {
        return;
      }

      const { incidents: current, selectedIncidentId: selected } =
        latest.current;
      if (!selected) {
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        onFlag(selected);
        return;
      }
      if (event.key.toLowerCase() === 'd') {
        onDefer(selected);
        return;
      }

      // Picking the target is one keypress, so a contact stays a two-key call.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const parties =
          current.find((entry) => entry.id === selected)?.drivers ?? [];
        if (parties.length === 0) {
          return;
        }
        const at = parties.findIndex(
          (driver) => driver.steamId === latest.current.effectiveTargetSteamId,
        );
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next =
          at === -1 ? 0 : (at + step + parties.length) % parties.length;
        setTargetSteamId(parties[next].steamId);
        return;
      }
      /*
        Derived from the configured order, from the same rule that prints the key
        on each button — so a keystroke and the button beside it cannot come to
        mean different things.
      */
      const outcome = outcomeForShortcut(
        latest.current.stewardActions,
        event.key,
      );
      if (outcome) {
        onDecide(selected, outcome);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDecide, onDefer, onFlag, shortcutsEnabled]);

  const contextValue = useMemo<LiveSessionContextValue>(
    () => ({
      session,
      sessionKey,
      activeSessionKey,
      segments,
      selectedSegment,
      isReviewingRecord,
      segmentRecordLoading,
      standings,
      battles,
      incidents,
      liveIndicator,
      useFixtures,
      unreviewedCount: counts.unreviewed,
      flaggedCount: counts.flagged,
      deferredCount: counts.deferred,
      decidedCount: counts.decided,
      liveUnreviewedCount,
      selectedIncidentId,
      selectedIncident,
      targetSteamId: effectiveTargetSteamId,
      stateFilter,
      incidentFilters,
      incidentFilterOptions,
      classFilter,
      fieldByClass,
      trackMap,
      priorCallsByDriver,
      stewardPenaltiesByDriver,
      reasoningDraft,
      focusedSlotId,
      canDriveCamera,
      isReplayActive,
      gameCamera,
      onSelectIncident: setSelectedIncidentId,
      onSelectSegment,
      onSelectTarget: setTargetSteamId,
      onChangeStateFilter: setStateFilter,
      onChangeClassFilter: setClassFilter,
      onChangeIncidentFilters,
      onResetIncidentFilters,
      onChangeReasoning: setReasoningDraft,
      onFocusCar,
      onCycleFocus,
      onRewatchIncident,
      onReturnToLive,
      onFlag,
      onDefer,
      onDecide,
    }),
    [
      activeSessionKey,
      battles,
      canDriveCamera,
      classFilter,
      counts,
      effectiveTargetSteamId,
      fieldByClass,
      focusedSlotId,
      gameCamera,
      isReplayActive,
      onCycleFocus,
      onRewatchIncident,
      onReturnToLive,
      incidentFilterOptions,
      incidentFilters,
      incidents,
      isReviewingRecord,
      liveIndicator,
      liveUnreviewedCount,
      onChangeIncidentFilters,
      onDecide,
      onDefer,
      onFlag,
      onFocusCar,
      onResetIncidentFilters,
      onSelectSegment,
      priorCallsByDriver,
      reasoningDraft,
      segmentRecordLoading,
      segments,
      selectedIncident,
      selectedIncidentId,
      selectedSegment,
      session,
      sessionKey,
      standings,
      stateFilter,
      stewardPenaltiesByDriver,
      trackMap,
      useFixtures,
    ],
  );

  return (
    <LiveSessionContext.Provider value={contextValue}>
      {children}
    </LiveSessionContext.Provider>
  );
};

export const useLiveSession = (): LiveSessionContextValue => {
  const value = useContext(LiveSessionContext);
  if (!value) {
    throw new Error('useLiveSession must be used inside a LiveSessionProvider');
  }
  return value;
};
