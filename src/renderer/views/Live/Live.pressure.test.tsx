import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LiveCaptureDriver, LivePressureBattle } from '@types';
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

const captureDriver = (
  slotId: number,
  vehicleClass: string,
): LiveCaptureDriver =>
  ({
    slotId,
    steamId: '0',
    driverName: `Driver ${slotId}`,
    vehicleName: `#${slotId} Car`,
    vehicleClass,
    place: slotId,
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
  }) as LiveCaptureDriver;

/** Two Hypercars and a GT3, so a same-class fight and traffic both exist. */
const FIELD: LiveCaptureDriver[] = [
  captureDriver(1, 'Hyper'),
  captureDriver(2, 'Hyper'),
  captureDriver(3, 'LMGT3'),
];

const CLOSING: LivePressureBattle = {
  id: 'battle-closing',
  aheadSteamId: 'slot-1',
  behindSteamId: 'slot-2',
  aheadSlotId: 1,
  behindSlotId: 2,
  gapSeconds: 0.45,
  closingSpeedKph: 41.2,
  isTraffic: false,
  aheadSpeedKph: 168,
  behindSpeedKph: 209,
  timeToCatchSeconds: 2,
};

/** Traffic, and dropping back — so there is no time to catch. */
const TRAFFIC: LivePressureBattle = {
  id: 'battle-traffic',
  aheadSteamId: 'slot-3',
  behindSteamId: 'slot-1',
  aheadSlotId: 3,
  behindSlotId: 1,
  gapSeconds: 1.8,
  closingSpeedKph: -12.4,
  isTraffic: true,
  aheadSpeedKph: 226,
  behindSpeedKph: 214,
};

const pollResult = (battles: LivePressureBattle[]) => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'WeatherTech Raceway Laguna Seca',
      sessionType: 'RACE' as const,
    },
    drivers: FIELD,
    incidents: [],
    battles,
  },
  standings: buildStandings(FIELD, [], 'RACE'),
  incidents: [],
  sessionKey: 'laguna|10|1700000000',
});

const setBattles = (battles: LivePressureBattle[]) =>
  useLiveSessionDataMock.mockImplementation(
    () =>
      pollResult(battles) as unknown as ReturnType<typeof useLiveSessionData>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: {},
    saveStewardDecision: jest.fn(),
    subscribeToApiChannel: jest.fn(() => jest.fn()),
  } as unknown as ReturnType<typeof useApi>);
  setBattles([CLOSING, TRAFFIC]);
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

const monitor = () => screen.getByLabelText('Pressure monitor');
const card = (id: string) => screen.getByTestId(`pressure-battle-${id}`);

describe('live pressure monitor', () => {
  it('should show gap, both speeds, the trend and a time to catch', () => {
    renderLive();

    const closing = within(card('battle-closing'));
    expect(closing.getByText('0.45s')).toBeInTheDocument();
    expect(closing.getByText('209 / 168 kph')).toBeInTheDocument();
    expect(closing.getByText('▲ 41 kph')).toBeInTheDocument();
    expect(closing.getByText('ETA 2.0s')).toBeInTheDocument();
  });

  /*
    A car dropping back never catches anyone. The ETA reads `—` rather than a
    negative number or a placeholder eternity — the same rule the whole live
    view follows: absent is absent, never a zero and never a guess.
  */
  it('should show no time to catch for a car losing ground', () => {
    renderLive();

    const traffic = within(card('battle-traffic'));
    expect(traffic.getByText('ETA —')).toBeInTheDocument();
    expect(traffic.getByText('▼ 12 kph')).toBeInTheDocument();
  });

  it('should mark the class relationship of each pairing', () => {
    renderLive();

    expect(
      within(card('battle-closing')).getByText('SAME CLASS'),
    ).toBeInTheDocument();
    expect(
      within(card('battle-traffic')).getByText('TRAFFIC'),
    ).toBeInTheDocument();
  });

  it('should dispatch a camera focus for either car in a pairing', () => {
    renderLive();

    fireEvent.click(
      within(card('battle-closing')).getByRole('button', {
        name: 'Watch #2 Driver 2',
      }),
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '2',
    );

    fireEvent.click(
      within(card('battle-closing')).getByRole('button', {
        name: 'Watch #1 Driver 1',
      }),
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '1',
    );
  });

  /*
    The class filter matches *either* car, not both. Filtering a pair the way a
    single-car list is filtered would hide every cross-class pairing — which is
    backwards, because the Hypercar arriving behind a GT3 is the thing a GT3
    steward most needs to see.
  */
  it('should keep a cross-class pairing when the filter narrows to one of them', () => {
    renderLive();

    fireEvent.click(screen.getByRole('button', { name: 'GT3 1' }));

    expect(screen.queryByTestId('pressure-battle-battle-closing')).toBeNull();
    expect(card('battle-traffic')).toBeInTheDocument();
    expect(within(monitor()).getByText('1 pairing')).toBeInTheDocument();
  });

  it('should say plainly when nothing is close', () => {
    setBattles([]);
    renderLive();

    expect(
      within(monitor()).getByText('No cars within two seconds of each other.'),
    ).toBeInTheDocument();
  });

  // What is left of the old sidebar list on Overview: a count that says whether
  // the section wants looking at, not the pairings themselves.
  it('should count the battles on the overview and route to the monitor', () => {
    renderLive('/live');

    expect(screen.queryByLabelText('Pressure monitor')).toBeNull();
    fireEvent.click(
      screen.getByLabelText(
        '2 cars within two seconds — open the pressure monitor',
      ),
    );

    expect(screen.getByLabelText('Pressure monitor')).toBeInTheDocument();
  });
});
