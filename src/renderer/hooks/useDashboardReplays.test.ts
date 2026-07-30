import { act, renderHook } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { PersistedDashboardView } from '@types';
import { useDashboardReplays } from './useDashboardReplays';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';

jest.mock('../providers/ApiContext', () => ({
  useApi: jest.fn(),
}));

jest.mock('../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

const mockedUseApi = useApi as jest.MockedFunction<typeof useApi>;
const mockedSendMessage = sendMessage as jest.MockedFunction<
  typeof sendMessage
>;

const STORED_VIEW: PersistedDashboardView = {
  filters: {
    dateRange: [null, null],
    track: 'PORTIMAOELMS',
    sessionType: 'RACE',
    sessionLength: '',
    gameType: 'multiplayer',
    carClass: 'HYPERCAR',
    fieldSize: '',
    multiSingleClass: '',
    incidentCount: '',
  },
  sortBy: 'incidents',
  sortDirection: 'asc',
};

describe('useDashboardReplays', () => {
  let requestReplays: jest.Mock;

  const setupApi = (overrides: Record<string, unknown> = {}) => {
    requestReplays = jest.fn();

    mockedUseApi.mockReturnValue({
      isConnected: true,
      hasUserSettingsResponse: true,
      persistDashboardFiltersEnabled: false,
      persistedDashboardView: null,
      replays: null,
      requestReplays,
      ...overrides,
    } as unknown as ReturnType<typeof useApi>);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('hydration', () => {
    it('holds the initial replay request until user settings respond', () => {
      setupApi({ hasUserSettingsResponse: false });

      const { rerender } = renderHook(() => useDashboardReplays());

      expect(requestReplays).not.toHaveBeenCalled();

      setupApi({ hasUserSettingsResponse: true });
      rerender();

      expect(requestReplays).toHaveBeenCalledTimes(1);
    });

    it('restores stored filters and sort and uses them for the first request', () => {
      setupApi({
        persistDashboardFiltersEnabled: true,
        persistedDashboardView: STORED_VIEW,
      });

      const { result } = renderHook(() => useDashboardReplays());

      expect(result.current.filters.track).toBe('PORTIMAOELMS');
      expect(result.current.filters.sessionType).toBe('RACE');
      expect(result.current.filters.carClass).toBe('HYPERCAR');
      expect(result.current.sortBy).toBe('incidents');
      expect(result.current.sortDirection).toBe('asc');
      expect(result.current.hasActiveFilters).toBe(true);

      // gameType is resolved in the main process, so the very first fetch has
      // to carry the restored value rather than the default.
      expect(requestReplays).toHaveBeenCalledTimes(1);
      expect(requestReplays).toHaveBeenCalledWith({ gameType: 'multiplayer' });
    });

    it('ignores a stored view while the setting is disabled', () => {
      setupApi({
        persistDashboardFiltersEnabled: false,
        persistedDashboardView: STORED_VIEW,
      });

      const { result } = renderHook(() => useDashboardReplays());

      expect(result.current.filters.track).toBe('');
      expect(result.current.sortBy).toBe('date');
      expect(result.current.sortDirection).toBe('desc');
      expect(requestReplays).toHaveBeenCalledWith(undefined);
    });

    it('does not write anything back while restoring', () => {
      setupApi({
        persistDashboardFiltersEnabled: true,
        persistedDashboardView: STORED_VIEW,
      });

      renderHook(() => useDashboardReplays());

      act(() => {
        jest.runAllTimers();
      });

      expect(mockedSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('persistence', () => {
    it('saves applied filters once the debounce elapses', () => {
      setupApi({ persistDashboardFiltersEnabled: true });

      const { result } = renderHook(() => useDashboardReplays());

      act(() => {
        result.current.handleApplyFilters({
          ...result.current.filters,
          track: 'PORTIMAOELMS',
        });
      });

      expect(mockedSendMessage).not.toHaveBeenCalled();

      act(() => {
        jest.runAllTimers();
      });

      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      const [channel, payload] = mockedSendMessage.mock.calls[0];
      expect(channel).toBe(CONSTANTS.API.POST_DASHBOARD_VIEW);
      expect((payload as PersistedDashboardView).filters.track).toBe(
        'PORTIMAOELMS',
      );
    });

    it('saves sort changes as well as filter changes', () => {
      setupApi({ persistDashboardFiltersEnabled: true });

      const { result } = renderHook(() => useDashboardReplays());

      act(() => {
        result.current.setSortBy('track');
      });

      act(() => {
        result.current.setSortDirection('asc');
      });

      act(() => {
        jest.runAllTimers();
      });

      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      const [, payload] = mockedSendMessage.mock.calls[0];
      expect(payload).toMatchObject({ sortBy: 'track', sortDirection: 'asc' });
    });

    it('never writes while the setting is disabled', () => {
      setupApi({ persistDashboardFiltersEnabled: false });

      const { result } = renderHook(() => useDashboardReplays());

      act(() => {
        result.current.setSortBy('track');
      });

      act(() => {
        jest.runAllTimers();
      });

      expect(mockedSendMessage).not.toHaveBeenCalled();
    });

    it('flushes a pending write when the dashboard unmounts', () => {
      setupApi({ persistDashboardFiltersEnabled: true });

      const { result, unmount } = renderHook(() => useDashboardReplays());

      act(() => {
        result.current.setSortBy('track');
      });

      expect(mockedSendMessage).not.toHaveBeenCalled();

      unmount();

      expect(mockedSendMessage).toHaveBeenCalledTimes(1);
      const [channel, payload] = mockedSendMessage.mock.calls[0];
      expect(channel).toBe(CONSTANTS.API.POST_DASHBOARD_VIEW);
      expect(payload).toMatchObject({ sortBy: 'track' });
    });
  });
});
