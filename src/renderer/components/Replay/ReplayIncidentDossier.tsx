import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box } from '@mui/material';
import { CONSTANTS } from '@constants';
import {
  LiveDataForReplay,
  StewardDecision,
  StewardDecisionState,
} from '@types';
import { LiveIncidentDossier } from '../Live/LiveIncidentDossier';
import {
  LiveDecisionOutcome,
  LiveDriverRef,
  LiveIncident,
  LivePriorCall,
} from '../Live/liveFixtures';
import { isDriverScopedOutcome } from '../../utils/stewardActions';
import { buildIncidents } from '../../hooks/useLiveSessionData';
import { useLiveIncidentContext } from '../../hooks/useLiveIncidentContext';
import { sendMessage } from '../../utils/postMessage';
import { buildStewardDecisionId } from '../../utils/stewardDecisionId';
import { isStandingCall, toggledState } from '../../utils/stewardDecisionState';
import { useApi } from '../../providers/ApiContext';
import { ReplayIncidentEvent } from './replayTimelineTypes';

interface Props {
  event: ReplayIncidentEvent | undefined;
  liveData: LiveDataForReplay | null;
  replayHash: string | undefined;
}

/**
 * The replay timeline's three event types in live capture's vocabulary.
 *
 * The two do not line up exactly. A `penalty` row is a sanction the game
 * already issued, for any reason it liked, and live capture has no
 * classification for that — it names causes, not outcomes. It is filed under
 * `contact` because that is the closest of the five and because this field is
 * secondary metadata on the record: nothing branches on it, and the outcome the
 * steward chooses is what the decision actually says.
 */
const REPLAY_TYPE_CLASSIFICATION: Record<
  ReplayIncidentEvent['type'],
  LiveIncident['classification']
> = {
  collision: 'contact',
  'track-limit': 'track-limits',
  penalty: 'contact',
};

/** Shown in place of the evidence when live capture never saw this incident. */
const NO_CAPTURE_EXPLANATION =
  'No live session data was captured for this incident. The footage on screen is the evidence — a call made here is recorded the same way as one made against a captured incident.';

/**
 * Live capture's evidence for the incident the steward is looking at.
 *
 * The loop the whole design was built around closes here: live mode captures
 * calls under time pressure, and this is where they are confirmed or revised
 * with the footage on screen and the telemetry beside it.
 *
 * The dossier itself is live mode's, reused unchanged. Only the plumbing
 * differs — the incident comes off disk rather than out of a poll, and the
 * decision it produces is final rather than provisional.
 */
