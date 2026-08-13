import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LiveShell } from './LiveShell';
import { LiveOverview } from './LiveOverview';
import { LiveIncidents } from './LiveIncidents';
import { LiveTiming } from './LiveTiming';
import { useApi } from '../../providers/ApiContext';
import {
  buildStandings,
  useLiveSessionData,
} from '../../hooks/useLiveSessionData';
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
  lastSector1: 29.008,
  lastSector2: 60.249,
  bestLapTime: 76.9,
  bestLapSector1: 28.9,
  bestLapSector2: 60.1,
  timeBehindLeader: 0,
  lapsBehindLeader: 0,
  timeBehindNext: 0,
  penalties: 0,
  inPits: false,
  control: 1,
  flag: 0,
  pitStops: 0,
  finishStatus: 0,
  ...overrides,
});

/** Two Hypercars and one GT3, so the class filter has something to narrow. */
const FIELD: LiveCaptureDriver[] = [
  captureDriver({ slotId: 1, place: 1 }),
  captureDriver({
    slotId: 2,
    place: 2,
    timeBehindLeader: 0.653,
    timeBehindNext: 0.653,
    bestLapTime: 77.5,
  }),
  captureDriver({
    slotId: 3,
    place: 3,
    vehicleClass: 'LMGT3',
    timeBehindLeader: 12.4,
    timeBehindNext: 11.747,
    lastLapTime: 89.5,
    // Exactly the S1 from this driver's own best lap: the green case.
    lastSector1: 33,
    lastSector2: 70.2,
    bestLapTime: 89,
    bestLapSector1: 33,
    bestLapSector2: 70,
  }),
];

const pollResult = (status: Record<string, unknown> = {}, drivers = FIELD) => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'WeatherTech Raceway Laguna Seca',
      sessionType: 'RACE' as const,
      ...status,
    },
    drivers,
    incidents: [],
    battles: [],
  },
  standings: buildStandings(
    drivers,
    [],
    (status.sessionType as 'RACE' | 'QUALIFY' | 'PRACTICE') ?? 'RACE',
  ),
  incidents: [],
  sessionKey: 'laguna|10|1700000000',
});

const mockPoll = (...args: Parameters<typeof pollResult>) => {
  useLiveSessionDataMock.mockImplementation(
    () =>
      pollResult(...args) as unknown as ReturnType<typeof useLiveSessionData>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: {},
    saveStewardDecision: jest.fn(),
    subscribeToApiChannel: jest.fn(),
  } as unknown as ReturnType<typeof useApi>);
  mockPoll();
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

const header = () => screen.getByLabelText('Session information');
const row = (slotId: number) => screen.getByTestId(`timing-row-slot-${slotId}`);

