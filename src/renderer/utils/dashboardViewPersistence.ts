import dayjs, { Dayjs } from 'dayjs';
import { CONSTANTS } from '@constants';
import {
  DashboardSortByOptions,
  DashboardSortDirection,
  PersistedDashboardView,
  ReplayGameTypeFilter,
} from '@types';
import {
  DEFAULT_FILTERS,
  Filters,
  fieldSizeOptions,
  gameTypeOptions,
  incidentCountOptions,
  multiSingleClassOptions,
  sessionLengthOptions,
  sessionTypeOptions,
} from './dashboardFilters';

export interface DashboardViewState {
  filters: Filters;
  sortBy: DashboardSortByOptions;
  sortDirection: DashboardSortDirection;
}

export const DEFAULT_SORT_BY: DashboardSortByOptions = 'date';
export const DEFAULT_SORT_DIRECTION: DashboardSortDirection = 'desc';

const SORT_BY_VALUES: DashboardSortByOptions[] = ['date', 'track', 'incidents'];
const SORT_DIRECTION_VALUES: DashboardSortDirection[] = ['asc', 'desc'];

const toValueSet = (options: Array<{ value: string }>): Set<string> =>
  new Set(options.map((option) => option.value));

const SESSION_TYPE_VALUES = toValueSet(sessionTypeOptions);
const SESSION_LENGTH_VALUES = toValueSet(sessionLengthOptions);
const FIELD_SIZE_VALUES = toValueSet(fieldSizeOptions);
const MULTI_SINGLE_CLASS_VALUES = toValueSet(multiSingleClassOptions);
const GAME_TYPE_VALUES = toValueSet(gameTypeOptions);
const INCIDENT_COUNT_VALUES = toValueSet(incidentCountOptions);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Coerces a stored value back to a known filter option. Values that are no
 * longer valid (for example a track removed from a later release) fall back to
 * the "all" selection rather than silently filtering every replay out.
 */
const sanitizeOption = (value: unknown, allowedValues: Set<string>): string => {
  const normalized = typeof value === 'string' ? value : '';
  return allowedValues.has(normalized) ? normalized : '';
};

const sanitizeTrack = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value : '';
  return Object.prototype.hasOwnProperty.call(
    CONSTANTS.TRACK_META_DATA,
    normalized,
  )
    ? normalized
    : '';
};

const sanitizeCarClass = (value: unknown): string => {
  const normalized = typeof value === 'string' ? value : '';
  return Object.prototype.hasOwnProperty.call(
    CONSTANTS.CAR_CLASS_MAPPINGS,
    normalized,
  )
    ? normalized
    : '';
};

const serializeDate = (value: Dayjs | null): string | null => {
  if (!value || !value.isValid()) {
    return null;
  }

  return value.startOf('day').toISOString();
};

const deserializeDate = (value: unknown): Dayjs | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.startOf('day') : null;
};

export const serializeDashboardView = ({
  filters,
  sortBy,
  sortDirection,
}: DashboardViewState): PersistedDashboardView => {
  const [startDate, endDate] = filters.dateRange;

  return {
    filters: {
      dateRange: [serializeDate(startDate), serializeDate(endDate)],
      track: filters.track,
      sessionType: filters.sessionType,
      sessionLength: filters.sessionLength,
      gameType: filters.gameType,
      carClass: filters.carClass,
      fieldSize: filters.fieldSize,
      multiSingleClass: filters.multiSingleClass,
      incidentCount: filters.incidentCount,
    },
    sortBy,
    sortDirection,
  };
};

/**
 * Rebuilds dashboard state from persisted storage. Returns null when nothing
 * usable was stored so callers can keep their defaults.
 */
export const deserializeDashboardView = (
  value: unknown,
): DashboardViewState | null => {
  if (!isRecord(value)) {
    return null;
  }

  const storedFilters = isRecord(value.filters) ? value.filters : {};
  const storedDateRange = Array.isArray(storedFilters.dateRange)
    ? storedFilters.dateRange
    : [];

  const gameType = sanitizeOption(
    storedFilters.gameType,
    GAME_TYPE_VALUES,
  ) as ReplayGameTypeFilter;

  const sortBy = SORT_BY_VALUES.includes(value.sortBy as DashboardSortByOptions)
    ? (value.sortBy as DashboardSortByOptions)
    : DEFAULT_SORT_BY;

  const sortDirection = SORT_DIRECTION_VALUES.includes(
    value.sortDirection as DashboardSortDirection,
  )
    ? (value.sortDirection as DashboardSortDirection)
    : DEFAULT_SORT_DIRECTION;

  return {
    filters: {
      ...DEFAULT_FILTERS,
      dateRange: [
        deserializeDate(storedDateRange[0]),
        deserializeDate(storedDateRange[1]),
      ],
      track: sanitizeTrack(storedFilters.track),
      sessionType: sanitizeOption(
        storedFilters.sessionType,
        SESSION_TYPE_VALUES,
      ),
      sessionLength: sanitizeOption(
        storedFilters.sessionLength,
        SESSION_LENGTH_VALUES,
      ),
      gameType,
      carClass: sanitizeCarClass(storedFilters.carClass),
      fieldSize: sanitizeOption(storedFilters.fieldSize, FIELD_SIZE_VALUES),
      multiSingleClass: sanitizeOption(
        storedFilters.multiSingleClass,
        MULTI_SINGLE_CLASS_VALUES,
      ),
      incidentCount: sanitizeOption(
        storedFilters.incidentCount,
        INCIDENT_COUNT_VALUES,
      ),
    },
    sortBy,
    sortDirection,
  };
};
