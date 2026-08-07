import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { CONSTANTS } from '@constants';
import { StewardDecision, StewardDecisionState } from '@types';
import { ViewHeader } from '../components/Common/ViewHeader';
import { sendMessage } from '../utils/postMessage';
import { buildStewardDecisionId } from '../utils/stewardDecisionId';
import { useApi } from '../providers/ApiContext';
import { deriveLiveIndicator } from '../hooks/useLiveIndicator';
import {
  buildSessionState,
  useLiveSessionData,
} from '../hooks/useLiveSessionData';
import { LiveTriageQueue } from '../components/Live/LiveTriageQueue';
import { LiveIncidentDossier } from '../components/Live/LiveIncidentDossier';
import { LiveFieldState } from '../components/Live/LiveFieldState';
import {
  LiveDecisionOutcome,
  LiveDriverRef,
  LiveIncident,
  LiveIncidentState,
  isDriverScopedOutcome,
  LiveSessionPhase,
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

const phaseLabel: Record<LiveSessionPhase, string> = {
  green: 'Green Flag',
  red: 'Red Flag',
  finished: 'Session Over',
};

const phaseColor: Record<LiveSessionPhase, string> = {
  green: 'success.main',
  red: 'error.main',
  finished: 'text.secondary',
};

const shortcutToOutcome: Record<string, LiveDecisionOutcome> = {
  '1': 'penalty-5s',
  '2': 'penalty-10s',
  '3': 'drive-through',
  '4': 'no-action',
  '5': 'note',
};

export const LiveView: React.FC = () => {
  const navigate = useNavigate();
  const {
    isConnected,
    hasApiStatusResponse,
    liveSessionStatus,
    stewardDecisions,
    saveStewardDecision,
  } = useApi();
  const liveIndicator = deriveLiveIndicator({
    isConnected,
    hasApiStatusResponse,
    liveSessionStatus,
  });
  const {
    data: liveData,
    standings: liveStandings,
    incidents: liveIncidents,
    sessionKey: liveSessionKey,
  } = useLiveSessionData();

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

  const sourceIncidents = useFixtures ? liveIncidentsFixture : liveIncidents;
  const sourceStandings = useFixtures ? liveStandingsFixture : liveStandings;

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

        return { ...incident, state: 'FLAGGED' as const };
      }),
    [decisionsByIncident, sourceIncidents],
  );
  const { phase } = session;

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
  const unreviewedCount = incidents.filter((i) => i.state === 'NEW').length;
  const flaggedCount = incidents.filter((i) => i.state === 'FLAGGED').length;

  /**
   * Builds the durable record. Session, driver, time and classification are
   * denormalised onto it deliberately: live incident ids do not survive a
   * sidecar restart, so the decision has to stand on its own.
   */
  const buildDecision = useCallback(
    (
      incident: LiveIncident,
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
      // Provisional until the session syncs and the call can be reviewed
      // against the full replay.
      status: 'provisional',
      revisions: [],
    }),
    [session, sessionKey],
  );

  const onFlag = useCallback(
    (incidentId: string) => {
      const incident = incidents.find((entry) => entry.id === incidentId);
      if (!incident) {
        return;
      }

      saveStewardDecision(buildDecision(incident, 'FLAGGED'));
    },
    [buildDecision, incidents, saveStewardDecision],
  );

  const onDecide = useCallback(
    (incidentId: string, outcome: LiveDecisionOutcome) => {
      const incident = incidents.find((entry) => entry.id === incidentId);
      if (!incident) {
        return;
      }

      const target = incident.drivers.find(
        (driver) => driver.steamId === effectiveTargetSteamId,
      );

      // A penalty without a target is not a call. The dossier disables these
      // buttons, and this refuses the keyboard path for the same reason.
      if (isDriverScopedOutcome(outcome) && !target) {
        return;
      }

      saveStewardDecision(buildDecision(incident, 'DECIDED', outcome, target));
    },
    [buildDecision, effectiveTargetSteamId, incidents, saveStewardDecision],
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedIncidentId) {
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        onFlag(selectedIncidentId);
        return;
      }

      // Picking the target is one keypress, so a contact stays a two-key call.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const parties =
          incidents.find((entry) => entry.id === selectedIncidentId)?.drivers ??
          [];
        if (parties.length === 0) {
          return;
        }
        const current = parties.findIndex(
          (driver) => driver.steamId === effectiveTargetSteamId,
        );
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next =
          current === -1
            ? 0
            : (current + step + parties.length) % parties.length;
        setTargetSteamId(parties[next].steamId);
        return;
      }
      const outcome = shortcutToOutcome[event.key];
      if (outcome) {
        onDecide(selectedIncidentId, outcome);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [effectiveTargetSteamId, incidents, onDecide, onFlag, selectedIncidentId]);

  return (
    <Box>
      <ViewHeader
        breadcrumb={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              Driver
            </Typography>
            <Typography variant="caption" color="text.secondary">
              /
            </Typography>
            <Typography variant="caption" color="primary.main" fontWeight={700}>
              Live Session
            </Typography>
          </Stack>
        }
        title={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5">{session.trackName}</Typography>
            <Box
              sx={{
                backgroundColor: phaseColor[phase],
                color: '#0B1218',
                borderRadius: '4px',
                padding: '4px',
                fontSize: '0.75rem',
                lineHeight: '0.75rem',
                fontWeight: 'bold',
              }}
            >
              {phaseLabel[phase]}
            </Box>
            {useFixtures ? (
              <Tooltip title="Dev mode: this view is rendering fixture data, not a live session.">
                <Chip
                  size="small"
                  icon={<ScienceOutlinedIcon />}
                  label="Fixture data"
                  variant="outlined"
                  sx={{ height: 22, fontSize: 10 }}
                />
              </Tooltip>
            ) : null}
          </Stack>
        }
        subtitle={
          <Typography variant="caption" color="text.secondary">
            {unreviewedCount} unreviewed · {flaggedCount} flagged for review
          </Typography>
        }
        onBack={() => navigate('/')}
      />

      {!useFixtures && liveIndicator.state !== 'live' ? (
        <Paper
          variant="outlined"
          sx={{ borderColor: 'divider', borderRadius: 2, p: 2, mb: 2 }}
        >
          <Typography variant="subtitle1" fontWeight={700}>
            No live session
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {liveIndicator.detail ?? liveIndicator.label} Live capture attaches
            automatically once Le Mans Ultimate loads a session with plugins
            enabled.
          </Typography>
        </Paper>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: '340px minmax(0, 1fr) 320px' },
          gridAutoRows: { xs: 'minmax(320px, auto)', lg: 'minmax(0, 1fr)' },
          boxSizing: 'border-box',
          height: { xs: 'auto', lg: 'calc(100vh - 300px)' },
          minHeight: { lg: 520 },
          mb: 3,
        }}
      >
        <LiveTriageQueue
          incidents={incidents}
          selectedIncidentId={selectedIncidentId}
          stateFilter={stateFilter}
          onSelectIncident={setSelectedIncidentId}
          onChangeStateFilter={setStateFilter}
        />
        <LiveIncidentDossier
          incident={selectedIncident}
          targetSteamId={effectiveTargetSteamId}
          onSelectTarget={setTargetSteamId}
          onFocusCar={onFocusCar}
          onFlag={onFlag}
          onDecide={onDecide}
        />
        <LiveFieldState
          session={session}
          standings={sourceStandings}
          battles={useFixtures ? livePressureFixture : (liveData.battles ?? [])}
          captureLabel={liveIndicator.label}
          isCaptureLive={liveIndicator.state === 'live'}
          onFocusCar={onFocusCar}
        />
      </Box>
    </Box>
  );
};
