import { Box, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { ViewHeader } from '../components/Common/ViewHeader';
import { ReplayIncidentEvent } from '../components/Replay/ReplayMasterIncidentTimeline';
import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import { LapByLapPerformanceBreakdown } from '../components/DriverAnalysis/LapByLapPerformanceBreakdown';
import { useApi } from '../providers/ApiContext';
import { DriverOverviewCard } from '../components/DriverAnalysis/DriverOverviewCard';
import { DriverIncidentHistoryTimeline } from '../components/DriverAnalysis/DriverIncidentHistoryTimeline';
import { DriverPerformanceMetricsCard } from '../components/DriverAnalysis/DriverPerformanceMetricsCard';
import { DriverFaultAnalysisCard } from '../components/DriverAnalysis/DriverFaultAnalysisCard';
import { ReplayJumpBar } from '../components/Replay/ReplayJumpBar';
import { useDriverAnalysisData } from '../hooks/useDriverAnalysisData';
import { AiBadge } from '../components/Common/AiBadge';
import { useDriverAnalysisViewState } from '../hooks/useDriverAnalysisViewState';
import { sendMessage } from '../utils/postMessage';
import { CONSTANTS } from '@constants';

interface DriverAnalysisRouteState {
  replayTitle?: string;
  replayLocation?: string;
  isPartialReplayData?: boolean;
  driver?: ReplayDriverStanding;
  incidents?: ReplayIncidentEvent[];
}

const PARTIAL_REPLAY_DATA_NOTICE =
  'Partial replay data detected. This replay appears to have started after the live session was already in progress, so incident timing may be approximate.';

export const DriverAnalysisView: React.FC = () => {
  const { currentReplay, isReplayActive, quickViewEnabled } = useApi();
  const navigate = useNavigate();
  const { replayHash, driverId } = useParams<{
    replayHash: string;
    driverId: string;
  }>();
  const { state } = useLocation();
  const routeState = (state as DriverAnalysisRouteState | null) ?? null;

  const {
    driver,
    replayLabel,
    isPartialReplayDataDetected,
    selectedIncidentTypes,
    activeIncidentId,
    setActiveIncidentId,
    toggleIncidentType,
    onViewIncident,
    onJumpToIncident,
    onSelectIncident,
  } = useDriverAnalysisViewState({
    driverId,
    routeState,
    isQuickViewModeActive: quickViewEnabled && isReplayActive !== true,
  });

  const {
    incidents,
    filteredIncidents,
    activeIncident,
    selectedDriverIsAi,
    faultIncidentSummary,
    faultRiskIndex,
    faultDominantType,
    faultTotalIncidents,
    faultDominantPercent,
    faultCollisionStats,
    topCounterpartyText,
    topPenaltyReasonText,
    lapBreakdownRows,
  } = useDriverAnalysisData({
    currentReplay,
    driver,
    routeIncidents: routeState?.incidents,
    isPartialReplayDataDetected,
    selectedIncidentTypes,
    activeIncidentId,
  });

  const isAiDriver = Boolean(driver.isAiDriver || selectedDriverIsAi);
  const isQuickViewModeActive = quickViewEnabled && isReplayActive !== true;

  const onBackToDashboard = () => {
    sendMessage(CONSTANTS.API.POST_CLOSE_REPLAY);
    navigate(`/`);
  };

  useEffect(() => {
    if (
      activeIncidentId &&
      !incidents.some((incident) => incident.id === activeIncidentId)
    ) {
      setActiveIncidentId(null);
    }
  }, [activeIncidentId, incidents]);

  return (
    <Box sx={{ paddingBottom: { xs: '260px', md: '180px' } }}>
      <ViewHeader
        breadcrumb={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: 'pointer' }}
              onClick={onBackToDashboard}
            >
              Dashboard
            </Typography>
            <Typography variant="caption" color="text.secondary">
              /
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate(`/replay/${replayHash}`)}
            >
              Session Analysis
            </Typography>
            <Typography variant="caption" color="text.secondary">
              /
            </Typography>
            <Typography variant="caption" color="primary.main" fontWeight={700}>
              Driver Analysis
            </Typography>
          </Stack>
        }
        title={
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap>
            <Typography variant="h5">
              {driver.driverName} • Driver Analysis
            </Typography>
            {isAiDriver ? <AiBadge /> : null}
          </Stack>
        }
        subtitle={
          <Stack spacing={0.5}>
            <Typography color="text.secondary" variant="body2">
              {replayLabel}
            </Typography>
            {isPartialReplayDataDetected ? (
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Typography
                  variant="caption"
                  color="warning.main"
                  fontWeight={700}
                >
                  Partial replay data detected
                </Typography>
                <Tooltip
                  title={PARTIAL_REPLAY_DATA_NOTICE}
                  arrow
                  placement="right"
                >
                  <InfoOutlinedIcon
                    sx={{ color: 'warning.main', fontSize: '0.9rem' }}
                  />
                </Tooltip>
              </Stack>
            ) : null}
          </Stack>
        }
        onBack={() => navigate(`/replay/${replayHash}`)}
      />

      {isQuickViewModeActive ? (
        <Box sx={{ mt: -1, mb: 2, px: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Quick View is enabled. Replay playback actions are unavailable until
            replay loading is started from Session Analysis.
          </Typography>
        </Box>
      ) : null}

      <DriverOverviewCard driver={{ ...driver, isAiDriver }} />

      <Box
        sx={{
          mt: 2,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: '1.8fr 1fr',
        }}
      >
        <Box>
          <DriverIncidentHistoryTimeline
            filteredIncidents={filteredIncidents}
            selectedIncidentTypes={selectedIncidentTypes}
            onToggleIncidentType={toggleIncidentType}
            onSelectIncident={onSelectIncident}
            onViewIncident={onViewIncident}
            activeIncidentId={activeIncidentId}
          />
        </Box>

        <Box>
          <Stack spacing={2}>
            <DriverPerformanceMetricsCard
              fastestLap={driver.fastestLap}
              incidents={driver.incidents}
              riskIndex={driver.riskIndex}
            />

            <DriverFaultAnalysisCard
              activeIncident={activeIncident}
              onReset={() => setActiveIncidentId(null)}
              faultIncidentSummary={faultIncidentSummary}
              faultRiskIndex={faultRiskIndex}
              faultDominantType={faultDominantType}
              faultTotalIncidents={faultTotalIncidents}
              faultDominantPercent={faultDominantPercent}
              subjectPct={faultCollisionStats.subjectPct}
              secondaryPct={faultCollisionStats.secondaryPct}
              topCounterpartyText={topCounterpartyText}
              topPenaltyReasonText={topPenaltyReasonText}
            />
          </Stack>
        </Box>
      </Box>

      <Box sx={{ mt: 2 }}>
        <LapByLapPerformanceBreakdown rows={lapBreakdownRows} />
      </Box>

      {!isQuickViewModeActive ? (
        <Box sx={{ mt: 2 }}>
          <ReplayJumpBar
            incidents={filteredIncidents}
            selectedIncidentId={activeIncidentId ?? undefined}
            onJumpToIncident={onJumpToIncident}
          />
        </Box>
      ) : (
        <Paper
          variant="outlined"
          sx={{ mt: 2, borderColor: 'divider', borderRadius: 2, p: 2 }}
        >
          <Typography variant="body2" color="text.secondary">
            Replay jump controls are unavailable in Quick View mode. Load the
            replay from Session Analysis to enable playback-linked driver
            analysis controls.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};
