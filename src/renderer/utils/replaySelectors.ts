import { TrackPoints } from './trackMapToSVG';

interface StandingsEnvelope<T> {
  entries?: T[];
  data?: T[];
}

interface QualificationEnvelope<T> {
  qualification?: T[] | StandingsEnvelope<T>;
}

interface ReplayTrackPointLike {
  type?: number | string;
  x?: number;
  y?: number;
  z?: number;
}

interface TrackMapEnvelope {
  points?: ReplayTrackPointLike[];
  trackPoints?: ReplayTrackPointLike[];
  trackMap?: ReplayTrackPointLike[];
}

interface HeatmapEnvelope<T> {
  heatmapSpots?: T[];
}

export const extractStandingsEntries = <T,>(
  standingsData: unknown,
): T[] => {
  const source = standingsData as T[] | StandingsEnvelope<T> | null | undefined;
  if (Array.isArray(source)) {
    return source;
  }

  if (Array.isArray(source?.entries)) {
    return source.entries;
  }

  if (Array.isArray(source?.data)) {
    return source.data;
  }

  return [];
};

export const extractQualificationEntries = <T,>(
  standingsData: unknown,
): T[] => {
  const source = standingsData as QualificationEnvelope<T> | null | undefined;
  const qualification = source?.qualification;
  if (Array.isArray(qualification)) {
    return qualification;
  }

  if (Array.isArray(qualification?.entries)) {
    return qualification.entries;
  }

  if (Array.isArray(qualification?.data)) {
    return qualification.data;
  }

  return [];
};

export const extractTrackMapPoints = (
  source: unknown,
): TrackPoints[] => {
  const trackMapSource = source as ReplayTrackPointLike[] | TrackMapEnvelope | null | undefined;
  let points: ReplayTrackPointLike[] = [];

  if (Array.isArray(trackMapSource)) {
    points = trackMapSource;
  } else if (Array.isArray(trackMapSource?.points)) {
    points = trackMapSource.points;
  } else if (Array.isArray(trackMapSource?.trackPoints)) {
    points = trackMapSource.trackPoints;
  } else if (Array.isArray(trackMapSource?.trackMap)) {
    points = trackMapSource.trackMap;
  }

  return points.filter(
    (point): point is TrackPoints =>
      (point?.type === undefined || Number(point?.type) === 0) &&
      Number.isFinite(point?.x) &&
      Number.isFinite(point?.y) &&
      Number.isFinite(point?.z),
  );
};

export const extractHeatmapSpots = <T,>(
  standingsHistoryData: unknown,
): T[] =>
  Array.isArray((standingsHistoryData as HeatmapEnvelope<T> | null | undefined)?.heatmapSpots)
    ? (standingsHistoryData as HeatmapEnvelope<T> | null | undefined)!.heatmapSpots!
    : [];
