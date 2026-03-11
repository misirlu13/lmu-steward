import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CONSTANTS } from '@constants';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Drawer from '@mui/material/Drawer';
import { Box, Button, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';
import { ReplayJumpBar } from '../components/Replay/ReplayJumpBar';
import { ViewHeader } from '../components/Common/ViewHeader';
import { ReplaySubtitle } from '../components/Common/ReplaySubtitle';
import { ReplayActions } from '../components/Replay/ReplayActions';
import { ReplayLoadingScreen } from '../components/Replay/ReplayLoadingScreen';
import { ReplayChat } from '../components/Replay/ReplayChat';
import { ReplaySummary } from '../components/Replay/ReplaySummary';
import {
  ReplayIncidentEvent,
  ReplayMasterIncidentTimeline,
} from '../components/Replay/ReplayMasterIncidentTimeline';
import {
  ReplayDriverStanding,
  ReplayDriverStandings,
} from '../components/Replay/ReplayDriverStandings';
import { ReplayIncidentHeatmap } from '../components/Replay/ReplayIncidentHeatmap';
import { getSessionIncidents } from '../utils/sessionUtils';
import { SESSION_COLOR_MAPPING } from '../utils/sessionColorMapping';
import { jumpToIncidentInReplay } from '../utils/replayCommands';
import {
  buildReplayDriverCoverageNote,
  buildReplayDurationLabel,
  buildReplayLapsCompletion,
  buildReplaySessionTypeColor,
  buildReplaySessionTypeLabel,
  buildReplayWeather,
  computeReplayIncidentScorePerDriver,
} from '../utils/replaySummaryViewModel';
import { resolveReplayHeaderMetadata } from '../utils/replayMetadata';
import { useReplayDerivedData } from '../hooks/useReplayDerivedData';
import { useReplayViewOrchestration } from '../hooks/useReplayViewOrchestration';

const PARTIAL_REPLAY_DATA_NOTICE =
  'Partial replay data detected. This replay appears to have started after the live session was already in progress, so incident timing may be approximate.';

export const ReplayView: React.FC = () => {
  const { replayHash } = useParams<{ replayHash: string }>();
  const {
    currentReplay,
    currentTrackMap,
    loadingState,
    isReplayActive,
    quickViewEnabled,
    replays,
    subscribeToApiChannel,
  } = useApi();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const navigate = useNavigate();
  const {
    replayForView,
    cachedReplayData,
    sessionInfoData,
    standingsData,
    standingsHistoryData,
    hasRequestedReplayData,
    isQuickViewModeActiveForReplay,
    isReplayLoadingUiVisible,
    displayedLoadingScreenProgress,
    selectedIncidentId,
    setSelectedIncidentId,
    onViewReplayFromQuickView: requestViewReplayFromQuickView,
  } = useReplayViewOrchestration({
    replayHash,
    replays,
    currentReplay,
    currentTrackMap,
    loadingState,
    isReplayActive,
    quickViewEnabled,
    subscribeToApiChannel,
    navigateToDashboard: () => navigate('/'),
  });

  const toggleChatDrawer = (newOpen: boolean) => () => {
    setIsChatOpen(newOpen);
  };

  const sessionTypeLabelMap: Record<string, string> = {
    RACE: 'Race',
    QUALIFY: 'Qualifying',
    PRACTICE: 'Practice',
  };

  const { title, location } = useMemo(
    () =>
      resolveReplayHeaderMetadata({
        replay: replayForView,
        trackMetaData: CONSTANTS.TRACK_META_DATA,
      }),
    [replayForView],
  );

  const onBackToDashboard = () => {
    sendMessage(CONSTANTS.API.POST_CLOSE_REPLAY);
    navigate(`/`);
  };

  const onViewReplayFromQuickView = () => {
    requestViewReplayFromQuickView();
  };

  const onToggleViewChat = () => {
    setIsChatOpen((prev) => !prev);
  };

  const {
    currentSessionLogData,
    standingsEntries,
    isPartialReplayDataDetected,
    summaryClassCounts,
    timelineEvents,
    standings,
    heatmapTrackPoints,
    heatmapSpots,
    heatmapWorldSpots,
    availableClasses,
    lapsCompleted,
  } = useReplayDerivedData({
    replayForView,
    standingsData,
    standingsHistoryData,
    currentTrackMap: currentTrackMap ?? null,
    cachedTrackMapData: cachedReplayData?.trackMapData ?? null,
  });

  const replaySessionInfo = sessionInfoData as {
    maximumLaps?: number | string;
    endEventTime?: number | string;
  } | null;

  useEffect(() => {
    if (!timelineEvents.length) {
      setSelectedIncidentId(undefined);
      return;
    }

    setSelectedIncidentId((previousSelectedId) => {
      if (
        previousSelectedId &&
        timelineEvents.some((event) => event.id === previousSelectedId)
      ) {
        return previousSelectedId;
      }

      return undefined;
    });
  }, [timelineEvents]);

  const onJumpToIncident = (event: ReplayIncidentEvent) => {
    setSelectedIncidentId(event.id);
    jumpToIncidentInReplay(event);
  };

  const maximumLaps = Number(replaySessionInfo?.maximumLaps ?? 0);
  const { lapsCompletedLabel, lapsCompletionPercent } = useMemo(
    () =>
      buildReplayLapsCompletion({
        lapsCompleted,
        maximumLaps,
      }),
    [lapsCompleted, maximumLaps],
  );

  const durationLabel = useMemo(
    () =>
      buildReplayDurationLabel(Number(replaySessionInfo?.endEventTime ?? 0)),
    [replaySessionInfo?.endEventTime],
  );
  const totalIncidents = useMemo(() => {
    if (!replayForView) {
      return 0;
    }

    const incidents = getSessionIncidents(replayForView);
    return incidents.incidents + incidents.trackLimits + incidents.penalties;
  }, [replayForView]);

  const incidentScorePerDriver = useMemo(
    () =>
      computeReplayIncidentScorePerDriver({
        totalIncidents,
        driverCount: standings.length,
      }),
    [standings.length, totalIncidents],
  );

  const driverCoverageNote = useMemo(
    () =>
      buildReplayDriverCoverageNote({
        standingsDriverCount: standings.length,
        sessionDrivers: currentSessionLogData?.Driver,
      }),
    [currentSessionLogData?.Driver, standings.length],
  );

  const weather = useMemo(
    () => buildReplayWeather(sessionInfoData as Record<string, unknown> | null),
    [sessionInfoData],
  );

  const sessionTypeLabel = useMemo(() => {
    return buildReplaySessionTypeLabel({
      sessionType: replayForView?.metadata?.session,
      sessionTypeLabelMap,
    });
  }, [replayForView?.metadata?.session]);

  const sessionTypeColor = useMemo(() => {
    return buildReplaySessionTypeColor({
      sessionType: replayForView?.metadata?.session,
      sessionTypeColorMap: SESSION_COLOR_MAPPING,
    });
  }, [replayForView?.metadata?.session]);

  return (
    <Box sx={{ paddingBottom: '160px' }}>
      {isReplayLoadingUiVisible ? (
        <ReplayLoadingScreen
          progressDecimal={displayedLoadingScreenProgress}
          trackLabel={title}
        />
      ) : null}

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
            <Typography variant="caption" color="primary.main" fontWeight={700}>
              Session Analysis
            </Typography>
          </Stack>
        }
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h5">{title || 'Unknown Track'}</Typography>
            {sessionTypeLabel && (
              <Box
                sx={{
                  backgroundColor: sessionTypeColor,
                  color: '#fff',
                  borderRadius: '4px',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  lineHeight: '0.75rem',
                  fontWeight: 'bold',
                }}
              >
                {sessionTypeLabel}
              </Box>
            )}
          </Box>
        }
        subtitle={
          <Stack spacing={0.5}>
            <ReplaySubtitle
              timestamp={replayForView?.timestamp}
              location={location}
            />
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
        onBack={onBackToDashboard}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {isQuickViewModeActiveForReplay ? (
              <Button variant="contained" onClick={onViewReplayFromQuickView}>
                View Replay
              </Button>
            ) : null}
            <ReplayActions onViewChat={onToggleViewChat} />
          </Stack>
        }
      />

      {isQuickViewModeActiveForReplay ? (
        <Box sx={{ mt: -1, mb: 2, px: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Quick View is enabled. Replay playback-dependent data is limited
            until you load the replay in LMU using View Replay.
          </Typography>
        </Box>
      ) : null}

      <ReplaySummary
        lapsCompletedLabel={lapsCompletedLabel}
        lapsCompletionPercent={lapsCompletionPercent}
        durationLabel={durationLabel}
        totalDriversLabel={`${standings.length} Drivers`}
        driverCoverageNote={driverCoverageNote}
        totalIncidents={totalIncidents}
        incidentScorePerDriver={incidentScorePerDriver}
        classCounts={summaryClassCounts}
        weather={weather}
        isQuickViewModeActive={isQuickViewModeActiveForReplay}
      />

      <Box sx={{ mt: 2 }}>
        <ReplayMasterIncidentTimeline
          events={timelineEvents}
          availableClasses={availableClasses}
          selectedIncidentId={selectedIncidentId}
          onJumpToIncident={onJumpToIncident}
          hideJumpButtons={isQuickViewModeActiveForReplay}
          dataCoverageNote={driverCoverageNote}
        />
      </Box>

      <Box
        sx={{
          mt: 2,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: '2fr 1fr' },
          alignItems: 'stretch',
        }}
      >
        {isQuickViewModeActiveForReplay ? (
          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 2, p: 2 }}
          >
            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                Driver Standings Unavailable
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Driver standings data is not available in Quick View mode. Load
                the replay to fetch standings and enable driver focus actions.
              </Typography>
            </Stack>
          </Paper>
        ) : (
          <ReplayDriverStandings
            standings={standings}
            dataCoverageNote={driverCoverageNote}
            canShowLimitedDataFilter={hasRequestedReplayData}
            onFocusDriver={(driver) => {
              const focusTarget = driver.slotId ?? driver.driverSid;
              if (!focusTarget) {
                return;
              }

              sendMessage(
                CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
                focusTarget,
              );
            }}
            onSelectDriver={(driver) => {
              navigate(`/replay/${replayHash}/driver/${driver.driverId}`, {
                state: {
                  replayTitle: title,
                  replayLocation: location,
                  isPartialReplayData: isPartialReplayDataDetected,
                  driver,
                  incidents: timelineEvents,
                },
              });
            }}
          />
        )}

        {isQuickViewModeActiveForReplay ? (
          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 2, p: 2 }}
          >
            <Stack spacing={1}>
              <Typography variant="subtitle1" fontWeight={700}>
                Incident Heatmap Unavailable
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Heatmap and world-spot telemetry are not available in Quick View
                mode. Load the replay to fetch API-backed heatmap data.
              </Typography>
            </Stack>
          </Paper>
        ) : (
          <ReplayIncidentHeatmap
            trackLabel={title || 'Unknown Track'}
            spots={heatmapSpots}
            trackPoints={heatmapTrackPoints}
            worldSpots={heatmapWorldSpots}
          />
        )}
      </Box>

      {!isQuickViewModeActiveForReplay ? (
        <Box sx={{ mt: 2 }}>
          <ReplayJumpBar
            incidents={timelineEvents}
            selectedIncidentId={selectedIncidentId}
            onJumpToIncident={onJumpToIncident}
          />
        </Box>
      ) : (
        <Paper
          variant="outlined"
          sx={{ mt: 2, borderColor: 'divider', borderRadius: 2, p: 2 }}
        >
          <Typography variant="body2" color="text.secondary">
            Incident jump controls are unavailable in Quick View mode. Click
            View Replay to load playback and enable replay controls.
          </Typography>
        </Paper>
      )}
      <Drawer open={isChatOpen} onClose={toggleChatDrawer(false)}>
        <ReplayChat replay={replayForView} />
      </Drawer>
    </Box>
  );
};
