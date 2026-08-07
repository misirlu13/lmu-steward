import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LiveShell } from './LiveShell';
import { LiveOverview } from './LiveOverview';
import { LiveIncidents } from './LiveIncidents';
import { LiveTiming } from './LiveTiming';
import { useApi } from '../../providers/ApiContext';
import {
  buildStandings,
  useLiveSessionData,
} from '../../hooks/useLiveSessionData';
import { sendMessage } from '../../utils/postMessage';
import { LiveCaptureDriver } from '../../../../types';

jest.mock('../../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../../hooks/useLiveSessionData', () => ({
  ...jest.requireActual('../../hooks/useLiveSessionData'),
  useLiveSessionData: jest.fn(),
}));
jest.mock('../../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const useLiveSessionDataMock = useLiveSessionData as jest.MockedFunction<
  typeof useLiveSessionData
>;
const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

const RACING_LINE = Array.from({ length: 48 }, (_, index) => {
  const angle = (index / 48) * Math.PI * 2;
  return {
    type: 0,
    x: Number((400 * Math.cos(angle)).toFixed(2)),
    y: 0,
    z: Number((400 * Math.sin(angle)).toFixed(2)),
  };
});

const captureDriver = (
  overrides: Partial<LiveCaptureDriver> & { slotId: number },
): LiveCaptureDriver => ({
  steamId: '0',
  driverName: `Driver ${overrides.slotId}`,
  vehicleName: `#${overrides.slotId} Car`,
  vehicleClass: 'Hyper',
  place: overrides.slotId,
  lapsCompleted: 12,
  lastLapTime: 77.233,
  bestLapTime: 76.9,
  timeBehindLeader: 0,
  lapsBehindLeader: 0,
  penalties: 0,
  inPits: false,
  control: 0,
  flag: 0,
  pitStops: 0,
  finishStatus: 0,
  ...overrides,
});

/** Two cars, both placed by the sidecar's 1 Hz feed to begin with. */
const FIELD: LiveCaptureDriver[] = [
  captureDriver({ slotId: 1, place: 1, posX: 400, posZ: 0 }),
  captureDriver({ slotId: 2, place: 2, posX: -400, posZ: 0 }),
];

const pollResult = () => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'WeatherTech Raceway Laguna Seca',
      sessionType: 'RACE' as const,
    },
    drivers: FIELD,
    incidents: [],
    battles: [],
  },
  standings: buildStandings(FIELD, [], 'RACE'),
  incidents: [],
  sessionKey: 'laguna|10|1700000000',
});

let subscribers: Record<string, (payload: unknown) => void>;

beforeEach(() => {
  jest.clearAllMocks();
  subscribers = {};
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: {},
    saveStewardDecision: jest.fn(),
    subscribeToApiChannel: jest.fn(
      (channel: string, callback: (payload: unknown) => void) => {
        subscribers[channel] = callback;
        return jest.fn();
      },
    ),
  } as unknown as ReturnType<typeof useApi>);
  useLiveSessionDataMock.mockImplementation(
    () => pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

const renderLive = (at = '/live/timing') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/live" element={<LiveShell />}>
          <Route index element={<LiveOverview />} />
          <Route path="incidents" element={<LiveIncidents />} />
          <Route path="timing" element={<LiveTiming />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const deliverGeometry = () =>
  act(() =>
    subscribers[CONSTANTS.API.GET_LIVE_TRACK_MAP]?.({
      status: 'success',
      data: RACING_LINE,
    }),
  );

const deliverPositions = (payload: unknown) =>
  act(() => subscribers[CONSTANTS.API.GET_LIVE_CAR_POSITIONS]?.(payload));

/** Where the marker for a slot is actually drawn, in SVG units. */
const markerX = (slotId: number): string | null =>
  screen
    .getByTestId(`track-map-car-slot-${slotId}`)
    .querySelector('circle')
    ?.getAttribute('cx') ?? null;

/*
  These render the real `LiveTiming`, the real `useLiveCarPositions` and the
  real merge, against a `subscribeToApiChannel` that records what was
  subscribed to. Unit tests over the merge alone cannot see any of this wiring:
  the mistake this step was warned about — a channel with no `messageBusHandlers`
  entry — is invisible to a mocked `useApi`, which is why the table-driven test
  in `ApiContext.integration.test.tsx` carries the other half.
*/
describe('live 5 Hz position feed', () => {
  it('should ask for positions on its own channel, not on the session poll', () => {
    renderLive();

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_LIVE_CAR_POSITIONS,
    );
  });

  it('should not ask for positions from a section that is not the timing view', () => {
    renderLive('/live');

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      CONSTANTS.API.GET_LIVE_CAR_POSITIONS,
    );
  });

  it('should move a marker onto the fast position when the rosters agree', () => {
    renderLive();
    deliverGeometry();

    const before = markerX(1);

    deliverPositions({
      status: 'success',
      data: [{ slotId: 1, driverName: 'Driver 1', x: -400, z: 0 }],
    });

    expect(markerX(1)).not.toBe(before);
    expect(screen.getByText('5 Hz')).toBeInTheDocument();
  });

  /*
    The join failing must be visible as "no fast feed", never as a car in the
    wrong place. `slotID` and the sidecar's `mID` agree in any session nobody
    has left, so this is the divergence a fixture cannot otherwise produce.
  */
  it('should keep the slow position when the driver name disagrees', () => {
    renderLive();
    deliverGeometry();

    const before = markerX(1);

    deliverPositions({
      status: 'success',
      data: [{ slotId: 1, driverName: 'Somebody Else', x: -400, z: 0 }],
    });

    expect(markerX(1)).toBe(before);
    expect(screen.queryByText('5 Hz')).not.toBeInTheDocument();
  });

  // A game that has closed must show no fast positions rather than stale ones.
  it('should drop back to the slow feed when the request fails', () => {
    renderLive();
    deliverGeometry();

    const slow = markerX(1);

    deliverPositions({
      status: 'success',
      data: [{ slotId: 1, driverName: 'Driver 1', x: -400, z: 0 }],
    });
    expect(markerX(1)).not.toBe(slow);

    deliverPositions({ status: 'error', message: 'fetch failed' });

    expect(markerX(1)).toBe(slow);
    expect(screen.queryByText('5 Hz')).not.toBeInTheDocument();
  });
});
