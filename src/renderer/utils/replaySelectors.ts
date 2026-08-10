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

export const extractStandingsEntries = <T>(standingsData: unknown): T[] => {
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

export const extractQualificationEntries = <T>(standingsData: unknown): T[] => {
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

/** The points array, whichever envelope LMU wrapped it in this time. */
const readTrackMapPoints = (source: unknown): ReplayTrackPointLike[] => {
  const trackMapSource = source as
    | ReplayTrackPointLike[]
    | TrackMapEnvelope
    | null
    | undefined;

  if (Array.isArray(trackMapSource)) {
    return trackMapSource;
  }
  if (Array.isArray(trackMapSource?.points)) {
    return trackMapSource.points;
  }
  if (Array.isArray(trackMapSource?.trackPoints)) {
    return trackMapSource.trackPoints;
  }
  if (Array.isArray(trackMapSource?.trackMap)) {
    return trackMapSource.trackMap;
  }

  return [];
};

const hasFiniteCoordinates = (point: ReplayTrackPointLike): boolean =>
  Number.isFinite(point?.x) &&
  Number.isFinite(point?.y) &&
  Number.isFinite(point?.z);

export const extractTrackMapPoints = (source: unknown): TrackPoints[] =>
  readTrackMapPoints(source).filter(
    (point): point is TrackPoints =>
      (point?.type === undefined || Number(point?.type) === 0) &&
      hasFiniteCoordinates(point),
  );

/**
 * The pit lane, which LMU ships in the same response under `type: 1`.
 *
 * Worth drawing because without it a car in the pits or a garage stall floats
 * in blank space: measured live at Laguna Seca, the seven cars in garage stalls
 * sat 48–114 m from the nearest racing-line point and 10–14 m from the pit
 * path. Their positions were right and the map had nothing to read them
 * against.
 *
 * Everything above `type: 1` is left alone. Those arrive as ~110 two-point
 * pairs marking individual garage stalls — real geometry, but 110 stubs drawn
 * over each other is noise, and the pit path already gives a stopped car the
 * context it needs.
 */
export const extractTrackPitLanePoints = (source: unknown): TrackPoints[] =>
  readTrackMapPoints(source).filter(
    (point): point is TrackPoints =>
      Number(point?.type) === 1 && hasFiniteCoordinates(point),
  );

export const extractHeatmapSpots = <T>(standingsHistoryData: unknown): T[] =>
  Array.isArray(
    (standingsHistoryData as HeatmapEnvelope<T> | null | undefined)
      ?.heatmapSpots,
  )
    ? (standingsHistoryData as HeatmapEnvelope<T> | null | undefined)!
        .heatmapSpots!
    : [];
