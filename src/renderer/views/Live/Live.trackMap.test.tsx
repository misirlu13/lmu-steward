import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

/** A closed loop of world points, long enough to survive the outline builder. */
const RACING_LINE = Array.from({ length: 48 }, (_, index) => {
  const angle = (index / 48) * Math.PI * 2;
  return {
    type: 0,
    x: Number((400 * Math.cos(angle)).toFixed(2)),
    y: 0,
    z: Number((400 * Math.sin(angle)).toFixed(2)),
  };
});

/**
 * The pit lane, in two pieces with a jump between them.
 *
 * Shaped after the real thing: at Laguna Seca LMU ships the pit geometry as
 * three runs with steps of 253 and 497 SVG units between them, against a median
 * step of 5.3. A path that joined those would draw a line straight across the
 * circuit.
 */
const PIT_LANE = [
  ...Array.from({ length: 6 }, (_, index) => ({
    type: 1,
    x: -300 + index * 10,
    y: 0,
    z: -100,
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    type: 1,
    x: 200 + index * 10,
    y: 0,
    z: 300,
  })),
];

/** What the endpoint actually returns: both, in one flat array. */
const GEOMETRY = [...RACING_LINE, ...PIT_LANE];

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

/**
 * Three cars: two positioned Hypercars and one positioned GT3, plus a fourth
 * with no position at all — the state an un-rebuilt sidecar leaves every car in.
 */
const FIELD: LiveCaptureDriver[] = [
  captureDriver({ slotId: 1, place: 1, posX: 400, posZ: 0 }),
  captureDriver({ slotId: 2, place: 2, posX: -400, posZ: 0 }),
  captureDriver({
    slotId: 3,
    place: 3,
    vehicleClass: 'LMGT3',
    posX: 0,
    posZ: 400,
  }),
  captureDriver({ slotId: 4, place: 4 }),
];

const pollResult = (drivers = FIELD) => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'WeatherTech Raceway Laguna Seca',
      sessionType: 'RACE' as const,
    },
    drivers,
    incidents: [],
    battles: [],
  },
  standings: buildStandings(drivers, [], 'RACE'),
  incidents: [],
  sessionKey: 'laguna|10|1700000000',
});

/** The channel subscribers the render registered, so a test can reply. */
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

const liveRoutes = () => (
  <Routes>
    <Route path="/live" element={<LiveShell />}>
      <Route index element={<LiveOverview />} />
      <Route path="incidents" element={<LiveIncidents />} />
      <Route path="timing" element={<LiveTiming />} />
    </Route>
  </Routes>
);

const renderLive = (at = '/live/timing') =>
  render(<MemoryRouter initialEntries={[at]}>{liveRoutes()}</MemoryRouter>);

const deliverGeometry = (data: unknown = GEOMETRY) =>
  act(() =>
    subscribers[CONSTANTS.API.GET_LIVE_TRACK_MAP]?.({
      status: 'success',
      data,
    }),
  );

const map = () => screen.getByLabelText('Track map');
const marker = (slotId: number) =>
  screen.queryByTestId(`track-map-car-slot-${slotId}`);

describe('live track map', () => {
  it('should place every car the sidecar reported a position for', () => {
    renderLive();
    deliverGeometry();

    expect(marker(1)).toBeInTheDocument();
    expect(marker(2)).toBeInTheDocument();
    expect(marker(3)).toBeInTheDocument();
    expect(within(map()).getByText('3 placed')).toBeInTheDocument();
  });

  /*
    The sidecar that reads mPos is a local build artifact and is not committed,
    so a machine that has not rebuilt it sends no position for anyone. A missing
    position is not the origin — drawing it there would put a car at the corner
    of the world and read as a real reading.
  */
  it('should leave a car with no position off the map and say so', () => {
    renderLive();
    deliverGeometry();

    expect(marker(4)).not.toBeInTheDocument();
    expect(
      within(map()).getByText(/1 of 4 cars report no position/),
    ).toBeInTheDocument();
  });

  it('should label a car by its number and name it on hover', () => {
    renderLive();
    deliverGeometry();

    const car = within(marker(1) as HTMLElement);
    expect(car.getByText('1')).toBeInTheDocument();
    expect(car.getByText(/Driver 1 · HY · P1/)).toBeInTheDocument();
  });

  // The same filter the timing table and the camera bar read. All three are
  // meant to agree about which cars the steward is watching.
  it('should hide the cars the shared class filter excludes', () => {
    renderLive();
    deliverGeometry();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Car class' })).getByText(
        'GT3 1',
      ),
    );

    expect(marker(3)).toBeInTheDocument();
    expect(marker(1)).not.toBeInTheDocument();
  });

  it('should point the camera at a car when its marker is clicked', () => {
    renderLive();
    deliverGeometry();

    fireEvent.click(marker(2) as HTMLElement);

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '2',
    );
  });

  it('should ring the car the camera is already on', () => {
    renderLive();
    deliverGeometry();

    expect((marker(2) as HTMLElement).querySelectorAll('circle')).toHaveLength(
      1,
    );
    fireEvent.click(marker(2) as HTMLElement);
    expect((marker(2) as HTMLElement).querySelectorAll('circle')).toHaveLength(
      2,
    );
  });

  /*
    Without it, a car in a garage stall floats in blank space — measured live at
    Laguna Seca, the seven cars in stalls were 48–114 m from the nearest
    racing-line point, which is 5–13% of the map away from anything drawn.
  */
  it('should draw the pit lane, broken where LMU’s geometry is', () => {
    renderLive();
    deliverGeometry();

    const path = screen.getByTestId('track-map-pit-lane');
    const d = path.getAttribute('d') ?? '';

    // Two runs, so two move commands and no line joining them.
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d).toContain('L');
  });

  it('should draw no pit lane when the track map carries none', () => {
    renderLive();
    deliverGeometry(RACING_LINE);

    expect(screen.queryByTestId('track-map-pit-lane')).not.toBeInTheDocument();
    // And the racing line is still a map: readiness never depended on the pits.
    expect(marker(1)).toBeInTheDocument();
  });

  /*
    Never "this track has no map". The endpoint was only confirmed against a
    session that was already running, so an empty answer during load is expected
    — and the hook behind this keeps asking.
  */
  it('should say it is waiting rather than claiming there is no map', () => {
    renderLive();

    expect(
      within(map()).getByText(/Waiting for the game to publish/),
    ).toBeInTheDocument();

    deliverGeometry([]);
    expect(
      within(map()).getByText(/Waiting for the game to publish/),
    ).toBeInTheDocument();
  });

  // One fetch per session, held in the provider. A map that reloaded on every
  // navigation would ask for 107 KB each time and blank itself while it waited.
  it('should keep the geometry across a navigation away and back', () => {
    renderLive();
    deliverGeometry();

    fireEvent.click(screen.getByText('Incidents'));
    fireEvent.click(screen.getByText('Timing'));

    expect(marker(1)).toBeInTheDocument();
    expect(
      within(map()).queryByText(/Waiting for the game to publish/),
    ).not.toBeInTheDocument();
  });
});
