import { ReplayIncidentEvent } from '../components/Replay/ReplayMasterIncidentTimeline';
import { ReplayHeatmapWorldSpot } from '../components/Replay/ReplayIncidentHeatmap';
import { TrackPoints } from './trackMapToSVG';

const severitySizeMap: Record<'minor' | 'serious' | 'critical', number> = {
  minor: 20,
  serious: 28,
  critical: 36,
};

const normalizeSeverity = (
  value: unknown,
): ReplayHeatmapWorldSpot['severity'] => {
  if (value === 'minor' || value === 'serious' || value === 'critical') {
    return value;
  }

  return 'serious';
};

export const deriveReplayHeatmapWorldSpots = ({
  timelineEvents,
  heatmapTrackPoints,
  trackLengthMeters,
}: {
  timelineEvents: ReplayIncidentEvent[];
  heatmapTrackPoints: TrackPoints[];
  trackLengthMeters: number;
}): ReplayHeatmapWorldSpot[] => {
  if (
    !timelineEvents.length ||
    heatmapTrackPoints.length < 2 ||
    !Number.isFinite(trackLengthMeters) ||
    trackLengthMeters <= 0
  ) {
    return [];
  }

  const cumulativeDistances: number[] = [0];
  let polylineLength = 0;
  for (let index = 1; index < heatmapTrackPoints.length; index += 1) {
    const previous = heatmapTrackPoints[index - 1];
    const current = heatmapTrackPoints[index];
    polylineLength += Math.hypot(current.x - previous.x, current.z - previous.z);
    cumulativeDistances.push(polylineLength);
  }

  if (!Number.isFinite(polylineLength) || polylineLength <= 0) {
    return [];
  }

  const maxEventTime = timelineEvents.reduce(
    (maxTime, event) => Math.max(maxTime, Number(event.etSeconds ?? 0)),
    0,
  );

  const mapDistanceToPoint = (distanceMeters: number): { x: number; z: number } | null => {
    const normalizedDistanceMeters =
      ((distanceMeters % trackLengthMeters) + trackLengthMeters) % trackLengthMeters;
    const targetArcDistance =
      (normalizedDistanceMeters / trackLengthMeters) * polylineLength;

    for (let index = 1; index < cumulativeDistances.length; index += 1) {
      const previousArc = cumulativeDistances[index - 1];
      const currentArc = cumulativeDistances[index];

      if (targetArcDistance <= currentArc) {
        const segmentLength = Math.max(currentArc - previousArc, Number.EPSILON);
        const localRatio = (targetArcDistance - previousArc) / segmentLength;
        const previousPoint = heatmapTrackPoints[index - 1];
        const currentPoint = heatmapTrackPoints[index];

        return {
          x: previousPoint.x + (currentPoint.x - previousPoint.x) * localRatio,
          z: previousPoint.z + (currentPoint.z - previousPoint.z) * localRatio,
        };
      }
    }

    const lastPoint = heatmapTrackPoints[heatmapTrackPoints.length - 1];
    return lastPoint
      ? {
          x: lastPoint.x,
          z: lastPoint.z,
        }
      : null;
  };

  return timelineEvents
    .map((event, index) => {
      const explicitDistance = Number(event.distanceMeters);
      const estimatedDistance = Number.isFinite(explicitDistance)
        ? explicitDistance
        : maxEventTime > 0
          ? ((Number(event.etSeconds ?? 0) % maxEventTime) / maxEventTime) *
            trackLengthMeters
          : 0;

      const mappedPoint = mapDistanceToPoint(estimatedDistance);
      if (!mappedPoint) {
        return null;
      }

      const severity = normalizeSeverity(event.heatmapSeverity);

      return {
        id: `timeline-${event.id}-${index}`,
        x: mappedPoint.x,
        z: mappedPoint.z,
        size: severitySizeMap[severity],
        severity,
      };
    })
    .filter((spot): spot is ReplayHeatmapWorldSpot => spot !== null);
};

export const resolveReplayHeatmapWorldSpots = ({
  sourceWorldSpots,
  fallbackWorldSpots,
}: {
  sourceWorldSpots: unknown;
  fallbackWorldSpots: ReplayHeatmapWorldSpot[];
}): ReplayHeatmapWorldSpot[] => {
  interface ReplayHeatmapWorldSpotLike {
    id?: string;
    x?: number;
    z?: number;
    size?: number;
    severity?: unknown;
  }

  const sourceSpots = Array.isArray(sourceWorldSpots)
    ? sourceWorldSpots
        .map((spot, index: number) => {
          const sourceSpot = spot as ReplayHeatmapWorldSpotLike;
          return {
            id: String(sourceSpot?.id ?? `world-${index}`),
            x: Number(sourceSpot?.x),
            z: Number(sourceSpot?.z),
            size: Number(sourceSpot?.size ?? 24),
            severity: normalizeSeverity(sourceSpot?.severity),
          };
        })
        .filter(
          (spot) =>
            Number.isFinite(spot.x) &&
            Number.isFinite(spot.z) &&
            Number.isFinite(spot.size),
        )
    : [];

  if (sourceSpots.length > 0) {
    return sourceSpots;
  }

  return fallbackWorldSpots;
};
