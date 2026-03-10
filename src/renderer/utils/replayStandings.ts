import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import { getDriverIncidentScore } from './incidentScore';
import { normalizeDriverCarClass } from './sessionUtils';
import {
  formatLapTime,
  normalizeDriverName,
} from '../components/DriverAnalysis/driverAnalysisUtils';
import {
  extractNameAndCarNumberFromIncident,
  extractSecondaryIncidentDriver,
} from './replayTimeline';
import { toArray } from './collections';

interface StandingsLapEntry {
  _?: number | string;
}

interface StandingsSessionDriver {
  Name?: string;
  CarNumber?: string | number;
  Position?: number | string;
  ClassPosition?: number | string;
  CarClass?: string;
  BestLapTime?: number | string;
  Lap?: StandingsLapEntry | StandingsLapEntry[];
  Laps?: number | string;
  SlotID?: string | number;
  slotID?: string | number;
  ID?: string | number;
  isPlayer?: string | number;
  IsPlayer?: string | number;
}

interface StandingsEntry {
  driverName?: string;
  carNumber?: string | number;
  position?: number | string;
  carClass?: string;
  class?: string;
  classPosition?: number | string;
  driverId?: string | number;
  slotID?: string | number;
  SlotID?: string | number;
  carId?: string | number;
  steamID?: string | number;
  bestLapTime?: number | string;
  lapsCompleted?: number | string;
  qualification?: number | string;
  fullTeamName?: string;
  teamName?: string;
  vehicleName?: string;
  carName?: string;
  vehicleFilename?: string;
}

interface QualificationEntry {
  driverName?: string;
  Driver?: string;
  Name?: string;
  carNumber?: string | number;
  CarNumber?: string | number;
  driverId?: string | number;
  slotID?: string | number;
  ID?: string | number;
  qualification?: number | string;
  position?: number | string;
  ClassPosition?: number | string;
}

interface StandingsSessionLogData {
  Driver?: unknown;
  Stream?: unknown;
}

const getBestLapSecondsFromDriver = (
  driver: StandingsSessionDriver | undefined,
): number | null => {
  if (!driver) {
    return null;
  }

  const bestLap = Number(driver?.BestLapTime);
  if (Number.isFinite(bestLap) && bestLap > 0) {
    return bestLap;
  }

  const lapTimes = toArray(driver?.Lap)
    .map((lap) => Number(lap?._))
    .filter((lapTime: number) => Number.isFinite(lapTime) && lapTime > 0);

  if (!lapTimes.length) {
    return null;
  }

  return Math.min(...lapTimes);
};

const buildDriverIncidentMap = (
  currentSessionLogData: StandingsSessionLogData | null | undefined,
) => {
  const driverIncidentMap = new Map<
    string,
    { trackLimits: number; incidents: number; penalties: number }
  >();

  const getDriverIncidentKey = (driverNameLike?: string) => {
    const driverName = String(driverNameLike ?? '').trim();
    if (driverName) {
      return normalizeDriverName(driverName);
    }

    return null;
  };

  const incrementIncident = (
    key: string | null,
    field: 'trackLimits' | 'incidents' | 'penalties',
  ) => {
    if (!key) {
      return;
    }

    const existing = driverIncidentMap.get(key) || {
      trackLimits: 0,
      incidents: 0,
      penalties: 0,
    };

    existing[field] += 1;
    driverIncidentMap.set(key, existing);
  };

  const stream = currentSessionLogData?.Stream as
    | {
        TrackLimits?: unknown;
        Penalty?: unknown;
        Incident?: unknown;
      }
    | undefined;

  if (stream) {
    toArray<{ Driver?: string }>(
      stream.TrackLimits as
        | { Driver?: string }
        | Array<{ Driver?: string }>,
    ).forEach((item) => {
      const rawName = String(item?.Driver ?? '').trim();
      const key = getDriverIncidentKey(rawName);
      incrementIncident(key, 'trackLimits');
    });

    toArray<{ Driver?: string }>(
      stream.Penalty as
        | { Driver?: string }
        | Array<{ Driver?: string }>,
    ).forEach((item) => {
      const rawName = String(item?.Driver ?? '').trim();
      const key = getDriverIncidentKey(rawName);
      incrementIncident(key, 'penalties');
    });

    toArray<{ _?: string }>(
      stream.Incident as
        | { _?: string }
        | Array<{ _?: string }>,
    ).forEach((item) => {
      const sourceText = String(item?._ ?? '').trim();
      const primary = extractNameAndCarNumberFromIncident(sourceText);
      const secondary = extractSecondaryIncidentDriver(sourceText);

      if (primary) {
        incrementIncident(getDriverIncidentKey(primary.name), 'incidents');
      }

      if (secondary) {
        incrementIncident(getDriverIncidentKey(secondary.name), 'incidents');
      }
    });
  }

  return { driverIncidentMap, getDriverIncidentKey };
};

