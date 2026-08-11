import React from 'react';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CONSTANTS } from '@constants';
import { LiveDataForReplay } from '@types';
import { useLiveDataForReplay } from './useLiveDataForReplay';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';

jest.mock('../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

let subscribers: Set<(payload: unknown) => void>;

const emit = (payload: unknown) =>
  act(() => {
    subscribers.forEach((callback) => callback(payload));
  });

const dataFor = (sessionKey: string) =>
  ({ sessionKey, incidents: [], drivers: [] }) as unknown as LiveDataForReplay;

const Probe = ({ replayHash }: { replayHash?: string }) => {
  const liveData = useLiveDataForReplay(replayHash);
  return <div data-testid="session">{liveData?.sessionKey ?? 'none'}</div>;
};

const shown = () => screen.getByTestId('session').textContent;

beforeEach(() => {
  jest.clearAllMocks();
  subscribers = new Set();
  useApiMock.mockReturnValue({
    experimentalFeaturesEnabled: true,
    subscribeToApiChannel: (
      _channel: string,
      callback: (payload: unknown) => void,
    ) => {
      subscribers.add(callback);
      return () => subscribers.delete(callback);
    },
  } as unknown as ReturnType<typeof useApi>);
});

describe('the captured session behind a replay', () => {
  it('should ask main for the replay on screen', () => {
    render(<Probe replayHash="hash-a" />);

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY,
      { replayHash: 'hash-a' },
    );
  });

  it('should show the capture the reply carries', () => {
    render(<Probe replayHash="hash-a" />);

    emit({ status: 'success', replayHash: 'hash-a', data: dataFor('live|a') });

    expect(shown()).toBe('live|a');
  });

  /*
    Navigating away and back re-asks, and the previous replay's reply can still
    be in flight. Landing its `null` on this replay reads on screen as the
    capture having gone missing — which is exactly the "live data was there,
    then it wasn't" this guard exists for.
  */
  it('should ignore an answer about a replay it has moved off', () => {
    render(<Probe replayHash="hash-b" />);

    emit({ status: 'success', replayHash: 'hash-b', data: dataFor('live|b') });
    expect(shown()).toBe('live|b');

    // The old request, arriving late, with nothing to say about hash-a.
    emit({ status: 'success', replayHash: 'hash-a', data: null });

    expect(shown()).toBe('live|b');
  });

  it('should ignore a late error about another replay too', () => {
    render(<Probe replayHash="hash-b" />);
    emit({ status: 'success', replayHash: 'hash-b', data: dataFor('live|b') });

    emit({ status: 'error', replayHash: 'hash-a', message: 'gone' });

    expect(shown()).toBe('live|b');
  });

  // An answer that cannot identify itself is no worse than the unconditional
  // behaviour this replaced, so it is still taken.
  it('should still accept a reply that names no replay', () => {
    render(<Probe replayHash="hash-a" />);

    emit({ status: 'success', data: dataFor('live|a') });

    expect(shown()).toBe('live|a');
  });

  /*
    Cleared before asking, so a replay with capture followed by one without
    cannot show the previous replay's evidence against this one's incidents.
  */
  it('should drop what it held when the replay changes', () => {
    const view = render(<Probe replayHash="hash-a" />);
    emit({ status: 'success', replayHash: 'hash-a', data: dataFor('live|a') });

    view.rerender(<Probe replayHash="hash-b" />);

    expect(shown()).toBe('none');
  });
});
