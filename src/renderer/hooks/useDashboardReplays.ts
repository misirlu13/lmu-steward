import { useCallback, useEffect, useMemo, useState } from 'react';
import { LMUReplay } from '@types';
import { useApi } from '../providers/ApiContext';
import {
  getSessionCarClasses,
  getTotalSessionIncidents,
} from '../utils/sessionUtils';
import {
  DEFAULT_FILTERS,
  Filters,
} from '../components/Dashboard/DashboardFilter';

export type DashboardSortByOptions = 'date' | 'track' | 'incidents';

const REPLAYS_PER_PAGE = 5;

interface SessionDriverLike {
  CarClass?: string;
}

const getSessionLength = (replay: LMUReplay): number | null => {
  const sessionType = replay.metadata.session;
  const logData = replay.logData;

  if (sessionType === 'RACE' && logData?.Race?.Minutes) {
    return logData.Race.Minutes;
  }
  if (sessionType === 'QUALIFY' && logData?.Qualify?.Minutes) {
    return logData.Qualify.Minutes;
  }
  if (sessionType === 'PRACTICE' && logData?.Practice1?.Minutes) {
    return logData.Practice1.Minutes;
  }

  return null;
};

const getSessionLengthCategory = (minutes: number | null): string => {
  if (minutes === null) return '';
  if (minutes <= 20) return 'short';
  if (minutes <= 120) return 'medium';
  return 'long';
};

const getSessionDrivers = (replay: LMUReplay): SessionDriverLike[] => {
  const sessionType = replay.metadata.session;
  const logData = replay.logData;

  if (sessionType === 'RACE' && logData?.Race?.Driver) {
    return Array.isArray(logData.Race.Driver)
      ? logData.Race.Driver
      : [logData.Race.Driver];
  }
  if (sessionType === 'QUALIFY' && logData?.Qualify?.Driver) {
    return Array.isArray(logData.Qualify.Driver)
      ? logData.Qualify.Driver
      : [logData.Qualify.Driver];
  }
  if (sessionType === 'PRACTICE' && logData?.Practice1?.Driver) {
    return Array.isArray(logData.Practice1.Driver)
      ? logData.Practice1.Driver
      : [logData.Practice1.Driver];
  }

  return [];
};

const getFieldSize = (replay: LMUReplay): number => getSessionDrivers(replay).length;

const getFieldSizeCategory = (size: number): string => {
  if (size <= 10) return 'small';
  if (size <= 30) return 'medium';
  return 'large';
};

const getCarClasses = (replay: LMUReplay): string[] => {
  const drivers = getSessionDrivers(replay);
  return [
    ...new Set(
      drivers
        .map((driver) => driver?.CarClass)
        .filter((carClass): carClass is string => Boolean(carClass)),
    ),
  ];
};

const getIncidentSeverity = (replay: LMUReplay): string => {
  const incidents = getTotalSessionIncidents(replay);
  const driverCount = getFieldSize(replay);
  const scorePerDriver = driverCount > 0 ? incidents / driverCount : 0;

  if (scorePerDriver < 2) {
    return 'low';
  }
  if (scorePerDriver < 5) {
    return 'medium';
  }
  return 'high';
};

const matchesFilters = (replay: LMUReplay, filters: Filters): boolean => {
  const [startDate, endDate] = filters.dateRange;
  const replayTimestamp = Number(replay.timestamp) * 1000;

  if (startDate) {
    const startOfDay = startDate.startOf('day').valueOf();
    if (replayTimestamp < startOfDay) return false;
  }

  if (endDate) {
    const endOfDay = endDate.endOf('day').valueOf();
    if (replayTimestamp > endOfDay) return false;
  }

  if (filters.track && replay.metadata.sceneDesc !== filters.track) {
    return false;
  }

  if (filters.sessionType && replay.metadata.session !== filters.sessionType) {
    return false;
  }

  if (filters.sessionLength) {
    const lengthMinutes = getSessionLength(replay);
    const category = getSessionLengthCategory(lengthMinutes);
    if (category !== filters.sessionLength) return false;
  }

  if (filters.carClass) {
    const carClasses = getCarClasses(replay);
    if (!carClasses.includes(filters.carClass)) return false;
  }

  if (filters.fieldSize) {
    const size = getFieldSize(replay);
    const category = getFieldSizeCategory(size);
    if (category !== filters.fieldSize) return false;
  }

  if (filters.multiSingleClass) {
    const carClasses = getSessionCarClasses(replay);
    const isMultiClass = carClasses.length > 1;
    const isMatch =
      (filters.multiSingleClass === 'multi' && isMultiClass) ||
      (filters.multiSingleClass === 'single' && !isMultiClass);

    if (!isMatch) return false;
  }

  if (filters.incidentCount) {
    const severity = getIncidentSeverity(replay);
    if (severity !== filters.incidentCount) return false;
  }

  return true;
};

