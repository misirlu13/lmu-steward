import { useCallback, useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import { CareerAggregate, CareerFilters, CareerScanReport } from '@types';
import { sendMessage } from '../utils/postMessage';

interface CareerResponse {
  status?: string;
  message?: string;
  data?: {
    aggregate?: CareerAggregate;
    report?: CareerScanReport;
  };
}

export interface CareerSummaryState {
  aggregate: CareerAggregate | null;
  filters: CareerFilters;
  loading: boolean;
  scanning: boolean;
  error: string | null;
  setFilters: (filters: CareerFilters) => void;
  rescan: (options?: { rebuild?: boolean }) => void;
  claimIdentity: (name: string) => void;
  setSessionExcluded: (sessionKey: string, excluded: boolean) => void;
}

/**
 * The career aggregate, and the actions that change it.
 *
 * Filtering is a round trip rather than client-side work: the aggregate is one
 * implementation in the main process, and recomputing a few hundred records
 * there is faster than shipping them all to the renderer to be re-derived.
 *
 * A rescan is offered rather than run on mount — the replay sync already scans
 * on its own schedule, and re-reading the results directory every time the page
 * opens would be work for nothing on a library that has not changed.
 */
export const useCareerSummary = (): CareerSummaryState => {
  const [aggregate, setAggregate] = useState<CareerAggregate | null>(null);
  const [filters, setFiltersState] = useState<CareerFilters>({});
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Every action sends the current filters so the aggregate that comes back is
   * already scoped. Held in a ref because the IPC listeners are registered once
   * and would otherwise close over the filters as they were on mount.
   */
  const filtersRef = useRef<CareerFilters>({});
  filtersRef.current = filters;

  useEffect(() => {
    const handle =
      (settle: () => void) =>
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as CareerResponse;
        settle();

        if (response.status !== 'success' || !response.data?.aggregate) {
          setError(response.message ?? 'Unable to read career data.');
          return;
        }

        setError(null);
        setAggregate(response.data.aggregate);
      };

    const unsubscribes = [
      window.electron?.ipcRenderer.on(
        CONSTANTS.API.GET_CAREER_SUMMARY,
        handle(() => setLoading(false)),
      ),
      window.electron?.ipcRenderer.on(
        CONSTANTS.API.POST_CAREER_RESCAN,
        handle(() => setScanning(false)),
      ),
      window.electron?.ipcRenderer.on(
        CONSTANTS.API.POST_CAREER_CLAIM_IDENTITY,
        handle(() => setScanning(false)),
      ),
      window.electron?.ipcRenderer.on(
        CONSTANTS.API.POST_CAREER_EXCLUDE_SESSION,
        handle(() => setScanning(false)),
      ),
    ];

    sendMessage(CONSTANTS.API.GET_CAREER_SUMMARY, {});

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    };
  }, []);

  const setFilters = useCallback((next: CareerFilters) => {
    setFiltersState(next);
    sendMessage(CONSTANTS.API.GET_CAREER_SUMMARY, next);
  }, []);

  const rescan = useCallback((options?: { rebuild?: boolean }) => {
    setScanning(true);
    sendMessage(CONSTANTS.API.POST_CAREER_RESCAN, {
      rebuild: Boolean(options?.rebuild),
      filters: filtersRef.current,
    });
  }, []);

  const claimIdentity = useCallback((name: string) => {
    setScanning(true);
    sendMessage(CONSTANTS.API.POST_CAREER_CLAIM_IDENTITY, {
      name,
      filters: filtersRef.current,
    });
  }, []);

  const setSessionExcluded = useCallback(
    (sessionKey: string, excluded: boolean) => {
      sendMessage(CONSTANTS.API.POST_CAREER_EXCLUDE_SESSION, {
        sessionKey,
        excluded,
        filters: filtersRef.current,
      });
    },
    [],
  );

  return {
    aggregate,
    filters,
    loading,
    scanning,
    error,
    setFilters,
    rescan,
    claimIdentity,
    setSessionExcluded,
  };
};