export const buildReplayStandings = ({
  standingsEntries,
  qualificationEntries,
  currentSessionLogData,
}: {
  standingsEntries: unknown[];
  qualificationEntries: unknown[];
  currentSessionLogData: StandingsSessionLogData | null | undefined;
}): ReplayDriverStanding[] => {
  if (standingsEntries.length === 0) {
    return [];
  }

  const sessionDrivers = toArray<StandingsSessionDriver>(
    currentSessionLogData?.Driver as
      | StandingsSessionDriver
      | StandingsSessionDriver[],
  );
  const sessionDriverByName = new Map<string, StandingsSessionDriver>();
  const sessionDriverByCarNumber = new Map<string, StandingsSessionDriver>();
  const sessionDriverByPosition = new Map<number, StandingsSessionDriver>();
  const sessionDriverByClassAndClassPosition = new Map<
    string,
    StandingsSessionDriver
  >();

  const qualificationByName = new Map<string, QualificationEntry>();
  const qualificationByCarNumber = new Map<string, QualificationEntry>();
  const qualificationById = new Map<string, QualificationEntry>();
  const qualificationByPosition = new Map<number, QualificationEntry>();

  sessionDrivers.forEach((driver) => {
    const name = String(driver?.Name ?? '').trim();
    if (name) {
      sessionDriverByName.set(normalizeDriverName(name), driver);
    }

    const carNumber = String(driver?.CarNumber ?? '').trim();
    if (carNumber) {
      sessionDriverByCarNumber.set(carNumber, driver);
    }

    const position = Number(driver?.Position);
    if (Number.isFinite(position) && position > 0) {
      sessionDriverByPosition.set(position, driver);
    }

    const normalizedClass = normalizeDriverCarClass(String(driver?.CarClass ?? ''));
    const classPosition = Number(driver?.ClassPosition);
    if (normalizedClass && Number.isFinite(classPosition) && classPosition > 0) {
      sessionDriverByClassAndClassPosition.set(
        `${normalizedClass}|${classPosition}`,
        driver,
      );
    }
  });

  qualificationEntries.forEach((rawEntry) => {
    const entry = rawEntry as QualificationEntry;
    const name = String(entry?.driverName ?? entry?.Driver ?? entry?.Name ?? '').trim();
    if (name) {
      qualificationByName.set(normalizeDriverName(name), entry);
    }

    const carNumber = String(entry?.carNumber ?? entry?.CarNumber ?? '').trim();
    if (carNumber) {
      qualificationByCarNumber.set(carNumber, entry);
    }

    const id = String(entry?.driverId ?? entry?.slotID ?? entry?.ID ?? '').trim();
    if (id) {
      qualificationById.set(id, entry);
    }

    const qualificationPosition = Number(
      entry?.qualification ?? entry?.position ?? entry?.ClassPosition,
    );
    if (Number.isFinite(qualificationPosition) && qualificationPosition > 0) {
      qualificationByPosition.set(qualificationPosition, entry);
    }
  });

  const { driverIncidentMap, getDriverIncidentKey } =
    buildDriverIncidentMap(currentSessionLogData);

  return standingsEntries.map((rawEntry, index: number) => {
    const entry = rawEntry as StandingsEntry;
    const driverName = String(entry?.driverName ?? 'Unknown Driver');
    const carNumber = String(entry?.carNumber ?? '').trim();
    const entryPosition = Number(entry?.position);
    const normalizedEntryClass =
      normalizeDriverCarClass(String(entry?.carClass ?? '')) ||
      normalizeDriverCarClass(String(entry?.class ?? '')) ||
      '';
    const entryClassPosition = Number(entry?.classPosition ?? entry?.position);

    const matchedSessionDriver =
      sessionDriverByName.get(normalizeDriverName(driverName)) ||
      (carNumber ? sessionDriverByCarNumber.get(carNumber) : undefined) ||
      (normalizedEntryClass && Number.isFinite(entryClassPosition) && entryClassPosition > 0
        ? sessionDriverByClassAndClassPosition.get(
            `${normalizedEntryClass}|${entryClassPosition}`,
          )
        : undefined) ||
      (Number.isFinite(entryPosition)
        ? sessionDriverByPosition.get(entryPosition)
        : undefined);

    const driverId = String(
      entry?.driverId ?? entry?.slotID ?? entry?.carId ?? entry?.steamID ?? index,
    );

    const matchedQualification =
      qualificationByName.get(normalizeDriverName(driverName)) ||
      (carNumber ? qualificationByCarNumber.get(carNumber) : undefined) ||
      qualificationById.get(driverId) ||
      (Number.isFinite(entryPosition)
        ? qualificationByPosition.get(entryPosition)
        : undefined);

    const logBestLapTime = getBestLapSecondsFromDriver(matchedSessionDriver);
    const standingsBestLapTime = Number(entry?.bestLapTime);
    const hasValidLogBestLap =
      logBestLapTime !== null && Number.isFinite(logBestLapTime) && logBestLapTime > 0;
    const fastestLapSeconds = hasValidLogBestLap
      ? logBestLapTime
      : Number.isFinite(standingsBestLapTime) && standingsBestLapTime > 0
        ? standingsBestLapTime
        : null;

    const incidentKey = getDriverIncidentKey(driverName);
    const incidentStats = incidentKey
      ? driverIncidentMap.get(incidentKey) || {
          trackLimits: 0,
          incidents: 0,
          penalties: 0,
        }
      : {
          trackLimits: 0,
          incidents: 0,
          penalties: 0,
        };

    const totalDriverIncidents =
      incidentStats.trackLimits + incidentStats.incidents + incidentStats.penalties;

    const lapsCompletedForRisk = Number(
      matchedSessionDriver?.Laps ?? entry?.lapsCompleted ?? 0,
    );

    const riskIndex = Math.round(
      Math.max(
        0,
        Math.min(100, getDriverIncidentScore(incidentStats, lapsCompletedForRisk) * 10),
      ),
    );

    const matchedClassPosition = Number(matchedSessionDriver?.ClassPosition);
    const resolvedPosition =
      Number.isFinite(matchedClassPosition) && matchedClassPosition > 0
        ? matchedClassPosition
        : Number.isFinite(entryClassPosition) && entryClassPosition > 0
          ? entryClassPosition
          : Number.isFinite(entryPosition) && entryPosition > 0
            ? entryPosition
            : index + 1;

    const matchedQualificationPosition = Number(
      matchedQualification?.qualification ??
        matchedQualification?.position ??
        matchedQualification?.ClassPosition,
    );
    const focusSlotId = String(
      matchedSessionDriver?.SlotID ??
        matchedSessionDriver?.slotID ??
        entry?.slotID ??
        entry?.SlotID ??
        '',
    ).trim();
    const focusDriverSid = String(matchedSessionDriver?.ID ?? entry?.driverId ?? '').trim();
    const entryQualificationPosition = Number(entry?.qualification);
    const resolvedStartingPosition =
      Number.isFinite(matchedQualificationPosition) && matchedQualificationPosition > 0
        ? matchedQualificationPosition
        : Number.isFinite(entryQualificationPosition) && entryQualificationPosition > 0
          ? entryQualificationPosition
          : undefined;

    return {
      position: resolvedPosition,
      startingPosition: resolvedStartingPosition,
      driverName,
      driverId,
      teamName: String(entry?.fullTeamName ?? entry?.teamName ?? 'Unknown Team'),
      carName: String(
        entry?.vehicleName ?? entry?.carName ?? entry?.vehicleFilename ?? 'Unknown Car',
      ),
      carClass:
        normalizeDriverCarClass(
          String(entry?.carClass ?? matchedSessionDriver?.CarClass ?? ''),
        ) || String(entry?.carClass ?? matchedSessionDriver?.CarClass ?? 'Unknown'),
      fastestLap: formatLapTime(fastestLapSeconds),
      incidents: totalDriverIncidents,
      riskIndex,
      isAiDriver:
        String(matchedSessionDriver?.isPlayer ?? matchedSessionDriver?.IsPlayer ?? '').trim() ===
        '0',
      slotId: focusSlotId || undefined,
      driverSid: focusDriverSid || undefined,
      hasLapData: Boolean(matchedSessionDriver),
    };
  });
};
