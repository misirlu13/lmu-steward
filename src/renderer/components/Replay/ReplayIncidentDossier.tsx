import { useCallback, useMemo, useState } from 'react';
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
  isDriverScopedOutcome,
} from '../Live/liveFixtures';
import { buildIncidents } from '../../hooks/useLiveSessionData';
import { useLiveIncidentContext } from '../../hooks/useLiveIncidentContext';
import { sendMessage } from '../../utils/postMessage';
import { buildStewardDecisionId } from '../../utils/stewardDecisionId';
import { useApi } from '../../providers/ApiContext';
import { ReplayIncidentEvent } from './replayTimelineTypes';

/** Matches live stewarding until the app knows who is signed in. */
const STEWARD_AUTHOR = 'Steward';

interface Props {
  event: ReplayIncidentEvent | undefined;
  liveData: LiveDataForReplay | null;
  replayHash: string | undefined;
}

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
  const { stewardDecisions, saveStewardDecision } = useApi();
  const [targetSteamId, setTargetSteamId] = useState<string | undefined>();

  const liveIncidentId = event?.liveIncidentId;
  const { context } = useLiveIncidentContext(liveIncidentId);

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

  const decisionsForIncident = useMemo(
    () =>
      // Defended rather than assumed: the collection arrives from a message
      // reply, so it is absent until the first one lands.
      Object.values(stewardDecisions ?? {}).filter(
        (decision) => decision.incidentId === liveIncidentId,
      ),
    [liveIncidentId, stewardDecisions],
  );

  const decidedIncident = useMemo<LiveIncident | undefined>(() => {
    if (!incident) {
      return undefined;
    }

    const decided = decisionsForIncident.find(
      (entry) => entry.state === 'DECIDED',
    );

    if (decided) {
      return {
        ...incident,
        state: 'DECIDED' as const,
        decision: decided.outcome as LiveDecisionOutcome | undefined,
        decisionReasoning: decided.reasoning,
        atFaultSteamId: decided.target?.steamId,
      };
    }

    return decisionsForIncident.length
      ? { ...incident, state: 'FLAGGED' as const }
      : incident;
  }, [decisionsForIncident, incident]);

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
      id: buildStewardDecisionId(
        liveData?.sessionKey ?? '',
        source.id,
        target?.steamId,
      ),
      basis: 'incident',
      incidentId: source.id,
      /*
        The hash a live call could not have. A decision made during the session
        has no replay to point at yet; reviewing it here is exactly the moment
        that becomes knowable.
      */
      replayHash,
      sessionKey: liveData?.sessionKey ?? '',
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
      reasoning: source.decisionReasoning,
      stewardAuthor: STEWARD_AUTHOR,
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
    [liveData, replayHash],
  );

  const onFlag = useCallback(() => {
    if (decidedIncident) {
      saveStewardDecision(buildDecision(decidedIncident, 'FLAGGED'));
    }
  }, [buildDecision, decidedIncident, saveStewardDecision]);

  const onDecide = useCallback(
    (_incidentId: string, outcome: LiveDecisionOutcome) => {
      if (!decidedIncident) {
        return;
      }

      const target = decidedIncident.drivers.find(
        (driver) => driver.steamId === effectiveTargetSteamId,
      );

      // A penalty without a target is not a call.
      if (isDriverScopedOutcome(outcome) && !target) {
        return;
      }

      saveStewardDecision(
        buildDecision(decidedIncident, 'DECIDED', outcome, target),
      );
    },
    [
      buildDecision,
      decidedIncident,
      effectiveTargetSteamId,
      saveStewardDecision,
    ],
  );

  const onFocusCar = useCallback((slotId: number | undefined) => {
    if (slotId === undefined) {
      return;
    }

    sendMessage(CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR, String(slotId));
  }, []);

  // Nothing captured this incident, which is the ordinary case — most incidents
  // never get a trace, and most replays have no captured session at all.
  if (!liveIncidentId || !liveData) {
    return null;
  }

  if (!decidedIncident) {
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
        onSelectTarget={setTargetSteamId}
      />
    </Box>
  );
};
