import { normalizeDriverCarClass } from './sessionUtils';
import { toArray } from './collections';
import {
  extractDriverSid,
  extractIncidentImpactForce,
  getIncidentForceLevelLabel,
  normalizeDriverName,
  formatDuration,
} from '../components/DriverAnalysis/driverAnalysisUtils';
import { ReplayIncidentEvent } from '../components/Replay/ReplayMasterIncidentTimeline';

interface TimelineLapEntry {
  num?: number | string;
  et?: number | string;
}

interface TimelineDriverEntry {
  Name?: string;
  CarNumber?: string | number;
  CarClass?: string;
  ID?: string | number;
  isPlayer?: string | number;
  IsPlayer?: string | number;
  Lap?: TimelineLapEntry | TimelineLapEntry[];
}

interface TimelineStandingEntry {
  driverName?: string;
  carNumber?: string | number;
  CarNumber?: string | number;
  slotID?: string | number;
  SlotID?: string | number;
}

interface TimelineIncidentEntry {
  _?: string;
  et?: number | string;
}

interface TimelineTrackLimitEntry {
  _?: string;
  et?: number | string;
  Driver?: string;
  ID?: string | number;
  WarningPoints?: string | number;
  CurrentPoints?: string | number;
}

interface TimelinePenaltyEntry {
  et?: number | string;
  Driver?: string;
  ID?: string | number;
  Penalty?: string;
  Reason?: string;
}

interface TimelineSessionLogData {
  Driver?: unknown;
  Stream?: unknown;
}

export const extractNameAndCarNumberFromIncident = (
  value: string,
): { name: string; carNumber?: string } | null => {
  const match = value.match(/^([^()]+)\(([^)]+)\)/);
  if (!match) {
    return null;
  }

  return {
    name: match[1].trim(),
    carNumber: match[2].trim(),
  };
};

export const extractSecondaryIncidentDriver = (
  value: string,
): { name: string; carNumber?: string } | null => {
  const match = value.match(/with\s+([^()]+)\(([^)]+)\)/i);
  if (!match) {
    return null;
  }

  return {
    name: match[1].trim(),
    carNumber: match[2].trim(),
  };
};

export const buildPenaltyDescription = (
  penalty: TimelinePenaltyEntry,
): string | undefined => {
  const penaltyType = String(penalty?.Penalty ?? '').trim();
  const reason = String(penalty?.Reason ?? '').trim();

  if (penaltyType && reason) {
    return `${penaltyType} • ${reason}`;
  }

  if (penaltyType) {
    return penaltyType;
  }

  if (reason) {
    return reason;
  }

  return undefined;
};

export const buildTrackLimitDescription = (
  trackLimit: TimelineTrackLimitEntry,
): string | undefined => {
  const outcome = String(trackLimit?._ ?? '').trim();
  const warningPoints = String(trackLimit?.WarningPoints ?? '').trim();
  const currentPoints = String(trackLimit?.CurrentPoints ?? '').trim();

  const details: string[] = [];
  if (outcome) {
    details.push(`Outcome: ${outcome}`);
  }

  if (warningPoints) {
    details.push(`Warning Points: ${warningPoints}`);
  }

  if (currentPoints) {
    details.push(`Current Points: ${currentPoints}`);
  }

  return details.length ? details.join(' • ') : undefined;
};

export const extractIncidentDescription = (
  incidentText: string,
): string | undefined => {
  const normalized = String(incidentText ?? '').trim();
  if (!normalized) {
    return undefined;
  }

  const withMatch = normalized.match(/\bwith\s+(.+)$/i);
  if (!withMatch) {
    return undefined;
  }

  const target = withMatch[1].trim();
  if (!target) {
    return undefined;
  }

  return `Contact with ${target}`;
};

export const extractIncidentDistanceMeters = (
  incidentText: string,
): number | undefined => {
  return extractIncidentImpactForce(incidentText);
};

export const buildIncidentForceSummary = (
  incidentText: string,
): string | undefined => {
  const impactForce = extractIncidentImpactForce(incidentText);
  if (impactForce === undefined || !Number.isFinite(impactForce)) {
    return undefined;
  }

  return `Impact Force: ${impactForce.toFixed(2)} (${getIncidentForceLevelLabel(impactForce)})`;
};

