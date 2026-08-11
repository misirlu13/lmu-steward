import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CONSTANTS } from '@constants';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Drawer from '@mui/material/Drawer';
import {
  Box,
  Button,
  Paper,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
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
import { ReplayDriverStandings } from '../components/Replay/ReplayDriverStandings';
import { ReplayIncidentHeatmap } from '../components/Replay/ReplayIncidentHeatmap';
import { ExportProgressDialog } from '../components/Dashboard/ExportProgressDialog';
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
import { buildSessionExport } from '../utils/sessionExportModel';
import {
  SessionExportFormat,
  sessionExportFileName,
  serializeSessionExport,
  toSessionMarkdown,
} from '../utils/sessionExportFormats';
import { useReplayDerivedData } from '../hooks/useReplayDerivedData';
import { useLiveDataForReplay } from '../hooks/useLiveDataForReplay';
import { ReplayIncidentDossier } from '../components/Replay/ReplayIncidentDossier';
import { ExportTelemetryDialog } from '../components/Replay/ExportTelemetryDialog';
import { useReplayViewOrchestration } from '../hooks/useReplayViewOrchestration';
import { useViewReplayDisabledReason } from '../hooks/useReplayGating';

const PARTIAL_REPLAY_DATA_NOTICE =
  'Partial replay data detected. This replay appears to have started after the live session was already in progress, so incident timing may be approximate.';

const sessionTypeLabelMap: Record<string, string> = {
  RACE: 'Race',
  QUALIFY: 'Qualifying',
  PRACTICE: 'Practice',
};

export const ReplayView: React.FC = () => {
  const { replayHash } = useParams<{ replayHash: string }>();
  const {
    currentReplay,
    currentTrackMap,
    loadingState,
    isReplayActive,
    quickViewEnabled,
    replays,
    experimentalFeaturesEnabled,
    exportReplay,
    exportSessionData,
    stewardDecisions,
    exportProgress,
    exportResult,
    clearExportResult,
    subscribeToApiChannel,
  } = useApi();
  const viewReplayDisabledReason = useViewReplayDisabledReason();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isExportTelemetryDialogOpen, setIsExportTelemetryDialogOpen] =
    useState(false);
  // Off unless asked for: sharing another driver's inputs is the deliberate
  // choice, not the default one.
  const [includeLiveTelemetry, setIncludeLiveTelemetry] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
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
    navigateToDashboard: () => navigate('/replays'),
  });

  const toggleChatDrawer = (newOpen: boolean) => () => {
    setIsChatOpen(newOpen);
  };

  const { title, location } = useMemo(
    () =>
      resolveReplayHeaderMetadata({
        replay: replayForView,
        trackMetaData: CONSTANTS.TRACK_META_DATA,
      }),
    [replayForView],
  );

  const onCloseAndBackToReplays = () => {
    sendMessage(CONSTANTS.API.POST_CLOSE_REPLAY);
    navigate('/replays');
  };

  const onBackToReplays = () => {
    // sendMessage(CONSTANTS.API.POST_CLOSE_REPLAY);
    navigate('/replays');
  };

  const onViewReplayFromQuickView = () => {
    requestViewReplayFromQuickView();
  };

  const onToggleViewChat = () => {
    setIsChatOpen((prev) => !prev);
  };

  const liveDataForReplay = useLiveDataForReplay(replayForView?.hash);

  const {
    currentSessionLogData,
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
    liveDataForReplay,
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
  }, [timelineEvents, setSelectedIncidentId]);

  const selectedTimelineEvent = timelineEvents.find(
    (event) => event.id === selectedIncidentId,
  );

  const liveTraceCount = (liveDataForReplay?.incidents ?? []).filter(
    (record) => record.hasContext,
  ).length;

  const runExport = (withTelemetry: boolean) => {
    if (!currentReplay?.logDataFileName) {
      return;
    }

    exportReplay({
      hash: currentReplay.hash,
      replayName: currentReplay.replayName,
      sceneDesc: currentReplay.metadata.sceneDesc,
      session: currentReplay.metadata.session,
      timestamp: currentReplay.timestamp,
      logDataFileName: currentReplay.logDataFileName,
      includeLiveTelemetry: withTelemetry,
    });
  };

  /*
    Opens the dossier and nothing else.

    Jumping stays its own act on the Jump button: seeking takes over Le Mans
    Ultimate and costs seconds, and a steward working down an incident list
    wants to read several before choosing which is worth watching.
  */
  const onSelectIncident = (event: ReplayIncidentEvent) => {
    setSelectedIncidentId(event.id);
  };

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

  // Serializes what the view already holds. Nothing is recomputed here, so an
  // export can never disagree with what the steward was looking at.
  const buildExport = useCallback(
    () =>
      buildSessionExport({
        replay: replayForView,
        sessionLogData: currentSessionLogData,
        rootLogData: replayForView?.logData ?? null,
        standings,
        incidents: timelineEvents,
        lapsCompleted,
        trackDisplayName: title,
        decisions: Object.values(stewardDecisions),
      }),
    [
      currentSessionLogData,
      lapsCompleted,
      replayForView,
      standings,
      stewardDecisions,
      timelineEvents,
      title,
    ],
  );

  const onExportSessionData = useCallback(
    (format: SessionExportFormat) => {
      const data = buildExport();
      exportSessionData({
        fileName: sessionExportFileName(data, format),
        contents: serializeSessionExport(data, format),
        format,
      });
    },
    [buildExport, exportSessionData],
  );

  const onCopySessionMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(toSessionMarkdown(buildExport()));
      setCopyNotice('Session report copied to clipboard.');
    } catch {
      // Clipboard access can be refused outright, and a copy action that
      // silently does nothing is worse than one that says it failed.
      setCopyNotice('Could not copy to the clipboard.');
    }
  }, [buildExport]);

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
              onClick={onBackToReplays}
            >
              Replays
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
        onBack={onBackToReplays}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            {/*
              The span is what makes the explanation reachable. MUI fires no
              mouse events on a disabled control, so a bare Tooltip on it would
              never open — and a dead button with no reason given is worse than
              no button.
            */}
            {isQuickViewModeActiveForReplay ? (
              <Tooltip title={viewReplayDisabledReason ?? ''}>
                <span>
                  <Button
                    variant="contained"
                    disabled={Boolean(viewReplayDisabledReason)}
                    onClick={onViewReplayFromQuickView}
                  >
                    View Replay
                  </Button>
                </span>
              </Tooltip>
            ) : null}
            <ReplayActions
              onViewChat={onToggleViewChat}
              canExport={experimentalFeaturesEnabled}
              exportDisabledReason={
                currentReplay?.logDataFileName
                  ? null
                  : 'This replay has no matched result log, so there is nothing to share alongside it.'
              }
              sessionDataDisabledReason={
                standings.length === 0
                  ? 'This session has no synced standings yet, so there is nothing to export.'
                  : null
              }
              onExportSessionData={onExportSessionData}
              onCopySessionMarkdown={onCopySessionMarkdown}
              onCloseAndBackToReplays={onCloseAndBackToReplays}
              onExport={() => {
                if (!currentReplay?.logDataFileName) {
                  return;
                }

                /*
                  A capture with traces makes the export a decision about other
                  people's telemetry, so it is asked rather than assumed. With
                  nothing to ask about, the export runs straight through.
                */
                if (liveTraceCount > 0) {
                  setIsExportTelemetryDialogOpen(true);
                  return;
                }

                runExport(false);
              }}
            />
          </Stack>
        }
      />

      {isQuickViewModeActiveForReplay ? (
        <Box sx={{ mt: -1, mb: 2, px: 0.5 }}>
          {/*
            The instruction is only followable when View Replay is available,
            so when it is not, the reason is appended — otherwise the copy
            tells a steward to click something the page has just greyed out.
          */}
          <Typography variant="body2" color="text.secondary">
            Quick View is enabled. Replay playback-dependent data is limited
            until you load the replay in LMU using View Replay.
            {viewReplayDisabledReason ? ` ${viewReplayDisabledReason}` : ''}
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
          onSelectIncident={onSelectIncident}
          onJumpToIncident={onJumpToIncident}
          hideJumpButtons={isQuickViewModeActiveForReplay}
          dataCoverageNote={driverCoverageNote}
        />
      </Box>

      {/*
        Directly under the timeline, so the evidence sits next to the incident
        it belongs to and the footage the Jump button just sought to. Renders
        nothing at all unless this replay has a linked capture that recorded
        this particular incident.
      */}
      <Box sx={{ mt: 2 }}>
        <ReplayIncidentDossier
          event={selectedTimelineEvent}
          liveData={liveDataForReplay}
          replayHash={replayHash}
        />
      </Box>

      <ExportTelemetryDialog
        open={isExportTelemetryDialogOpen}
        traceCount={liveTraceCount}
        includeTelemetry={includeLiveTelemetry}
        onIncludeTelemetryChange={setIncludeLiveTelemetry}
        onCancel={() => setIsExportTelemetryDialogOpen(false)}
        onConfirm={() => {
          setIsExportTelemetryDialogOpen(false);
          runExport(includeLiveTelemetry);
        }}
      />

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
            {viewReplayDisabledReason ? ` ${viewReplayDisabledReason}` : ''}
          </Typography>
        </Paper>
      )}
      <Drawer open={isChatOpen} onClose={toggleChatDrawer(false)}>
        <ReplayChat replay={replayForView} />
      </Drawer>
      {/* A single session can still be 400 MB, so it gets the same feedback
          the dashboard's weekend export does. */}
      <ExportProgressDialog progress={exportProgress} />
      <Snackbar
        open={Boolean(copyNotice)}
        autoHideDuration={4000}
        onClose={() => setCopyNotice(null)}
        message={copyNotice ?? ''}
      />
      <Snackbar
        open={Boolean(exportResult && !exportResult.canceled)}
        autoHideDuration={exportResult?.status === 'error' ? 12000 : 8000}
        onClose={clearExportResult}
        message={
          exportResult?.status === 'error'
            ? `Export failed. ${exportResult.message}`
            : `Exported to ${exportResult?.filePath ?? ''}`
        }
      />
    </Box>
  );
};