describe('live session header', () => {
  it('should show the session conditions the sidecar reported', () => {
    mockPoll({
      timeOfDay: 46044.4,
      ambientTempC: 24.5,
      trackTempC: 31.2,
      raining: 0,
      avgPathWetness: 0,
      timeRemainingSeconds: 4359,
    });
    renderLive();

    const strip = within(header());
    expect(strip.getByText('12:47:24')).toBeInTheDocument();
    expect(strip.getByText('1:12:39')).toBeInTheDocument();
    expect(strip.getByText('24.5°C')).toBeInTheDocument();
    expect(strip.getByText('31.2°C')).toBeInTheDocument();
    expect(strip.getByText('Dry')).toBeInTheDocument();
    expect(strip.getByText('3 cars')).toBeInTheDocument();
  });

  /*
    The sidecar is a local build artifact and is not committed, so a machine
    that has not rebuilt it reports none of this. That is the default state, not
    an edge case — and an absent reading must never arrive as a plausible zero.
  */
  it('should show a dash for every field an un-rebuilt sidecar cannot send', () => {
    renderLive();

    const strip = within(header());
    expect(strip.queryByText('Dry')).not.toBeInTheDocument();
    expect(strip.queryByText(/°C/)).not.toBeInTheDocument();
    expect(strip.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('should break the field down by class', () => {
    renderLive();

    const strip = within(header());
    expect(strip.getByText('HY')).toBeInTheDocument();
    expect(strip.getByText('GT3')).toBeInTheDocument();
  });

  // It is general session information, not a timing-screen ornament: a steward
  // adjudicating an incident needs the clock and the weather too.
  it('should be on every live section, not just timing', () => {
    renderLive('/live/incidents');

    expect(header()).toBeInTheDocument();
  });
});

describe('live timing table', () => {
  it('should show three sectors that add up to the lap', () => {
    renderLive();

    const cells = within(row(1));
    expect(cells.getByText('1:17.233')).toBeInTheDocument();
    expect(cells.getByText('29.008')).toBeInTheDocument();
    expect(cells.getByText('31.241')).toBeInTheDocument();
    expect(cells.getByText('16.984')).toBeInTheDocument();
  });

  it('should show the interval alongside the gap in a race', () => {
    renderLive();

    // P2 is 0.653 behind both the leader and the car ahead — the same car.
    expect(within(row(2)).getAllByText('+0.653')).toHaveLength(2);
    const third = within(row(3));
    expect(third.getByText('+12.400')).toBeInTheDocument();
    expect(third.getByText('+11.747')).toBeInTheDocument();
  });

  /*
    Outside a race the classification is ranked by best lap, so LMU's own gap
    fields describe nothing on track — observed reading 0.0 for almost a whole
    practice field, with a negative outlier. Both columns become best-lap
    deltas instead of showing a number that is not true.
  */
  it('should replace LMU’s gaps with best-lap deltas in practice', () => {
    mockPoll({ sessionType: 'PRACTICE' });
    renderLive();

    // 77.5 - 76.9, not the 0.653 LMU reports as the interval.
    expect(within(row(2)).getAllByText('+0.600')).toHaveLength(2);
    expect(within(row(2)).queryByText('+0.653')).not.toBeInTheDocument();
  });

  /*
    Session best in magenta, own-best-lap pace in green — the convention anyone
    who has read a timing screen expects. Asserted on the tone rather than the
    colour: the palette entry is the thing under test, not the hex it resolves
    to in a theme this render does not install.
  */
  it('should mark the session best and a driver’s own best-lap pace', () => {
    renderLive();

    // The leader holds the session's best lap; the GT3 does not.
    expect(within(row(1)).getByText('1:16.900')).toHaveAttribute(
      'data-tone',
      'session-best',
    );
    expect(within(row(3)).getByText('1:29.000')).toHaveAttribute(
      'data-tone',
      'plain',
    );
    // 28.9 is both the leader's own best S1 and the fastest in the field, so
    // their slower 29.008 is neither.
    expect(within(row(1)).getByText('29.008')).toHaveAttribute(
      'data-tone',
      'plain',
    );
    // The GT3 matched the S1 from its own best lap. Green, not magenta: the
    // Hypercar ahead is four seconds a sector quicker.
    expect(within(row(3)).getByText('33.000')).toHaveAttribute(
      'data-tone',
      'personal-best',
    );
  });
});

describe('live timing class filter', () => {
  it('should narrow the field to one class and back', () => {
    renderLive();

    const chips = within(screen.getByRole('group', { name: 'Car class' }));
    fireEvent.click(chips.getByText('GT3 1'));

    expect(screen.queryByTestId('timing-row-slot-1')).not.toBeInTheDocument();
    expect(row(3)).toBeInTheDocument();
    expect(screen.getByText('1 of 3 cars')).toBeInTheDocument();

    // A second click on the active chip clears it.
    fireEvent.click(chips.getByText('GT3 1'));
    expect(row(1)).toBeInTheDocument();
  });

  /*
    The filter lives in the provider rather than in the view, because the track
    map and the pressure monitor land on this route next and all three have to
    agree about which cars the steward is watching. Surviving a navigation is
    the observable half of that.
  */
  it('should survive leaving the timing view and coming back', () => {
    renderLive();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Car class' })).getByText(
        'GT3 1',
      ),
    );
    fireEvent.click(screen.getByText('Incidents'));
    fireEvent.click(screen.getByText('Timing'));

    expect(screen.getByText('1 of 3 cars')).toBeInTheDocument();
    expect(screen.queryByTestId('timing-row-slot-1')).not.toBeInTheDocument();
  });

  // A class filter that outlives the class it names must say so rather than
  // showing an empty table that reads as a dead feed.
  it('should explain an empty table rather than showing nothing', () => {
    renderLive();

    fireEvent.click(
      within(screen.getByRole('group', { name: 'Car class' })).getByText(
        'GT3 1',
      ),
    );
    mockPoll({}, [captureDriver({ slotId: 1, place: 1 })]);
    fireEvent.click(screen.getByText('Incidents'));
    fireEvent.click(screen.getByText('Timing'));

    expect(screen.getByText('No cars in this class.')).toBeInTheDocument();
  });
});
