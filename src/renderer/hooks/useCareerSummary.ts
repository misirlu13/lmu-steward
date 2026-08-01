import { useCallback, useEffect, useState } from 'react';
import { CONSTANTS } from '@constants';
import { CareerAggregate, CareerScanReport } from '@types';
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
  loading: boolean;
  scanning: boolean;
  error: string | null;
  rescan: (options?: { rebuild?: boolean }) => void;
  claimIdentity: (name: string) => void;
}

/**
 * The career aggregate, and the two actions that change it.
 *
 * A rescan is offered rather than run on mount: the replay sync already scans
 * on its own schedule, and re-reading the results directory every time the page
 * is opened would be work for nothing on a library that has not changed.
 */
export const useCareerSummary = (): CareerSummaryState => {
  const [aggregate, setAggregate] = useState<CareerAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    sendMessage(CONSTANTS.API.GET_CAREER_SUMMARY);

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    };
  }, []);

  const rescan = useCallback((options?: { rebuild?: boolean }) => {
    setScanning(true);
    sendMessage(CONSTANTS.API.POST_CAREER_RESCAN, {
      rebuild: Boolean(options?.rebuild),
    });
  }, []);

  const claimIdentity = useCallback((name: string) => {
    setScanning(true);
    sendMessage(CONSTANTS.API.POST_CAREER_CLAIM_IDENTITY, { name });
  }, []);

  return { aggregate, loading, scanning, error, rescan, claimIdentity };
};
