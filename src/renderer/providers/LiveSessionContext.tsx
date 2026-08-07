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
import { StewardDecision, StewardDecisionState } from '@types';
import { sendMessage } from '../utils/postMessage';
import { buildStewardDecisionId } from '../utils/stewardDecisionId';
import { useApi } from './ApiContext';
import { LiveIndicator, deriveLiveIndicator } from '../hooks/useLiveIndicator';
import {
  buildSessionState,
  useLiveSessionData,
} from '../hooks/useLiveSessionData';
import {
  DEFAULT_LIVE_INCIDENT_FILTERS,
  LiveDecisionOutcome,
  LiveDriverRef,
  LiveIncident,
  LiveIncidentFilterOptions,
  LiveIncidentFilters,
  LiveIncidentState,
  LivePressureBattle,
  LiveSessionState,
  LiveStanding,
  buildLiveIncidentFilterOptions,
  isDriverScopedOutcome,
  liveIncidentsFixture,
  livePressureFixture,
  liveSessionFixture,
  liveStandingsFixture,
} from '../components/Live/liveFixtures';

/**
 * Present from day one even in single-steward use. Multi-steward panels are the
 * most likely future request, and adding the field later means a migration.
 */
const STEWARD_AUTHOR = 'Steward';

const shortcutToOutcome: Record<string, LiveDecisionOutcome> = {
  '1': 'penalty-5s',
  '2': 'penalty-10s',
  '3': 'drive-through',
  '4': 'no-action',
  '5': 'note',
};

/**
 * Where `1`–`5` and `F` mean "call this incident".
 *
 * Scoped rather than global because the live shell now has sections that are
 * not about adjudicating: a steward reading a timing screen must be able to
 * type without issuing penalties against whatever was last selected.
 */
const SHORTCUT_ROUTES = new Set(['/live', '/live/incidents']);

/**
 * Builds the durable record. Session, driver, time and classification are
 * denormalised onto it deliberately: live incident ids do not survive a
 * sidecar restart, so the decision has to stand on its own.
 */
const buildDecision = (
  incident: LiveIncident,
  session: LiveSessionState,
  sessionKey: string,
  state: StewardDecisionState,
  outcome?: LiveDecisionOutcome,
  target?: LiveDriverRef,
): StewardDecision => ({
  id: buildStewardDecisionId(sessionKey, incident.id, target?.steamId),
  basis: 'incident',
  incidentId: incident.id,
  sessionKey,
  sessionTrack: session.trackName,
  sessionType: session.sessionType,
  sessionDate: Date.now(),
  serverName: session.serverName || undefined,
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
  stewardAuthor: STEWARD_AUTHOR,
  decidedAt: Date.now(),
  state,
  // Provisional until the session syncs and the call can be reviewed against
  // the full replay.
  status: 'provisional',
  revisions: [],
});

export interface LiveSessionContextValue {
  /* Session-wide data, polled once for the whole shell. */
  session: LiveSessionState;
  sessionKey: string;
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

  /*
    Every callback below is referentially stable for the life of the provider.
    That is load-bearing, not incidental: `LiveTriageRow` is memoised, and a
    provider that handed down a fresh arrow function each render would
    re-render all four hundred rows every poll tick with no test failing.
    See LiveSessionContext.stability.test.tsx.
  */
  onSelectIncident: (incidentId: string) => void;
  onSelectTarget: (steamId: string) => void;
  onChangeStateFilter: (next: LiveIncidentState | 'ALL') => void;
  /** Patches one filter without the caller having to hold the rest. */
  onChangeIncidentFilters: (patch: Partial<LiveIncidentFilters>) => void;
  onResetIncidentFilters: () => void;
  onFocusCar: (slotId: number | undefined) => void;
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

  const [selectedIncidentId, setSelectedIncidentId] = useState<
    string | undefined
  >();
  // Which driver a penalty would be assigned to. A penalty against a two-car
  // incident with no target is a call nobody can act on.
  const [targetSteamId, setTargetSteamId] = useState<string | undefined>();
  const [stateFilter, setStateFilter] = useState<LiveIncidentState | 'ALL'>(
    'ALL',
  );
  const [incidentFilters, setIncidentFilters] = useState<LiveIncidentFilters>(
    DEFAULT_LIVE_INCIDENT_FILTERS,
  );

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

  const sourceIncidents = useFixtures ? liveIncidentsFixture : liveIncidents;
  const standings = useFixtures ? liveStandingsFixture : liveStandings;
  // Memoised for its identity, not its cost: `battles` defaults to a literal
  // when capture sends none, and a fresh `[]` every render would churn the
  // context value on a tick where nothing happened.
  const battles = useMemo(
    () => (useFixtures ? livePressureFixture : (liveData.battles ?? [])),
    [liveData.battles, useFixtures],
  );

  const session = useMemo(
    () => buildSessionState(liveData, liveSessionFixture),
    [liveData],
  );

