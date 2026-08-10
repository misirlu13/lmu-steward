import { useCallback, useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import { LiveIncidentContext, LiveIncidentContextRecord } from '@types';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';

/**
 * The captured trace for one incident, fetched when it is actually looked at.
 *
 * Traces are the bulky half of live capture — roughly 100 KB each, and a long
 * race holds hundreds — so they are deliberately absent from the per-replay
 * payload and pulled one at a time as a steward opens each dossier.
 *
 * Results are kept for the life of the view. Stepping back and forth through a
 * handful of incidents while adjudicating is the normal way this gets used, and
 * re-fetching the same 100 KB each time would make that feel broken.
 */
export const useLiveIncidentContext = (incidentId: string | undefined) => {
  const { subscribeToApiChannel } = useApi();
  const [context, setContext] = useState<LiveIncidentContext | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  /*
    A ref, not state: the cache must not itself trigger a render, and the effect
    below must not re-run when it fills. Requested ids are tracked separately so
    a second render while a fetch is in flight does not ask again.
  */
  const cache = useRef(new Map<string, LiveIncidentContext | null>());
  const requested = useRef(new Set<string>());
  const wanted = useRef<string | undefined>(undefined);

  wanted.current = incidentId;

  const applyContext = useCallback((payload: unknown) => {
    const response = payload as {
      status?: string;
      data?: LiveIncidentContextRecord | null;
    };

    const record = response?.status === 'success' ? response.data : null;
    const forIncident = record?.incidentId;

    if (forIncident) {
      cache.current.set(forIncident, record?.context ?? null);
    }

    /*
      Only the incident still on screen updates the view. Traces arrive
      asynchronously and a steward moves through a list faster than a 100 KB
      read completes, so a late reply must not overwrite the one being read.
    */
    if (forIncident && forIncident === wanted.current) {
      setContext(record?.context ?? undefined);
      setIsLoading(false);
    } else if (!forIncident && !wanted.current) {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToApiChannel(
      CONSTANTS.API.GET_LIVE_INCIDENT_CONTEXT,
      applyContext,
    );

    return unsubscribe;
  }, [applyContext, subscribeToApiChannel]);

  useEffect(() => {
    if (!incidentId) {
      setContext(undefined);
      setIsLoading(false);
      return;
    }

    if (cache.current.has(incidentId)) {
      setContext(cache.current.get(incidentId) ?? undefined);
      setIsLoading(false);
      return;
    }

    setContext(undefined);
    setIsLoading(true);

    if (!requested.current.has(incidentId)) {
      requested.current.add(incidentId);
      sendMessage(CONSTANTS.API.GET_LIVE_INCIDENT_CONTEXT, incidentId);
    }
  }, [incidentId]);

  return { context, isLoading };
};
