import { act, renderHook } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { useLiveTrackMap } from './useLiveTrackMap';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';

jest.mock('../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

/** The subscriber the hook registers, so a test can hand it a reply. */
let reply: ((payload: unknown) => void) | undefined;
const unsubscribe = jest.fn();

/** Three points, so the geometry passes the "fewer than two is nothing" floor. */
const GEOMETRY = [
  { type: 0, x: 0, y: 0, z: 0 },
  { type: 0, x: 100, y: 0, z: 50 },
  { type: 0, x: 200, y: 0, z: 0 },
];

const trackMapRequests = () =>
  sendMessageMock.mock.calls.filter(
    ([channel]) => channel === CONSTANTS.API.GET_LIVE_TRACK_MAP,
  ).length;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  reply = undefined;
  useApiMock.mockReturnValue({
    subscribeToApiChannel: jest.fn((channel, callback) => {
      if (channel === CONSTANTS.API.GET_LIVE_TRACK_MAP) {
        reply = callback;
      }
      return unsubscribe;
    }),
  } as unknown as ReturnType<typeof useApi>);
});

afterEach(() => {
  jest.useRealTimers();
});

const answer = (payload: unknown) => act(() => reply?.(payload));

describe('useLiveTrackMap', () => {
  it('should ask for nothing at all when there is no session to draw', () => {
    const { result } = renderHook(() => useLiveTrackMap('Laguna Seca', false));

    expect(trackMapRequests()).toBe(0);
    expect(result.current.state).toBe('idle');
  });

  it('should hold the geometry once the game supplies it', () => {
    const { result } = renderHook(() => useLiveTrackMap('Laguna Seca', true));

    expect(result.current.state).toBe('waiting');
    answer({ status: 'success', data: GEOMETRY });

    expect(result.current.state).toBe('ready');
    expect(result.current.points).toHaveLength(3);
  });

  /*
    LMU ships the racing line and the pit lane in one array, told apart by
    `type`. Readiness is judged on the racing line alone — a map without one is
    nothing, while a map without pits is just a track with no pit geometry.
  */
  it('should separate the pit lane from the racing line', () => {
    const { result } = renderHook(() => useLiveTrackMap('Laguna Seca', true));

    answer({
      status: 'success',
      data: [
        ...GEOMETRY,
        { type: 1, x: 10, y: 0, z: 10 },
        { type: 1, x: 20, y: 0, z: 15 },
        // A garage-stall stub, which nothing draws.
        { type: 7, x: 30, y: 0, z: 20 },
      ],
    });

    expect(result.current.points).toHaveLength(3);
    expect(result.current.pitPoints).toHaveLength(2);
  });

  /*
    The spike confirmed the endpoint serves a live session, but only from one
    that was already running — nothing is known about what it returns while a
    session loads. An empty array is "not ready yet"; reading it as "this track
    has no map" would leave the panel permanently blank for a steward who opened
    the app a few seconds early.
  */
  it('should treat an empty answer as not ready yet and ask again', () => {
    const { result } = renderHook(() => useLiveTrackMap('Laguna Seca', true));

    answer({ status: 'success', data: [] });
    expect(result.current.state).toBe('waiting');

    act(() => jest.advanceTimersByTime(5000));
    expect(trackMapRequests()).toBe(2);

    answer({ status: 'success', data: GEOMETRY });
    expect(result.current.state).toBe('ready');
  });

  it('should keep retrying after a failure rather than giving up', () => {
    const { result } = renderHook(() => useLiveTrackMap('Laguna Seca', true));

    answer({ status: 'error', message: 'LMU API unreachable' });
    expect(result.current.state).toBe('error');
    expect(result.current.error).toBe('LMU API unreachable');

    act(() => jest.advanceTimersByTime(5000));
    answer({ status: 'success', data: GEOMETRY });

    expect(result.current.state).toBe('ready');
  });

  // The geometry cannot change under a running session, so one answer is the
  // whole conversation — 107 KB is not something to re-fetch on a timer.
  it('should stop asking once it has an answer', () => {
    renderHook(() => useLiveTrackMap('Laguna Seca', true));

    answer({ status: 'success', data: GEOMETRY });
    const asked = trackMapRequests();

    act(() => jest.advanceTimersByTime(30000));
    expect(trackMapRequests()).toBe(asked);
  });

  /*
    A provider that builds a fresh `subscribeToApiChannel` on every render is a
    real shape — several of the live tests mock `useApi` that way, and nothing
    stops a future provider doing it. Depending on that identity meant the fetch
    restarted on every render, and because restarting writes state, the restart
    caused the next render: an infinite loop that hung the whole suite rather
    than failing one test.
  */
  it('should not restart because the api callback changed identity', () => {
    useApiMock.mockImplementation(
      () =>
        ({
          subscribeToApiChannel: jest.fn((channel, callback) => {
            if (channel === CONSTANTS.API.GET_LIVE_TRACK_MAP) {
              reply = callback;
            }
            return unsubscribe;
          }),
        }) as unknown as ReturnType<typeof useApi>,
    );

    const { result, rerender } = renderHook(() =>
      useLiveTrackMap('Laguna Seca', true),
    );

    answer({ status: 'success', data: GEOMETRY });
    const asked = trackMapRequests();

    rerender();
    rerender();

    expect(result.current.state).toBe('ready');
    expect(trackMapRequests()).toBe(asked);
  });

  // A map is a property of the circuit, so a new track invalidates it — and
  // must not leave the previous track's outline on screen while it reloads.
  it('should start again when the session moves to another track', () => {
    const { result, rerender } = renderHook(
      ({ track }: { track: string }) => useLiveTrackMap(track, true),
      { initialProps: { track: 'Laguna Seca' } },
    );

    answer({ status: 'success', data: GEOMETRY });
    expect(result.current.state).toBe('ready');

    rerender({ track: 'Sebring' });

    expect(result.current.state).toBe('waiting');
    expect(result.current.points).toHaveLength(0);
  });
});
