import dayjs from 'dayjs';
import { DEFAULT_FILTERS } from './dashboardFilters';
import {
  DEFAULT_SORT_BY,
  DEFAULT_SORT_DIRECTION,
  deserializeDashboardView,
  serializeDashboardView,
} from './dashboardViewPersistence';

describe('dashboardViewPersistence', () => {
  describe('serializeDashboardView', () => {
    it('stores dates as ISO strings truncated to the start of the day', () => {
      const persisted = serializeDashboardView({
        filters: {
          ...DEFAULT_FILTERS,
          dateRange: [
            dayjs('2026-03-04T18:45:00'),
            dayjs('2026-03-09T02:15:00'),
          ],
        },
        sortBy: 'track',
        sortDirection: 'asc',
      });

      const [start, end] = persisted.filters.dateRange;

      expect(
        dayjs(start as string).isSame(dayjs('2026-03-04').startOf('day')),
      ).toBe(true);
      expect(
        dayjs(end as string).isSame(dayjs('2026-03-09').startOf('day')),
      ).toBe(true);
      expect(persisted.sortBy).toBe('track');
      expect(persisted.sortDirection).toBe('asc');
    });

    it('stores null for absent and invalid dates', () => {
      const persisted = serializeDashboardView({
        filters: {
          ...DEFAULT_FILTERS,
          dateRange: [dayjs('not-a-real-date'), null],
        },
        sortBy: DEFAULT_SORT_BY,
        sortDirection: DEFAULT_SORT_DIRECTION,
      });

      expect(persisted.filters.dateRange).toEqual([null, null]);
    });
  });

  describe('deserializeDashboardView', () => {
    it('round-trips a fully populated view', () => {
      const original = {
        filters: {
          ...DEFAULT_FILTERS,
          dateRange: [dayjs('2026-03-04'), dayjs('2026-03-09')] as [
            dayjs.Dayjs,
            dayjs.Dayjs,
          ],
          track: 'PORTIMAOELMS',
          sessionType: 'RACE',
          sessionLength: 'medium',
          gameType: 'multiplayer' as const,
          carClass: 'HYPERCAR',
          fieldSize: 'large',
          multiSingleClass: 'multi',
          incidentCount: 'high',
        },
        sortBy: 'incidents' as const,
        sortDirection: 'asc' as const,
      };

      const restored = deserializeDashboardView(
        serializeDashboardView(original),
      );

      expect(restored).not.toBeNull();
      expect(restored?.filters.track).toBe('PORTIMAOELMS');
      expect(restored?.filters.sessionType).toBe('RACE');
      expect(restored?.filters.sessionLength).toBe('medium');
      expect(restored?.filters.gameType).toBe('multiplayer');
      expect(restored?.filters.carClass).toBe('HYPERCAR');
      expect(restored?.filters.fieldSize).toBe('large');
      expect(restored?.filters.multiSingleClass).toBe('multi');
      expect(restored?.filters.incidentCount).toBe('high');
      expect(restored?.sortBy).toBe('incidents');
      expect(restored?.sortDirection).toBe('asc');

      const [start, end] = restored?.filters.dateRange ?? [null, null];
      expect(start?.isSame(dayjs('2026-03-04').startOf('day'))).toBe(true);
      expect(end?.isSame(dayjs('2026-03-09').startOf('day'))).toBe(true);
    });

    it('returns Dayjs instances rather than raw strings', () => {
      const restored = deserializeDashboardView({
        filters: {
          ...DEFAULT_FILTERS,
          dateRange: ['2026-03-04T00:00:00.000Z', null],
        },
        sortBy: 'date',
        sortDirection: 'desc',
      });

      expect(dayjs.isDayjs(restored?.filters.dateRange[0])).toBe(true);
      expect(restored?.filters.dateRange[1]).toBeNull();
    });

    it('drops filter values that are no longer valid options', () => {
      const restored = deserializeDashboardView({
        filters: {
          dateRange: ['nonsense', 42],
          track: 'A_TRACK_REMOVED_IN_A_LATER_RELEASE',
          sessionType: 'WARMUP',
          sessionLength: 'epic',
          gameType: 'hotlap',
          carClass: 'GT4',
          fieldSize: 'enormous',
          multiSingleClass: 'triple',
          incidentCount: 'catastrophic',
        },
        sortBy: 'date',
        sortDirection: 'desc',
      });

      expect(restored?.filters).toEqual(DEFAULT_FILTERS);
    });

    it('falls back to default sorting when stored sort values are unknown', () => {
      const restored = deserializeDashboardView({
        filters: {},
        sortBy: 'penalties',
        sortDirection: 'sideways',
      });

      expect(restored?.sortBy).toBe(DEFAULT_SORT_BY);
      expect(restored?.sortDirection).toBe(DEFAULT_SORT_DIRECTION);
    });

    it('returns null when nothing usable is stored', () => {
      expect(deserializeDashboardView(null)).toBeNull();
      expect(deserializeDashboardView(undefined)).toBeNull();
      expect(deserializeDashboardView('filters')).toBeNull();
      expect(deserializeDashboardView([])).toBeNull();
    });

    it('tolerates a stored object with no filters key', () => {
      const restored = deserializeDashboardView({ sortBy: 'track' });

      expect(restored?.filters).toEqual(DEFAULT_FILTERS);
      expect(restored?.sortBy).toBe('track');
    });
  });
});
