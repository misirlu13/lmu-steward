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
      importedReplays: [],
      requestReplays,
      requestImportedReplays: jest.fn(),
      deleteImportedReplays: jest.fn(),
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

  describe('archived view', () => {
    const buildReplay = (hash: string, archived: boolean) => ({
      hash,
      archived,
      timestamp: hash === 'archived-hash' ? 2000 : 1000,
      metadata: { session: 'RACE', sceneDesc: 'SEBRINGWEC' },
      logData: {},
    });

    const setupWithReplays = () =>
      setupApi({
        replays: {
          status: 'success',
          data: [
            buildReplay('active-hash', false),
            buildReplay('archived-hash', true),
          ],
        },
        archiveReplays: jest.fn(),
        restoreReplays: jest.fn(),
        setArchiveNote: jest.fn(),
      });

    it('shows only active replays by default', () => {
      setupWithReplays();

      const { result } = renderHook(() => useDashboardReplays());

      expect(result.current.dashboardView).toBe('active');
      expect(result.current.filteredReplayHashes).toEqual(['active-hash']);
      expect(result.current.archivedCount).toBe(1);
      expect(result.current.totalReplayCount).toBe(1);
    });

    it('swaps to archived replays without issuing a replay request', () => {
      setupWithReplays();

      const { result } = renderHook(() => useDashboardReplays());
      const requestCountBeforeToggle = requestReplays.mock.calls.length;

      act(() => {
        result.current.handleChangeDashboardView('archived');
      });

      expect(result.current.filteredReplayHashes).toEqual(['archived-hash']);
      expect(result.current.totalReplayCount).toBe(1);
      // Switching views must never trigger a sync — the data is already here.
      expect(requestReplays).toHaveBeenCalledTimes(requestCountBeforeToggle);
    });

    it('resets to the first page when the view changes', () => {
      setupWithReplays();

      const { result } = renderHook(() => useDashboardReplays());

      act(() => {
        result.current.setPage(2);
      });

      act(() => {
        result.current.handleChangeDashboardView('archived');
      });

      expect(result.current.page).toBe(1);
    });
  });

  describe('imported view', () => {
    const importedRecord = {
      hash: 'imported-hash',
      replayName: 'Autodromo Nazionale Monza R1 2',
      sceneDesc: 'MONZAWEC',
      session: 'RACE',
      timestamp: 1784398360,
      vcrFileName: 'Autodromo Nazionale Monza R1 2.Vcr',
      vcrPath: 'C:/lmu/Replays/Autodromo Nazionale Monza R1 2.Vcr',
      size: 1024,
      logFileName: 'event-two-race.xml',
      logPath: 'C:/lmu/Log/Results/event-two-race.xml',
      vcrFingerprint: 'aaa',
      logFingerprint: 'bbb',
      importedAt: 5,
      logData: {},
      origin: {
        trackFolder: 'Monza_2023',
        trackVersion: '1.27',
        trackContentHash: 'abc',
        installPath: 'E:/LMU',
      },
      match: { method: 'roster', confidence: 0.84, rosterOverlap: null },
    };

    const setupWithImports = (deleteImportedReplays = jest.fn()) => {
      setupApi({
        replays: {
          status: 'success',
          data: [
            {
              hash: 'own-hash',
              archived: false,
              timestamp: 1000,
              metadata: { session: 'RACE', sceneDesc: 'SEBRINGWEC' },
              logData: {},
            },
          ],
        },
        importedReplays: [importedRecord],
        deleteImportedReplays,
      });

      return deleteImportedReplays;
    };

    /**
     * The three views are mutually exclusive, which is what makes "imported
     * replays cannot be archived" structural rather than a disabled button.
     */
    it('keeps imported replays out of the active and archived views', () => {
      setupWithImports();

      const { result } = renderHook(() => useDashboardReplays());

      expect(result.current.filteredReplayHashes).toEqual(['own-hash']);
      expect(result.current.importedCount).toBe(1);

      act(() => {
        result.current.handleChangeDashboardView('archived');
      });

      expect(result.current.filteredReplayHashes).toEqual([]);
    });

    it('lists imported replays in their own view', () => {
      setupWithImports();

      const { result } = renderHook(() => useDashboardReplays());

      act(() => {
        result.current.handleChangeDashboardView('imported');
      });

      expect(result.current.filteredReplayHashes).toEqual(['imported-hash']);
      expect(result.current.totalReplayCount).toBe(1);
    });

    /**
     * Imported replays come from their own store, so the list must not wait on
     * a replay sync that may never have run.
     */
    it('lists imported replays with no replay cache response at all', () => {
      setupApi({
        replays: null,
        importedReplays: [importedRecord],
        deleteImportedReplays: jest.fn(),
      });

      const { result } = renderHook(() => useDashboardReplays());

      act(() => {
        result.current.handleChangeDashboardView('imported');
      });

      expect(result.current.filteredReplayHashes).toEqual(['imported-hash']);
    });

    it('deletes by hash, never by path', () => {
      const deleteImportedReplays = setupWithImports();

      const { result } = renderHook(() => useDashboardReplays());

      act(() => {
        result.current.handleDeleteImportedReplays(['imported-hash']);
      });

      expect(deleteImportedReplays).toHaveBeenCalledWith(['imported-hash']);
    });
  });
});
