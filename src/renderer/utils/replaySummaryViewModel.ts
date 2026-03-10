import { formatDuration } from '../components/DriverAnalysis/driverAnalysisUtils';
import { toArray } from './collections';

export type ReplaySummaryWeatherCondition =
  | 'clear'
  | 'slightly-cloudy'
  | 'cloudy'
  | 'light-rain'
  | 'heavy-rain';

export interface ReplaySummaryClassCount {
  label: string;
  value: number;
}

export interface ReplaySummaryWeatherModel {
  condition: ReplaySummaryWeatherCondition;
  lowTempC: number;
  highTempC: number;
  wind: string;
}

interface ReplayClassStandingLike {
  carClass?: string;
}

interface ReplaySummaryStandingLike {
  carClass?: string;
}

interface ReplayClassTimelineEventLike {
  drivers?: Array<{ carClass?: string }>;
}

interface ReplayWeatherLike {
  raining?: number;
  darkCloud?: number;
  ambientTemp?: number;
  trackTemp?: number;
  windSpeed?: {
    velocity?: number;
  };
}

export const buildReplaySummaryClassCounts = (
  standingsEntries: unknown[],
): ReplaySummaryClassCount[] => {
  if (standingsEntries.length === 0) {
    return [];
  }

  const counts = standingsEntries.reduce(
    (acc: Record<string, number>, entry: unknown) => {
      const standingEntry = entry as ReplaySummaryStandingLike;
      const key = String(standingEntry?.carClass || 'Unknown');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {},
  );

  return Object.entries(counts).map(([label, value]) => ({
    label,
    value: Number(value),
  }));
};

export const buildReplayAvailableClasses = ({
  standings,
  timelineEvents,
}: {
  standings: ReplayClassStandingLike[];
  timelineEvents: ReplayClassTimelineEventLike[];
}): string[] => {
  return [
    ...new Set(
      [
        ...standings.map((entry) => entry.carClass),
        ...timelineEvents.flatMap((event) =>
          (event.drivers ?? []).map((driver) => driver.carClass),
        ),
      ].filter(Boolean),
    ),
  ] as string[];
};

export const buildReplayLapsCompletion = ({
  lapsCompleted,
  maximumLaps,
}: {
  lapsCompleted: number;
  maximumLaps: number;
}): { lapsCompletedLabel: string; lapsCompletionPercent: number } => {
  const hasValidMaximumLaps =
    Number.isFinite(maximumLaps) && maximumLaps > 0 && maximumLaps < 1_000_000;

  return {
    lapsCompletedLabel: hasValidMaximumLaps
      ? `${lapsCompleted}/${maximumLaps}`
      : `${lapsCompleted}`,
    lapsCompletionPercent: hasValidMaximumLaps
      ? (lapsCompleted / maximumLaps) * 100
      : 0,
  };
};

export const buildReplayDurationLabel = (
  endEventTime: number | null | undefined,
): string => formatDuration(Number(endEventTime ?? 0));

export const computeReplayIncidentScorePerDriver = ({
  totalIncidents,
  driverCount,
}: {
  totalIncidents: number;
  driverCount: number;
}): number => {
  const safeDriverCount = Math.max(Number(driverCount) || 0, 1);
  return totalIncidents / safeDriverCount;
};

export const buildReplayDriverCoverageNote = ({
  standingsDriverCount,
  sessionDrivers,
}: {
  standingsDriverCount: number;
  sessionDrivers: unknown;
}): string | undefined => {
  const logDriverCount = toArray<unknown>(sessionDrivers as unknown[]).length;

  if (
    !standingsDriverCount ||
    !logDriverCount ||
    logDriverCount >= standingsDriverCount
  ) {
    return undefined;
  }

  return `Showing ${logDriverCount} of ${standingsDriverCount} drivers with lap-level log data.`;
};

export const buildReplayWeather = (
  sessionInfoData: ReplayWeatherLike | null | undefined,
): ReplaySummaryWeatherModel => {
  const raining = Number(sessionInfoData?.raining ?? 0);
  const darkCloud = Number(sessionInfoData?.darkCloud ?? 0);
  const ambientTemp = Number(sessionInfoData?.ambientTemp ?? 0);
  const trackTemp = Number(sessionInfoData?.trackTemp ?? ambientTemp);
  const windSpeed = Number(sessionInfoData?.windSpeed?.velocity ?? 0);

  const condition: ReplaySummaryWeatherCondition =
    raining >= 0.5
      ? 'heavy-rain'
      : raining > 0
        ? 'light-rain'
        : darkCloud >= 0.6
          ? 'cloudy'
          : darkCloud >= 0.2
            ? 'slightly-cloudy'
            : 'clear';

  return {
    condition,
    lowTempC: Math.round(Math.min(ambientTemp, trackTemp)),
    highTempC: Math.round(Math.max(ambientTemp, trackTemp)),
    wind: `${Math.round(windSpeed)} km/h`,
  };
};

export const buildReplaySessionTypeLabel = ({
  sessionType,
  sessionTypeLabelMap,
}: {
  sessionType: string | undefined;
  sessionTypeLabelMap: Record<string, string>;
}): string | undefined => {
  if (!sessionType) {
    return undefined;
  }

  return sessionTypeLabelMap[sessionType] ?? 'Practice';
};

export const buildReplaySessionTypeColor = ({
  sessionType,
  sessionTypeColorMap,
}: {
  sessionType: string | undefined;
  sessionTypeColorMap: Record<string, string>;
}): string => {
  if (!sessionType) {
    return 'success.main';
  }

  return sessionTypeColorMap[sessionType] ?? 'success.main';
};