const sortReplays = (
  replayGroups: LMUReplay[][],
  sortBy: DashboardSortByOptions,
  sortDirection: 'asc' | 'desc',
): LMUReplay[][] => {
  return replayGroups.sort((groupA, groupB) => {
    if (sortBy === 'track') {
      const trackA = groupA?.[0]?.metadata.sceneDesc || '';
      const trackB = groupB?.[0]?.metadata.sceneDesc || '';

      if (trackA < trackB) return sortDirection === 'asc' ? -1 : 1;
      if (trackA > trackB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    }

    if (sortBy === 'incidents') {
      const incidentsA = getTotalSessionIncidents(groupA?.[0]) || 0;
      const incidentsB = getTotalSessionIncidents(groupB?.[0]) || 0;
      return sortDirection === 'asc'
        ? incidentsA - incidentsB
        : incidentsB - incidentsA;
    }

    const timestampA = Number(groupA?.[0]?.timestamp) || 0;
    const timestampB = Number(groupB?.[0]?.timestamp) || 0;

    return sortDirection === 'asc'
      ? timestampA - timestampB
      : timestampB - timestampA;
  });
};

export const useDashboardReplays = () => {
  const { isConnected, replays, requestReplays } = useApi();

  const [hasCalledForReplays, setHasCalledForReplays] = useState(false);
  const [hasReplaysResponded, setHasReplaysResponded] = useState(false);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<DashboardSortByOptions>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  useEffect(() => {
    if (replays && !hasReplaysResponded) {
      setHasReplaysResponded(true);
    }
  }, [replays, hasReplaysResponded]);

  useEffect(() => {
    if (!isConnected || hasCalledForReplays) {
      return;
    }

    setHasCalledForReplays(true);
    requestReplays();
  }, [isConnected, hasCalledForReplays, requestReplays]);

  const replayGroups = useMemo(() => {
    if (!replays?.data) {
      return [];
    }

    const filteredReplays = replays.data.filter((replay) =>
      matchesFilters(replay, filters),
    );

    const groupedReplays = Object.groupBy(
      filteredReplays,
      (replay: LMUReplay) => replay.timestamp,
    );

    const groupsArray = Object.values(groupedReplays).filter(
      (group): group is LMUReplay[] => group !== undefined,
    );

    return sortReplays(groupsArray, sortBy, sortDirection);
  }, [replays, filters, sortBy, sortDirection]);

  const totalReplayCount = replays?.data?.length ?? 0;

  const totalSessionCount = useMemo(() => {
    if (!replays?.data) {
      return 0;
    }

    const groupedReplays = Object.groupBy(
      replays.data,
      (replay: LMUReplay) => replay.timestamp,
    );

    return Object.values(groupedReplays).filter(
      (group): group is LMUReplay[] => group !== undefined,
    ).length;
  }, [replays]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(replayGroups.length / REPLAYS_PER_PAGE)),
    [replayGroups.length],
  );

  const filteredReplayCount = useMemo(
    () => replayGroups.reduce((count, group) => count + group.length, 0),
    [replayGroups],
  );

  const hasActiveFilters = useMemo(() => {
    const [startDate, endDate] = filters.dateRange;

    return Boolean(
      startDate ||
        endDate ||
        filters.track ||
        filters.sessionType ||
        filters.sessionLength ||
        filters.carClass ||
        filters.fieldSize ||
        filters.multiSingleClass ||
        filters.incidentCount,
    );
  }, [filters]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const currentReplays = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    return replayGroups.slice(
      (safePage - 1) * REPLAYS_PER_PAGE,
      safePage * REPLAYS_PER_PAGE,
    );
  }, [replayGroups, page, totalPages]);

  const handleApplyFilters = useCallback((nextFilters: Filters) => {
    setFilters(nextFilters);
    setPage(1);
  }, []);

  const handleRefreshReplays = useCallback(() => {
    if (!isConnected) {
      console.warn('LMU API is currently unavailable. Cannot fetch replays.');
      return;
    }

    requestReplays();
  }, [isConnected, requestReplays]);

  return {
    replays,
    isConnected,
    hasReplaysResponded,
    page,
    totalPages,
    totalReplayCount,
    totalSessionCount,
    filteredReplayCount,
    hasActiveFilters,
    currentReplays,
    replayGroups,
    sortBy,
    sortDirection,
    filters,
    setPage,
    setSortBy,
    setSortDirection,
    handleApplyFilters,
    handleRefreshReplays,
  };
};
