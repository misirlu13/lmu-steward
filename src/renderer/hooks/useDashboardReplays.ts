import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import {
  DashboardSortByOptions,
  DashboardSortDirection,
  GetReplaysRequest,
  LMUReplay,
  PersistedDashboardView,
} from '@types';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';
import {
  getSessionCarClasses,
  getTotalSessionIncidents,
} from '../utils/sessionUtils';
import { DEFAULT_FILTERS, Filters } from '../utils/dashboardFilters';
import {
  DEFAULT_SORT_BY,
  DEFAULT_SORT_DIRECTION,
  deserializeDashboardView,
  serializeDashboardView,
} from '../utils/dashboardViewPersistence';

export type { DashboardSortByOptions };

const REPLAYS_PER_PAGE = 5;

/**
 * Filters and sort can change rapidly while the user tweaks the menu, so writes
 * are coalesced rather than issued on every keystroke or toggle.
 */
const PERSIST_DEBOUNCE_MS = 500;

interface SessionDriverLike {
  CarClass?: string;
}

const getSessionLength = (replay: LMUReplay): number | null => {
  const sessionType = replay.metadata.session;
  const { logData } = replay;

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
  const { logData } = replay;

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

const getFieldSize = (replay: LMUReplay): number =>
  getSessionDrivers(replay).length;

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

const getGameType = (
  replay: LMUReplay,
): NonNullable<GetReplaysRequest['gameType']> =>
  replay.multiplayer ? 'multiplayer' : 'race-weekend';

const getReplayRequest = (filters: Filters): GetReplaysRequest | undefined => {
  if (!filters.gameType) {
    return undefined;
  }

  return { gameType: filters.gameType };
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

  if (filters.gameType && getGameType(replay) !== filters.gameType) {
    return false;
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
  sortDirection: DashboardSortDirection,
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
  const {
    isConnected,
    hasUserSettingsResponse,
    persistDashboardFiltersEnabled,
    persistedDashboardView,
    replays,
    requestReplays,
  } = useApi();

  const [hasCalledForReplays, setHasCalledForReplays] = useState(false);
  const [hasReplaysResponded, setHasReplaysResponded] = useState(false);
  const [hasHydratedView, setHasHydratedView] = useState(false);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<DashboardSortByOptions>(DEFAULT_SORT_BY);
  const [sortDirection, setSortDirection] = useState<DashboardSortDirection>(
    DEFAULT_SORT_DIRECTION,
  );
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const hasHydratedViewRef = useRef(false);
  const lastPersistedViewRef = useRef('');
  const pendingViewRef = useRef<PersistedDashboardView | null>(null);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The dashboard unmounts whenever the user opens a replay, so a debounced
  // write still in flight is flushed rather than dropped.
  useEffect(
    () => () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }

      if (pendingViewRef.current) {
        sendMessage(CONSTANTS.API.POST_DASHBOARD_VIEW, pendingViewRef.current);
        pendingViewRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (replays && !hasReplaysResponded) {
      setHasReplaysResponded(true);
    }
  }, [replays, hasReplaysResponded]);

  // Restores persisted filters and sort exactly once per mount. Running again
  // on later settings pushes would stomp on filters the user has since changed.
  useEffect(() => {
    if (hasHydratedViewRef.current || !hasUserSettingsResponse) {
      return;
    }

    hasHydratedViewRef.current = true;

    const restoredView = persistDashboardFiltersEnabled
      ? deserializeDashboardView(persistedDashboardView)
      : null;

    if (restoredView) {
      setFilters(restoredView.filters);
      setSortBy(restoredView.sortBy);
      setSortDirection(restoredView.sortDirection);
    }

    lastPersistedViewRef.current = JSON.stringify(
      serializeDashboardView(
        restoredView ?? {
          filters: DEFAULT_FILTERS,
          sortBy: DEFAULT_SORT_BY,
          sortDirection: DEFAULT_SORT_DIRECTION,
        },
      ),
    );
    setHasHydratedView(true);
  }, [
    hasUserSettingsResponse,
    persistDashboardFiltersEnabled,
    persistedDashboardView,
  ]);

  useEffect(() => {
    if (!hasHydratedView || !persistDashboardFiltersEnabled) {
      return undefined;
    }

    const nextView = serializeDashboardView({ filters, sortBy, sortDirection });
    const serializedView = JSON.stringify(nextView);

    if (serializedView === lastPersistedViewRef.current) {
      return undefined;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    pendingViewRef.current = nextView;
    persistTimeoutRef.current = setTimeout(() => {
      lastPersistedViewRef.current = serializedView;
      pendingViewRef.current = null;
      sendMessage(CONSTANTS.API.POST_DASHBOARD_VIEW, nextView);
    }, PERSIST_DEBOUNCE_MS);

    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
      }
    };
  }, [
    filters,
    sortBy,
    sortDirection,
    hasHydratedView,
    persistDashboardFiltersEnabled,
  ]);

  // Gated on hydration so the initial fetch carries the restored gameType,
  // which is resolved in the main process rather than client-side.
  useEffect(() => {
    if (!isConnected || hasCalledForReplays || !hasHydratedView) {
      return;
    }

    setHasCalledForReplays(true);
    requestReplays(getReplayRequest(filters));
  }, [
    isConnected,
    hasCalledForReplays,
    hasHydratedView,
    requestReplays,
    filters,
  ]);

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
        filters.gameType ||
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

  const handleApplyFilters = useCallback(
    (nextFilters: Filters) => {
      setFilters(nextFilters);
      setPage(1);

      if (isConnected) {
        requestReplays(getReplayRequest(nextFilters));
      }
    },
    [isConnected, requestReplays],
  );

  const handleRefreshReplays = useCallback(() => {
    if (!isConnected) {
      console.warn('LMU API is currently unavailable. Cannot fetch replays.');
      return;
    }

    requestReplays(getReplayRequest(filters));
  }, [filters, isConnected, requestReplays]);

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