export const getIncidentLapFromDriverLaps = (
  driver: TimelineDriverEntry | null | undefined,
  incidentEtSeconds: number,
): number | null => {
  if (!driver || !Number.isFinite(incidentEtSeconds)) {
    return null;
  }

  const laps: Array<{ lapNum: number; et: number }> = [];
  const driverLaps = toArray(driver?.Lap);

  for (let index = 0; index < driverLaps.length; index += 1) {
    const lap = driverLaps[index];
    const lapNum = Number(lap?.num ?? index + 1);
    const et = Number(lap?.et);

    if (Number.isFinite(lapNum) && Number.isFinite(et)) {
      laps.push({ lapNum, et });
    }
  }

  laps.sort((left, right) => left.et - right.et);

  if (!laps.length) {
    return null;
  }

  for (let index = 0; index < laps.length; index += 1) {
    const lap = laps[index];

    if (incidentEtSeconds <= lap.et) {
      return lap.lapNum;
    }
  }

  return laps[laps.length - 1].lapNum;
};

interface BuildReplayTimelineEventsArgs {
  currentSessionLogData: TimelineSessionLogData | null | undefined;
  standingsEntries: unknown[];
  replayTimeBaselineSeconds: number | null;
  shouldNormalizeReplayTimeForView: boolean;
  isPartialReplayDataDetected: boolean;
}

