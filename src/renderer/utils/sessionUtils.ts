import { CONSTANTS } from '@constants';
import { LMUReplay, SessionIncidents, SessionMetaData } from '@types';
import { countCollectionEntries, toObjectOrArrayEntries } from './collections';

interface SessionDriverEntry {
  CarClass?: string;
  Name?: string;
  CarNumber?: string;
  CarType?: string;
}

interface SessionPenaltyEntry {
  Penalty?: unknown;
}

interface SessionStreamData {
  TrackLimits?: unknown[] | Record<string, unknown>;
  Incident?: unknown[] | Record<string, unknown>;
  Penalty?: SessionPenaltyEntry[] | Record<string, SessionPenaltyEntry>;
  ChatMessage?: unknown[] | Record<string, unknown>;
  Score?: Array<{ et?: number | string }>;
  Minutes?: number;
}

interface SessionLogSection {
  Minutes?: number;
  Driver?: SessionDriverEntry[] | Record<string, SessionDriverEntry>;
  Stream?: SessionStreamData;
}

interface SessionRootLogData {
  FuelMult?: number;
  TireMult?: number;
  TireWarmers?: string;
  Race?: SessionLogSection;
  Qualify?: SessionLogSection;
  Practice1?: SessionLogSection;
  [key: string]: unknown;
}

export const normalizeDriverCarClass = (carClass?: string): string | null => {
  if (!carClass) {
    return null;
  }

  const baseCarClass = carClass.split('_')[0].trim();
  if (!baseCarClass) {
    return null;
  }

  const upperBaseCarClass = baseCarClass.toUpperCase();
  let displayCarClass = baseCarClass;

  if (upperBaseCarClass.includes('LMP2')) {
    displayCarClass = 'P2';
  } else if (upperBaseCarClass.includes('LMP3')) {
    displayCarClass = 'P3';
  } else if (upperBaseCarClass.includes('HYPER')) {
    displayCarClass = 'HY';
  } else if (upperBaseCarClass.includes('LMGT3')) {
    displayCarClass = 'GT3';
  }

  return displayCarClass;
};

export const getDriverCarClass = (
  driver: SessionDriverEntry | null | undefined,
): string | null => {
  if (!driver) {
    return null;
  }

  return normalizeDriverCarClass(driver.CarClass);
};

export const getSessionCarClasses = (replay: LMUReplay): string[] => {
  const logData = replay.logData as SessionRootLogData | null;
  if (!logData) {
    return [];
  }

  const sessionType = CONSTANTS.SESSION_TYPE_MAPPINGS[replay.metadata.session];
  const sessionInfo = logData[sessionType];

  if (!sessionInfo) {
    return [];
  }

  const carClasses = toObjectOrArrayEntries<SessionDriverEntry>(
    sessionInfo.Driver as SessionDriverEntry[] | Record<string, SessionDriverEntry>,
  );
  const uniqueCarClasses = new Map<string, string>();

  carClasses
    .map((driver) => getDriverCarClass(driver))
    .filter((carClass: string | null): carClass is string => !!carClass)
    .forEach((displayCarClass: string) => {
      const normalizedCarClass = displayCarClass.toLowerCase();
      if (!uniqueCarClasses.has(normalizedCarClass)) {
        uniqueCarClasses.set(normalizedCarClass, displayCarClass);
      }
    });

  return [...uniqueCarClasses.values()];
};

export const getSessionIncidents = (replay: LMUReplay): SessionIncidents => {
  const logData = replay.logData as SessionRootLogData | null;
  const sessionType = CONSTANTS.SESSION_TYPE_MAPPINGS[replay.metadata.session];

  if (!logData) {
    return { trackLimits: 0, incidents: 0, penalties: 0 };
  }

  try {
    const sessionData = logData[sessionType];

    if (!sessionData) {
      return { trackLimits: 0, incidents: 0, penalties: 0 };
    }

    const trackLimits = sessionData?.Stream?.TrackLimits;
    const incidents = sessionData?.Stream?.Incident;
    const penalties = sessionData?.Stream?.Penalty;

    return {
      trackLimits: countCollectionEntries(trackLimits),
      incidents: countCollectionEntries(incidents),
      penalties: countCollectionEntries(
        penalties,
        (penalty) => Boolean(penalty?.Penalty),
      ),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Error parsing log data for incidents:', error);
    }
    return { trackLimits: 0, incidents: 0, penalties: 0 };
  }
};

export const getTotalSessionIncidents = (replay: LMUReplay): number => {
  const sessionIncidents = getSessionIncidents(replay);
  return (
    sessionIncidents.trackLimits +
    sessionIncidents.incidents +
    sessionIncidents.penalties
  );
};

export const getSessionDuration = (replay: LMUReplay): string => {
  const logData = replay.logData as SessionRootLogData | null;
  const sessionType = CONSTANTS.SESSION_TYPE_MAPPINGS[replay.metadata.session];

  if (!logData) {
    return '00:00:00';
  }

  try {
    const sessionData = logData[sessionType];

    if (!sessionData || sessionData.Minutes === undefined) {
      return '00:00:00';
    }

    const totalMinutes = sessionData.Minutes;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const seconds = 0;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Error parsing log data for session duration:', error);
    }
    return '00:00:00';
  }
};

export const getSessionMetaData = (replay: LMUReplay): SessionMetaData => {
  const logData = replay.logData as SessionRootLogData | null;

  if (!logData) {
    return {
      fuelMultiplier: 1,
      tireMultiplier: 1,
      tireWarmers: false,
    };
  }

  try {
    return {
      fuelMultiplier: logData.FuelMult || 1,
      tireMultiplier: logData.TireMult || 1,
      tireWarmers: logData.TireWarmers === '1',
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Error parsing log data for session meta data:', error);
    }
    return {
      fuelMultiplier: 1,
      tireMultiplier: 1,
      tireWarmers: false,
    };
  }
};

export const getSessionDependentData = (
  replay: LMUReplay,
): SessionLogSection | null => {
  const sessionType = replay.metadata.session;
  const logData = replay.logData as SessionRootLogData | null;

  if (sessionType === 'RACE' && logData?.Race?.Minutes) {
    return logData.Race;
  }
  if (sessionType === 'QUALIFY' && logData?.Qualify?.Minutes) {
    return logData.Qualify;
  }
  if (sessionType === 'PRACTICE' && logData?.Practice1?.Minutes) {
    return logData.Practice1;
  }

  return null;
};

export const getDriverList = (replay: LMUReplay): SessionDriverEntry[] => {
  const data = getSessionDependentData(replay);
  return toObjectOrArrayEntries<SessionDriverEntry>(
    data?.Driver as SessionDriverEntry[] | Record<string, SessionDriverEntry>,
  );
};

export const getChatMessages = (replay: LMUReplay): unknown[] => {
  const data = getSessionDependentData(replay);
  return toObjectOrArrayEntries<unknown>(
    data?.Stream?.ChatMessage as unknown[] | Record<string, unknown>,
  );
};