  /*
    The session's real key, as capture persisted it. This used to be derived
    here as `track|type`, which matched no session on disk — so a live call
    could never be reconciled with the session it belonged to, nor revised
    against the replay afterwards. Falls back to the old shape only when capture
    has not supplied one, which is dev-mode fixtures.
  */
  const sessionKey =
    liveSessionKey || `${session.trackName}|${session.sessionType}`;

  // Decisions are persisted records, not view state, so a call survives a
  // reload, a navigation away, and the incident list being replaced every poll.
  const decisionsByIncident = useMemo(() => {
    const byIncident = new Map<string, StewardDecision[]>();

    Object.values(stewardDecisions).forEach((decision) => {
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
  }, [sessionKey, stewardDecisions]);

  /*
    Deliberately returns the incidents it was given, untouched, where no
    decision applies — so a quiet poll tick leaves both the array and every
    entry on it with the identity the build cache gave them.
  */
  const incidents = useMemo<LiveIncident[]>(
    () =>
      sourceIncidents.map((incident) => {
        const forIncident = decisionsByIncident.get(incident.id);
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
          Ranked, because an incident can carry more than one record: a
          per-driver call is keyed on its target, an incident-scoped one is not.
          A decision settles it, a deferral is a deliberate hand-off to
          post-session, and a flag is the weakest claim of the three.
        */
        if (forIncident.some((entry) => entry.state === 'DEFERRED')) {
          return { ...incident, state: 'DEFERRED' as const };
        }

        return { ...incident, state: 'FLAGGED' as const };
      }),
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
    session,
    sessionKey,
    selectedIncidentId,
    effectiveTargetSteamId,
  });
  latest.current = {
    incidents,
    session,
    sessionKey,
    selectedIncidentId,
    effectiveTargetSteamId,
  };

  const onFlag = useCallback(
    (incidentId: string) => {
      const {
        incidents: held,
        session: heldSession,
        sessionKey: heldKey,
      } = latest.current;
      const incident = held.find((entry) => entry.id === incidentId);
      if (!incident) {
        return;
      }

      saveStewardDecision(
        buildDecision(incident, heldSession, heldKey, 'FLAGGED'),
      );
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
        session: heldSession,
        sessionKey: heldKey,
      } = latest.current;
      const incident = held.find((entry) => entry.id === incidentId);
      if (!incident) {
        return;
      }

      saveStewardDecision(
        buildDecision(incident, heldSession, heldKey, 'DEFERRED'),
      );
    },
    [saveStewardDecision],
  );

  const onDecide = useCallback(
    (incidentId: string, outcome: LiveDecisionOutcome) => {
      const {
        incidents: held,
        session: heldSession,
        sessionKey: heldKey,
        effectiveTargetSteamId: heldTarget,
      } = latest.current;
      const incident = held.find((entry) => entry.id === incidentId);
      if (!incident) {
        return;
      }

      const target = incident.drivers.find(
        (driver) => driver.steamId === heldTarget,
      );

      // A penalty without a target is not a call. The dossier disables these
      // buttons, and this refuses the keyboard path for the same reason.
      if (isDriverScopedOutcome(outcome) && !target) {
        return;
      }

      saveStewardDecision(
        buildDecision(
          incident,
          heldSession,
          heldKey,
          'DECIDED',
          outcome,
          target,
        ),
      );
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
  }, [selectedIncidentId]);

  // Camera dispatch. LMU's /rest/watch/focus takes a slot id, so this is the one
  // place a slot is the right key rather than the driver's identity. The seek
  // half of the replay view's jump action is meaningless live and is not sent.
  const onFocusCar = useCallback((slotId: number | undefined) => {
    if (slotId === undefined) {
      return;
    }
    sendMessage(CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR, String(slotId));
  }, []);

  const shortcutsEnabled = SHORTCUT_ROUTES.has(
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname,
  );

  useEffect(() => {
    if (!shortcutsEnabled) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
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
      const outcome = shortcutToOutcome[event.key];
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
      standings,
      battles,
      incidents,
      liveIndicator,
      useFixtures,
      unreviewedCount: counts.unreviewed,
      flaggedCount: counts.flagged,
      deferredCount: counts.deferred,
      decidedCount: counts.decided,
      selectedIncidentId,
      selectedIncident,
      targetSteamId: effectiveTargetSteamId,
      stateFilter,
      incidentFilters,
      incidentFilterOptions,
      onSelectIncident: setSelectedIncidentId,
      onSelectTarget: setTargetSteamId,
      onChangeStateFilter: setStateFilter,
      onChangeIncidentFilters,
      onResetIncidentFilters,
      onFocusCar,
      onFlag,
      onDefer,
      onDecide,
    }),
    [
      battles,
      counts,
      effectiveTargetSteamId,
      incidentFilterOptions,
      incidentFilters,
      incidents,
      liveIndicator,
      onChangeIncidentFilters,
      onDecide,
      onDefer,
      onFlag,
      onFocusCar,
      onResetIncidentFilters,
      selectedIncident,
      selectedIncidentId,
      session,
      sessionKey,
      standings,
      stateFilter,
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
