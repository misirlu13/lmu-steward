import { act, renderHook } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LiveIncidentRecord, LiveSessionSummary } from '@types';
import { useLiveSessionSegments } from './useLiveSessionSegments';
import { useApi } from '../providers/ApiContext';
import { sendMessage } from '../utils/postMessage';

jest.mock('../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

let reply: ((payload: unknown) => void) | undefined;
const unsubscribe = jest.fn();

const RACE_KEY = 'live|Laguna|10|1800000000000';
const PRACTICE_KEY = 'live|Laguna|1|1799990000000';

const summary = (sessionKey: string, session: number): LiveSessionSummary =>
  ({
    sessionKey,
    trackName: 'Laguna',
    sessionType: session === 10 ? 'RACE' : 'PRACTICE',
    session,
    startedAt: 1_799_990_000_000 + session,
    lastSeenAt: 1_800_000_000_000,
    driverCount: 2,
    incidentCount: 1,
    evidenceCount: 0,
    linkState: 'unlinked',
  }) as LiveSessionSummary;

const SEGMENTS = [summary(PRACTICE_KEY, 1), summary(RACE_KEY, 10)];

const record = (id: string, sessionKey: string): LiveIncidentRecord =>
  ({
    id,
    sessionKey,
    occurredAt: 0,
    hasContext: true,
    incident: {
      id: 'live-3-1',
      seq: 1,
      etSeconds: 42,
      kind: 'incident',
      objectStruck: 'another vehicle',
      raw: 'contact',
      parties: [{ slotId: 1, displayName: 'A' }],
    },
  }) as unknown as LiveIncidentRecord;

const requests = () =>
  sendMessageMock.mock.calls.filter(
    ([channel]) => channel === CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS,
  );

const recordRequests = () =>
  requests().filter(
    ([, payload]) => (payload as { recordFor?: string })?.recordFor,
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  reply = undefined;
  useApiMock.mockReturnValue({
    subscribeToApiChannel: jest.fn((channel, callback) => {
      if (channel === CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS) {
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

const listReply = () => ({
  status: 'success',
  data: {
    anchorSessionKey: RACE_KEY,
    segments: SEGMENTS,
    incidents: [],
    drivers: [],
  },
});

const recordReply = () => ({
  status: 'success',
  data: {
    anchorSessionKey: RACE_KEY,
    segments: SEGMENTS,
    recordFor: PRACTICE_KEY,
    incidents: [record(`${PRACTICE_KEY}#0001`, PRACTICE_KEY)],
    drivers: [],
  },
});

describe('useLiveSessionSegments', () => {
  it('should ask for nothing when there is no session to group around', () => {
    renderHook(() => useLiveSessionSegments(RACE_KEY, undefined, false));

    expect(requests()).toHaveLength(0);
  });

  it('should ask for the list without a record when nothing is opened', () => {
    renderHook(() => useLiveSessionSegments(RACE_KEY, undefined, true));

    expect(requests()).toHaveLength(1);
    expect(recordRequests()).toHaveLength(0);
  });

  it('should ask again when the running session changes', () => {
    const { rerender } = renderHook(
      ({ key }) => useLiveSessionSegments(key, undefined, true),
      { initialProps: { key: PRACTICE_KEY } },
    );

    rerender({ key: RACE_KEY });

    expect(requests()).toHaveLength(2);
    expect(requests()[1][1]).toEqual(
      expect.objectContaining({ sessionKey: RACE_KEY }),
    );
  });

  /*
    A past session's incidents cannot change, and rebuilding them on the refresh
    timer would hand the queue a whole new set of object identities to re-render
    every thirty seconds for no new information.
  */
  it('should not re-request a record it already holds', () => {
    renderHook(() => useLiveSessionSegments(RACE_KEY, PRACTICE_KEY, true));
    answer(recordReply());

    expect(recordRequests()).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(120_000);
    });

    expect(recordRequests()).toHaveLength(1);
    expect(requests().length).toBeGreaterThan(1);
  });

  it('should keep a held record when a list-only refresh answers', () => {
    const { result } = renderHook(() =>
      useLiveSessionSegments(RACE_KEY, PRACTICE_KEY, true),
    );
    answer(recordReply());

    const held = result.current.record;
    expect(held?.incidents).toHaveLength(1);

    answer(listReply());

    expect(result.current.record).toBe(held);
  });

  /*
    The record has to come back under its persisted id, because that is what
    every steward decision is keyed on. The stored payload deliberately does not
    carry it — the row's own id is the single copy — so the hook puts it back.
  */
  it('should rebuild incidents under their persisted ids', () => {
    const { result } = renderHook(() =>
      useLiveSessionSegments(RACE_KEY, PRACTICE_KEY, true),
    );
    answer(recordReply());

    expect(result.current.record?.incidents[0].id).toBe(`${PRACTICE_KEY}#0001`);
    expect(result.current.record?.incidents[0].hasTrace).toBe(true);
  });

  it('should drop the record when the steward goes back to live', () => {
    const { result, rerender } = renderHook(
      ({ key }: { key?: string }) =>
        useLiveSessionSegments(RACE_KEY, key, true),
      { initialProps: { key: PRACTICE_KEY as string | undefined } },
    );
    answer(recordReply());
    expect(result.current.record).toBeDefined();

    rerender({ key: undefined });

    expect(result.current.record).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  // A record that arrives for a segment the steward has already left is not
  // this one's, and showing it under the current heading would be a lie.
  it('should ignore a record for a segment that is no longer open', () => {
    const { result } = renderHook(() =>
      useLiveSessionSegments(RACE_KEY, undefined, true),
    );

    answer(recordReply());

    expect(result.current.record).toBeUndefined();
    expect(result.current.segments).toHaveLength(2);
  });

  it('should surface a failure rather than showing an empty weekend', () => {
    const { result } = renderHook(() =>
      useLiveSessionSegments(RACE_KEY, undefined, true),
    );

    answer({ status: 'error', message: 'disk is on fire' });

    expect(result.current.error).toBe('disk is on fire');
  });
});