export const buildReplayTimelineEvents = ({
  currentSessionLogData,
  standingsEntries,
  replayTimeBaselineSeconds,
  shouldNormalizeReplayTimeForView,
  isPartialReplayDataDetected,
}: BuildReplayTimelineEventsArgs): ReplayIncidentEvent[] => {
  const stream = currentSessionLogData?.Stream as
    | {
        Incident?: unknown;
        TrackLimits?: unknown;
        Penalty?: unknown;
      }
    | undefined;

  if (!stream) {
    return [];
  }

  const drivers = toArray<TimelineDriverEntry>(
    currentSessionLogData?.Driver as TimelineDriverEntry | TimelineDriverEntry[],
  );
  const driverByName = new Map<string, TimelineDriverEntry>();
  const driverByCarNumber = new Map<string, TimelineDriverEntry>();
  const driverById = new Map<string, TimelineDriverEntry>();
  const standingsByName = new Map<string, TimelineStandingEntry>();
  const standingsByCarNumber = new Map<string, TimelineStandingEntry>();
  const canNormalizeReplayTime =
    shouldNormalizeReplayTimeForView && Number.isFinite(replayTimeBaselineSeconds);

  drivers.forEach((driver) => {
    const name = String(driver?.Name ?? '').trim();
    if (name) {
      driverByName.set(normalizeDriverName(name), driver);
    }

    const carNumber = String(driver?.CarNumber ?? '').trim();
    if (carNumber) {
      driverByCarNumber.set(carNumber, driver);
    }

    const id = String(driver?.ID ?? '').trim();
    if (id) {
      driverById.set(id, driver);
    }
  });

  standingsEntries.forEach((rawEntry) => {
    const entry = rawEntry as TimelineStandingEntry;
    const name = String(entry?.driverName ?? '').trim();
    if (name) {
      standingsByName.set(normalizeDriverName(name), entry);
    }

    const carNumber = String(entry?.carNumber ?? entry?.CarNumber ?? '').trim();
    if (carNumber) {
      standingsByCarNumber.set(carNumber, entry);
    }
  });

  const buildTimelineDriver = (
    rawName: string,
    fallbackCarNumber?: string,
    fallbackSid?: string | number,
  ) => {
    const normalized = normalizeDriverName(rawName);
    const matchedDriver =
      driverByName.get(normalized) ||
      (fallbackCarNumber
        ? driverByCarNumber.get(String(fallbackCarNumber).trim())
        : undefined) ||
      (fallbackSid ? driverById.get(String(fallbackSid).trim()) : undefined);
    const matchedStanding =
      standingsByName.get(normalized) ||
      (fallbackCarNumber
        ? standingsByCarNumber.get(String(fallbackCarNumber).trim())
        : undefined);
    const driverName = rawName.replace(/#\d+$/, '').trim();
    const parsedSid = extractDriverSid(rawName);

    return {
      displayName: driverName || 'Unknown Driver',
      carNumber: String(matchedDriver?.CarNumber ?? fallbackCarNumber ?? ''),
      carClass:
        normalizeDriverCarClass(String(matchedDriver?.CarClass ?? '')) ||
        String(matchedDriver?.CarClass ?? 'Unknown'),
      slotId:
        String(
          matchedStanding?.slotID ?? matchedStanding?.SlotID ?? '',
        ).trim() || undefined,
      driverSid:
        String(parsedSid ?? fallbackSid ?? matchedDriver?.ID ?? '').trim() ||
        undefined,
      isAiDriver:
        String(
          matchedDriver?.isPlayer ?? matchedDriver?.IsPlayer ?? '',
        ).trim() === '0',
      hasLapData: Boolean(matchedDriver),
    };
  };

  const getMatchedDriver = (rawName: string) => {
    const normalized = normalizeDriverName(rawName);
    return driverByName.get(normalized);
  };

  const buildEvent = (
    type: ReplayIncidentEvent['type'],
    item: { et?: number | string; distanceMeters?: number | string },
    index: number,
    driversForEvent: ReplayIncidentEvent['drivers'],
    description?: string,
    primaryDriverRawName?: string,
  ): ReplayIncidentEvent | null => {
    const sourceEtSeconds = Number(item?.et);
    if (!Number.isFinite(sourceEtSeconds)) {
      return null;
    }

    const normalizedEtSeconds = canNormalizeReplayTime
      ? Math.max(sourceEtSeconds - (replayTimeBaselineSeconds ?? 0), 0)
      : sourceEtSeconds;

    const jumpToSeconds = Math.max(sourceEtSeconds - 5, 0);
    const matchedPrimaryDriver = primaryDriverRawName
      ? getMatchedDriver(primaryDriverRawName)
      : undefined;
    const computedLap = getIncidentLapFromDriverLaps(
      matchedPrimaryDriver,
      sourceEtSeconds,
    );
    const lapValue =
      computedLap !== null && Number.isFinite(computedLap)
        ? Math.max(1, computedLap)
        : null;

    return {
      id: `${type}-${index}-${sourceEtSeconds}`,
      type,
      timestampLabel: formatDuration(normalizedEtSeconds),
      timestampEstimated: isPartialReplayDataDetected,
      lapLabel: lapValue !== null ? `Lap ${lapValue}` : 'Lap --',
      drivers: driversForEvent,
      description,
      etSeconds: sourceEtSeconds,
      jumpToSeconds,
      heatmapSeverity:
        type === 'track-limit'
          ? 'minor'
          : type === 'penalty'
            ? 'critical'
            : 'serious',
      distanceMeters: Number(item?.distanceMeters),
    };
  };

  const collisionEvents = toArray<TimelineIncidentEntry>(
    stream.Incident as
      | TimelineIncidentEntry
      | TimelineIncidentEntry[],
  )
    .map((item, index: number) => {
      const sourceText = String(item?._ ?? '').trim();
      const primary = extractNameAndCarNumberFromIncident(sourceText);
      const secondary = extractSecondaryIncidentDriver(sourceText);
      const forceSummary = buildIncidentForceSummary(sourceText);
      const baseDescription = extractIncidentDescription(sourceText);
      const description =
        [baseDescription, forceSummary]
          .filter((value): value is string => Boolean(value))
          .join(' • ') || undefined;
      const impactForce = extractIncidentDistanceMeters(sourceText);

      const driversForEvent = [
        primary
          ? buildTimelineDriver(primary.name, primary.carNumber)
          : {
              displayName: sourceText || 'Unknown Driver',
              carNumber: '',
              carClass: 'Unknown',
              hasLapData: false,
            },
      ];

      if (secondary) {
        driversForEvent.push(
          buildTimelineDriver(secondary.name, secondary.carNumber),
        );
      }

      return buildEvent(
        'collision',
        {
          ...item,
          distanceMeters: impactForce,
        },
        index,
        driversForEvent,
        description,
        primary?.name,
      );
    })
    .filter(
      (event: ReplayIncidentEvent | null): event is ReplayIncidentEvent =>
        event !== null,
    );

  const trackLimitEvents = toArray<TimelineTrackLimitEntry>(
    stream.TrackLimits as
      | TimelineTrackLimitEntry
      | TimelineTrackLimitEntry[],
  )
    .map((item, index: number) => {
      const driverName = String(item?.Driver ?? '').trim();
      const driversForEvent = [
        buildTimelineDriver(driverName, undefined, item?.ID),
      ];
      return buildEvent(
        'track-limit',
        item,
        index,
        driversForEvent,
        buildTrackLimitDescription(item),
        driverName,
      );
    })
    .filter(
      (event: ReplayIncidentEvent | null): event is ReplayIncidentEvent =>
        event !== null,
    );

  const penaltyEvents = toArray<TimelinePenaltyEntry>(
    stream.Penalty as
      | TimelinePenaltyEntry
      | TimelinePenaltyEntry[],
  )
    .map((item, index: number) => {
      const driverName = String(item?.Driver ?? '').trim();
      const driversForEvent = [
        buildTimelineDriver(driverName, undefined, item?.ID),
      ];
      return buildEvent(
        'penalty',
        item,
        index,
        driversForEvent,
        buildPenaltyDescription(item),
        driverName,
      );
    })
    .filter(
      (event: ReplayIncidentEvent | null): event is ReplayIncidentEvent =>
        event !== null,
    );

  return [...collisionEvents, ...trackLimitEvents, ...penaltyEvents].sort(
    (left, right) => (left.etSeconds ?? 0) - (right.etSeconds ?? 0),
  );
};
