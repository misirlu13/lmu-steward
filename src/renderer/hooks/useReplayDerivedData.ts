import { useMemo } from 'react';
import { CONSTANTS } from '@constants';
import { LMUReplay } from '@types';
import { ReplayIncidentEvent } from '../components/Replay/ReplayMasterIncidentTimeline';
import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import { ReplayHeatmapSpot, ReplayHeatmapWorldSpot } from '../components/Replay/ReplayIncidentHeatmap';
import { TrackPoints } from '../utils/trackMapToSVG';
import { buildReplayStandings } from '../utils/replayStandings';
import { buildReplayTimelineEvents } from '../utils/replayTimeline';
import {
  computeFirstReplayEventEtSeconds,
  computeReplayTimeBaselineSeconds,
  detectPartialReplayData,
  shouldNormalizeReplayTime,
} from '../utils/replayViewState';
import {
  extractHeatmapSpots,
  extractQualificationEntries,
  extractStandingsEntries,
  extractTrackMapPoints,
} from '../utils/replaySelectors';
import {
  buildReplayAvailableClasses,
  buildReplaySummaryClassCounts,
} from '../utils/replaySummaryViewModel';
import {
  deriveReplayHeatmapWorldSpots,
  resolveReplayHeatmapWorldSpots,
} from '../utils/replayHeatmapWorldSpots';
import {
  ReplaySessionLogDataLike,
  resolveReplaySessionLogData,
} from '../utils/replayMetadata';

interface UseReplayDerivedDataArgs {
  replayForView: LMUReplay | null;
  standingsData: unknown;
  standingsHistoryData: Record<string, unknown> | null;
  currentTrackMap: { data?: unknown } | null;
  cachedTrackMapData: { data?: unknown } | null;
}

export const useReplayDerivedData = ({
  replayForView,
  standingsData,
  standingsHistoryData,
  currentTrackMap,
  cachedTrackMapData,
}: UseReplayDerivedDataArgs) => {
  const currentSessionLogData = useMemo<ReplaySessionLogDataLike | null>(
    () =>
      resolveReplaySessionLogData({
        replay: replayForView,
        sessionTypeMappings: CONSTANTS.SESSION_TYPE_MAPPINGS,
      }),
    [replayForView],
  );

  const standingsEntries = useMemo(
    () => extractStandingsEntries(standingsData),
    [standingsData],
  );

  const qualificationEntries = useMemo(
    () => extractQualificationEntries(standingsData),
    [standingsData],
  );

  const replayTimeBaselineSeconds = useMemo(
    () => computeReplayTimeBaselineSeconds(currentSessionLogData?.Stream),
    [currentSessionLogData?.Stream],
  );

  const firstReplayEventEtSeconds = useMemo(
    () => computeFirstReplayEventEtSeconds(currentSessionLogData?.Stream),
    [currentSessionLogData?.Stream],
  );

  const isPartialReplayDataDetected = useMemo(
    () =>
      detectPartialReplayData({
        replayTimeBaselineSeconds,
        firstReplayEventEtSeconds,
        standingsEntries,
      }),
    [firstReplayEventEtSeconds, replayTimeBaselineSeconds, standingsEntries],
  );

  const shouldNormalizeReplayTimeForView = shouldNormalizeReplayTime(
    isPartialReplayDataDetected,
    replayTimeBaselineSeconds,
  );

  const summaryClassCounts = useMemo(
    () => buildReplaySummaryClassCounts(standingsEntries),
    [standingsEntries],
  );

  const timelineEvents = useMemo<ReplayIncidentEvent[]>(() => {
    return buildReplayTimelineEvents({
      currentSessionLogData,
      standingsEntries,
      replayTimeBaselineSeconds,
      shouldNormalizeReplayTimeForView,
      isPartialReplayDataDetected,
    });
  }, [
    currentSessionLogData,
    isPartialReplayDataDetected,
    replayTimeBaselineSeconds,
    shouldNormalizeReplayTimeForView,
    standingsEntries,
  ]);

  const standings = useMemo<ReplayDriverStanding[]>(
    () =>
      buildReplayStandings({
        standingsEntries,
        qualificationEntries,
        currentSessionLogData,
      }),
    [standingsEntries, qualificationEntries, currentSessionLogData],
  );

  const heatmapTrackPoints = useMemo<TrackPoints[]>(() => {
    const liveTrackMapPoints = extractTrackMapPoints(currentTrackMap?.data);
    if (liveTrackMapPoints.length) {
      return liveTrackMapPoints;
    }

    return extractTrackMapPoints(cachedTrackMapData?.data);
  }, [cachedTrackMapData, currentTrackMap]);

  const heatmapSpots = useMemo<ReplayHeatmapSpot[]>(
    () => extractHeatmapSpots(standingsHistoryData),
    [standingsHistoryData],
  );

  const derivedHeatmapWorldSpots = useMemo<ReplayHeatmapWorldSpot[]>(() => {
    const trackLengthMeters = Number(
      replayForView?.logData?.TrackLength ?? currentSessionLogData?.TrackLength,
    );

    return deriveReplayHeatmapWorldSpots({
      timelineEvents,
      heatmapTrackPoints,
      trackLengthMeters,
    });
  }, [
    replayForView?.logData?.TrackLength,
    currentSessionLogData?.TrackLength,
    heatmapTrackPoints,
    timelineEvents,
  ]);

  const heatmapWorldSpots = useMemo<ReplayHeatmapWorldSpot[]>(() => {
    return resolveReplayHeatmapWorldSpots({
      sourceWorldSpots: standingsHistoryData?.incidentWorldSpots,
      fallbackWorldSpots: derivedHeatmapWorldSpots,
    });
  }, [derivedHeatmapWorldSpots, standingsHistoryData]);

  const availableClasses = useMemo(
    () =>
      buildReplayAvailableClasses({
        standings,
        timelineEvents,
      }),
    [standings, timelineEvents],
  );

  const lapsCompleted = useMemo(
    () => Number(currentSessionLogData?.MostLapsCompleted ?? 0),
    [currentSessionLogData],
  );

  return {
    currentSessionLogData,
    standingsEntries,
    qualificationEntries,
    replayTimeBaselineSeconds,
    firstReplayEventEtSeconds,
    isPartialReplayDataDetected,
    shouldNormalizeReplayTimeForView,
    summaryClassCounts,
    timelineEvents,
    standings,
    heatmapTrackPoints,
    heatmapSpots,
    heatmapWorldSpots,
    availableClasses,
    lapsCompleted,
  };
};