export const ReplayIncidentDossier: React.FC<Props> = ({
  event,
  liveData,
  replayHash,
}) => {
  const {
    stewardDecisions,
    saveStewardDecision,
    stewardAuthor,
    /*
      The same resolved tariff the live shell guards with. Read off the context
      rather than derived here: a call made live and revised in this view must be
      offered one vocabulary, not two.
    */
    stewardActions,
  } = useApi();
  const [targetSteamId, setTargetSteamId] = useState<string | undefined>();

  const liveIncidentId = event?.liveIncidentId;
  const { context } = useLiveIncidentContext(liveIncidentId);

  /*
    The key a decision made here is filed under.

    A capture supplies one; an incident the result log knows about and capture
    never saw does not, and an empty string would file every such call from
    every replay under ids that collide the moment two replays share an event
    id — which they do, because a replay event id is `collision-4-1434.4`, a
    position in one file rather than a name for a moment in a season.
  */
  const sessionKey =
    liveData?.sessionKey ?? (replayHash ? `replay|${replayHash}` : '');

  /**
   * An incident the result log has and live capture does not.
   *
   * Built so the panel can be drawn for it at all. Everything a decision needs
   * — who was involved, when, and on which lap — is in the log; only the
   * telemetry is missing, and the dossier is told to say so rather than draw a
   * grid of dashes.
   */
  const uncapturedIncident = useMemo<LiveIncident | undefined>(() => {
    if (!event) {
      return undefined;
    }

    return {
      id: event.id,
      etSeconds: event.etSeconds ?? 0,
      timestampLabel: event.timestampLabel,
      lapLabel: event.lapLabel,
      classification: REPLAY_TYPE_CLASSIFICATION[event.type],
      drivers: event.drivers.map((driver) => ({
        /*
          The log's driver id where it has one, the name where it does not. It
          is what a decision is keyed on, so it has to exist — and a name is
          what the rest of this view already identifies a driver by.
        */
        steamId: driver.driverSid || driver.displayName,
        slotId:
          driver.slotId !== undefined && driver.slotId !== ''
            ? Number(driver.slotId)
            : undefined,
        displayName: driver.displayName,
        carNumber: driver.carNumber,
        carClass: driver.carClass,
        isAiDriver: driver.isAiDriver,
      })),
      rawText: event.sourceText ?? event.description ?? '',
      evidence: { cars: [] },
      state: 'NEW' as const,
    };
  }, [event]);

  const record = useMemo(
    () =>
      liveIncidentId
        ? liveData?.incidents.find((entry) => entry.id === liveIncidentId)
        : undefined,
    [liveData, liveIncidentId],
  );

  const incident = useMemo<LiveIncident | undefined>(() => {
    if (!record || !event) {
      return undefined;
    }

    const [built] = buildIncidents(
      [{ ...record.incident, context }],
      liveData?.drivers ?? [],
    );

    if (!built) {
      return undefined;
    }

    /*
      The replay's clock wins for anything displayed. A replay of a session
      joined late has its own zero point, and the event already carries the
      normalised label the timeline is showing — reading the raw elapsed time
      off the capture instead would put a different time on the dossier than on
      the incident it belongs to.
    */
    return {
      ...built,
      id: record.id,
      timestampLabel: event.timestampLabel,
      lapLabel: event.lapLabel,
      /*
        The window is fetched here and handed down inline, so the dossier must
        not go and fetch it a second time on its own account. False until it
        has landed; true once it is already in `traces`.
      */
      hasTrace: Boolean(context),
    };
  }, [context, event, liveData?.drivers, record]);

  /*
    Capture's incident where there is one, the log's own where there is not.
    Everything below this line works the same way for both — the only
    difference is that one of them has evidence to draw.
  */
  const baseIncident = incident ?? uncapturedIncident;
  const hasCapture = Boolean(incident);

  const decisionsForIncident = useMemo(() => {
    const incidentId = liveIncidentId ?? uncapturedIncident?.id;
    if (!incidentId) {
      return [];
    }

    // Defended rather than assumed: the collection arrives from a message
    // reply, so it is absent until the first one lands.
    return Object.values(stewardDecisions ?? {}).filter(
      (decision) =>
        decision.incidentId === incidentId &&
        /*
          Scoped to the session as well as the incident. An uncaptured
          incident's id is a position in one replay file, so two replays can
          hold the same one — without this, a call made on one race would show
          up on an unrelated incident in another.
        */
        decision.sessionKey === sessionKey &&
        // A call that has been taken back says nothing about the incident.
        isStandingCall(decision),
    );
  }, [liveIncidentId, sessionKey, stewardDecisions, uncapturedIncident?.id]);

  const decidedIncident = useMemo<LiveIncident | undefined>(() => {
    if (!baseIncident) {
      return undefined;
    }

    const decided = decisionsForIncident.find(
      (entry) => entry.state === 'DECIDED',
    );

    if (decided) {
      return {
        ...baseIncident,
        state: 'DECIDED' as const,
        decision: decided.outcome,
        decisionReasoning: decided.reasoning,
        atFaultSteamId: decided.target?.steamId,
      };
    }

    /*
      Same ranking as the live provider. A call the steward deliberately parked
      for this review must not read back as "flagged, never got to it" — this
      view is the thing it was deferred *to*. Showing the state accurately is
      all that happens here; nothing routes deferred incidents into the replay
      view, which is a feature of its own.
    */
    if (decisionsForIncident.some((entry) => entry.state === 'DEFERRED')) {
      return { ...baseIncident, state: 'DEFERRED' as const };
    }

    return decisionsForIncident.length
      ? { ...baseIncident, state: 'FLAGGED' as const }
      : baseIncident;
  }, [baseIncident, decisionsForIncident]);

  /*
    The same per-driver history the live dossier shows, built from the same
    store over the session this replay is linked to.

    Wired here deliberately rather than left live-only. The dossier is one
    component, so a section that appears during the session and vanishes in the
    review reads as a bug — and post-session is when a pattern across a driver's
    session is most worth seeing, since it is all there to be read at once.

    Indexed on the target where there is one, on every involved party where
    there is not: exactly the rule the provider applies, because a penalty
    against one driver of a contact is a call about that driver only.
  */
  const priorCallsByDriver = useMemo(() => {
    const byDriver = new Map<string, LivePriorCall[]>();
    /*
      The capture's key, not the resolved one. History is a property of the
      session that was raced; a replay with no capture behind it has none to
      show, and the `replay|hash` key stands in only for filing new calls.
    */
    const capturedKey = liveData?.sessionKey;
    if (!capturedKey) {
      return byDriver;
    }

    Object.values(stewardDecisions ?? {}).forEach((decision) => {
      // A withdrawn call is not precedent — same rule as the live provider.
      if (decision.sessionKey !== capturedKey || !isStandingCall(decision)) {
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

    byDriver.forEach((calls) =>
      calls.sort((a, b) => b.decidedAt - a.decidedAt),
    );

    return byDriver;
  }, [liveData?.sessionKey, stewardDecisions]);

  /*
    The note the next call will carry, seeded from the one already on the
    record.

    Seeding is the whole reason this field could not simply be switched on. A
    blank box wired into `buildDecision` would silently wipe the reasoning a
    live call already carries the first time a steward touched any button on
    this panel — which is why the field was left off rather than added empty.
    Starting it at the recorded value makes the box a revision of that sentence
    instead of a replacement for it, which is what post-session review is.

    Keyed on the incident so moving to the next one does not carry the last
    one's note across, and re-seeded when a decision lands from elsewhere.
  */
  const recordedReasoning = decisionsForIncident.find(
    (entry) => entry.reasoning,
  )?.reasoning;
  const [reasoning, setReasoning] = useState(recordedReasoning ?? '');
  const reasoningKey = `${sessionKey}|${decidedIncident?.id ?? ''}`;
  const [seededFor, setSeededFor] = useState(reasoningKey);

  useEffect(() => {
    if (seededFor !== reasoningKey) {
      setSeededFor(reasoningKey);
      setReasoning(recordedReasoning ?? '');
    }
  }, [reasoningKey, recordedReasoning, seededFor]);

  /*
    A solo incident has one party, so targeting it needs no extra click. A
    contact has no default, because picking either driver would be the app
    quietly deciding fault.
  */
  const effectiveTargetSteamId =
    targetSteamId ??
    (decidedIncident?.drivers.length === 1
      ? decidedIncident.drivers[0].steamId
      : undefined);

  const buildDecision = useCallback(
    (
      source: LiveIncident,
      state: StewardDecisionState,
      outcome?: LiveDecisionOutcome,
      target?: LiveDriverRef,
    ): StewardDecision => ({
      id: buildStewardDecisionId(sessionKey, source.id, target?.steamId),
      basis: 'incident',
      incidentId: source.id,
      /*
        The hash a live call could not have. A decision made during the session
        has no replay to point at yet; reviewing it here is exactly the moment
        that becomes knowable.
      */
      replayHash,
      sessionKey,
      sessionTrack: liveData?.trackName ?? '',
      sessionType: liveData?.sessionType ?? '',
      sessionDate: liveData?.startedAt,
      target: target
        ? {
            steamId: target.steamId,
            slotId: target.slotId,
            driverName: target.displayName,
          }
        : undefined,
      involvedParties: source.drivers.map((driver) => ({
        steamId: driver.steamId,
        slotId: driver.slotId,
        driverName: driver.displayName,
      })),
      lapLabel: source.lapLabel,
      etSeconds: source.etSeconds,
      trackPositionLabel: source.evidence.trackPositionLabel,
      classification: source.classification,
      outcome,
      /*
        What is in the box, which starts as what was already on the record. An
        empty box records nothing rather than an empty string, so an export can
        still tell "no reasoning given" from "reasoning given as blank".
      */
      reasoning: reasoning.trim() || undefined,
      /*
        The same resolved name the live shell writes with, off `useApi()`.
        Reviewing a call here rewrites its author to whoever is reviewing, which
        is correct — the revision this produces is their act, not the original
        steward's. Decisions nobody reopens keep the author they were made with.
      */
      stewardAuthor,
      decidedAt: Date.now(),
      state,
      /*
        Final, where a live call is provisional. This is the review the live
        status was waiting for: the footage is on screen and the evidence is
        beside it, so the call is no longer a snap judgement.
      */
      status: 'final',
      revisions: [],
    }),
    [liveData, reasoning, replayHash, sessionKey, stewardAuthor],
  );

  /*
    Withdraws every other record standing against this incident.

    The replay side writes at most one record per target, but a call made live
    and a flag made live are two records under two ids, and both can reach this
    view. Clearing only the one under the cursor would leave the incident still
    reading as called.
  */
  const withdrawOtherCalls = useCallback(
    (keepId: string) => {
      decisionsForIncident.forEach((existing) => {
        if (existing.id === keepId) {
          return;
        }

        saveStewardDecision({
          ...existing,
          state: 'WITHDRAWN',
          outcome: undefined,
          decidedAt: Date.now(),
        });
      });
    },
    [decisionsForIncident, saveStewardDecision],
  );

  const onFlag = useCallback(() => {
    if (!decidedIncident) {
      return;
    }

    // Pressing flag on an incident already flagged takes it back, the same as
    // every other control on this panel.
    const state = toggledState('FLAGGED', decidedIncident.state === 'FLAGGED');
    const flagged = buildDecision(decidedIncident, state);

    if (state === 'WITHDRAWN') {
      withdrawOtherCalls(flagged.id);
    }
    saveStewardDecision(flagged);
  }, [buildDecision, decidedIncident, saveStewardDecision, withdrawOtherCalls]);

  const onDecide = useCallback(
    (_incidentId: string, outcome: LiveDecisionOutcome) => {
      if (!decidedIncident) {
        return;
      }

      /*
        Same rule as the live path, from the same list: the action decides
        whether the record names a driver. A finding about the incident as a
        whole carries no target even with one selected, which is what keeps
        `target` the durable answer to "was this against someone" — and stops a
        "No Action" from marking that driver at fault.
      */
      const needsTarget = isDriverScopedOutcome(stewardActions, outcome);
      const target = needsTarget
        ? decidedIncident.drivers.find(
            (driver) => driver.steamId === effectiveTargetSteamId,
          )
        : undefined;

      // A penalty without a target is not a call.
      if (needsTarget && !target) {
        return;
      }

      /*
        Pressing the call already recorded takes it back. Keyed on the outcome
        as well as the state, so pressing a *different* action revises the call
        rather than clearing it — which is what post-session review is mostly
        for.
      */
      const isSameCall =
        decidedIncident.state === 'DECIDED' &&
        decidedIncident.decision === outcome;
      const state = toggledState('DECIDED', isSameCall);

      const decision = buildDecision(
        decidedIncident,
        state,
        isSameCall ? undefined : outcome,
        target,
      );

      if (isSameCall) {
        withdrawOtherCalls(decision.id);
      }
      saveStewardDecision(decision);
    },
    [
      buildDecision,
      decidedIncident,
      effectiveTargetSteamId,
      saveStewardDecision,
      stewardActions,
      withdrawOtherCalls,
    ],
  );

  const onFocusCar = useCallback((slotId: number | undefined) => {
    if (slotId === undefined) {
      return;
    }

    sendMessage(CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR, String(slotId));
  }, []);

  /*
    Only a dossier with no incident behind it at all is withheld.

    It used to also stand down whenever live capture had nothing for the
    incident, which is the ordinary case — most incidents never get a trace and
    most replays have no captured session at all — so the great majority of the
    library could be watched and not called on. The panel is worth keeping for
    them: the footage is on screen, which is the evidence, and everything a
    decision needs is in the result log.
  */
  if (!decidedIncident || !sessionKey) {
    return null;
  }

  /*
    Deliberately no loading state. The evidence rides the incident row and is
    already here, so the dossier renders at once and the trace chart appears
    underneath when its ~100 KB arrives. A spinner over the whole panel would
    hide the closing speeds and measurements a steward can already act on.
  */
  return (
    <Box>
      <LiveIncidentDossier
        incident={decidedIncident}
        onFocusCar={onFocusCar}
        onFlag={onFlag}
        onDecide={onDecide}
        targetSteamId={effectiveTargetSteamId}
        priorCallsByDriver={priorCallsByDriver}
        onSelectTarget={setTargetSteamId}
        reasoning={reasoning}
        onChangeReasoning={setReasoning}
        evidenceUnavailable={hasCapture ? undefined : NO_CAPTURE_EXPLANATION}
      />
    </Box>
  );
};
