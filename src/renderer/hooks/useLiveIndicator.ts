import { LiveIndicatorState, LiveSessionStatus } from '@types';

export interface LiveIndicator {
  state: LiveIndicatorState;
  label: string;
  detail?: string;
}

export const deriveLiveIndicator = ({
  isConnected,
  hasApiStatusResponse,
  liveSessionStatus,
}: {
  isConnected: boolean;
  hasApiStatusResponse: boolean;
  liveSessionStatus: LiveSessionStatus;
}): LiveIndicator => {
  if (liveSessionStatus.state === 'live') {
    const parts = [
      liveSessionStatus.trackName,
      liveSessionStatus.driverCount
        ? `${liveSessionStatus.driverCount} drivers`
        : undefined,
    ].filter(Boolean);

    return {
      state: 'live',
      label: 'Live session',
      detail: parts.length ? parts.join(' · ') : undefined,
    };
  }

  if (!hasApiStatusResponse) {
    return { state: 'unavailable', label: 'Checking for Le Mans Ultimate…' };
  }

  if (!isConnected) {
    return { state: 'unavailable', label: 'Le Mans Ultimate is not running' };
  }

  return {
    state: 'standby',
    label: 'Standby',
    detail:
      liveSessionStatus.detail ??
      'Le Mans Ultimate is running. No live session detected.',
  };
};
