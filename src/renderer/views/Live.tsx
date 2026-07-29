import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { ViewHeader } from '../components/Common/ViewHeader';
import { useApi } from '../providers/ApiContext';
import { deriveLiveIndicator } from '../hooks/useLiveIndicator';
import { LiveTriageQueue } from '../components/Live/LiveTriageQueue';
import { LiveIncidentDossier } from '../components/Live/LiveIncidentDossier';
import { LiveFieldState } from '../components/Live/LiveFieldState';
import {
  LiveDecisionOutcome,
  LiveIncident,
  LiveIncidentState,
  LiveSessionPhase,
  liveIncidentsFixture,
  livePressureFixture,
  liveSessionFixture,
  liveStandingsFixture,
} from '../components/Live/liveFixtures';

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
  const { isConnected, hasApiStatusResponse, liveSessionStatus } = useApi();
  const liveIndicator = deriveLiveIndicator({
    isConnected,
    hasApiStatusResponse,
    liveSessionStatus,
  });
  const [incidents, setIncidents] = useState<LiveIncident[]>(liveIncidentsFixture);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | undefined>(
    liveIncidentsFixture[0]?.id,
  );
  const [stateFilter, setStateFilter] = useState<LiveIncidentState | 'ALL'>('ALL');

  const session = liveSessionFixture;
  const phase = session.phase;

  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);
  const unreviewedCount = incidents.filter((i) => i.state === 'NEW').length;
  const flaggedCount = incidents.filter((i) => i.state === 'FLAGGED').length;

  const onFlag = useCallback((incidentId: string) => {
    setIncidents((prev) =>
      prev.map((incident) =>
        incident.id === incidentId
          ? {
              ...incident,
              state: incident.state === 'FLAGGED' ? 'NEW' : 'FLAGGED',
              decision: undefined,
              decisionReasoning: undefined,
            }
          : incident,
      ),
    );
  }, []);

  const onDecide = useCallback(
    (incidentId: string, outcome: LiveDecisionOutcome) => {
      setIncidents((prev) =>
        prev.map((incident) =>
          incident.id === incidentId
            ? { ...incident, state: 'DECIDED', decision: outcome }
            : incident,
        ),
      );
    },
    [],
  );

  const onFocusCar = useCallback((steamId: string) => {
    // Placeholder: real implementation calls PUT_REPLAY_COMMAND_FOCUS_CAR.
    // eslint-disable-next-line no-console
    console.info('focus car', steamId);
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
      const outcome = shortcutToOutcome[event.key];
      if (outcome) {
        onDecide(selectedIncidentId, outcome);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDecide, onFlag, selectedIncidentId]);

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
              Dashboard
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
            <Tooltip title="This view renders fixture data. No live capture is wired up yet.">
              <Chip
                size="small"
                icon={<ScienceOutlinedIcon />}
                label="Fixture data"
                variant="outlined"
                sx={{ height: 22, fontSize: 10 }}
              />
            </Tooltip>
          </Stack>
        }
        subtitle={
          <Typography variant="caption" color="text.secondary">
            {unreviewedCount} unreviewed · {flaggedCount} flagged for review
          </Typography>
        }
        onBack={() => navigate('/')}
      />

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
          onFocusCar={onFocusCar}
          onFlag={onFlag}
          onDecide={onDecide}
        />
        <LiveFieldState
          session={session}
          standings={liveStandingsFixture}
          battles={livePressureFixture}
          captureLabel={liveIndicator.label}
          isCaptureLive={liveIndicator.state === 'live'}
          onFocusCar={onFocusCar}
        />
      </Box>
    </Box>
  );
};
