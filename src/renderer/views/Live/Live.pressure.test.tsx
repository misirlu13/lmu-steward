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

const liveTree = (at = '/live/timing') => (
  <MemoryRouter initialEntries={[at]}>
    <Routes>
      <Route path="/live" element={<LiveShell />}>
        <Route index element={<LiveOverview />} />
        <Route path="incidents" element={<LiveIncidents />} />
        <Route path="timing" element={<LiveTiming />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const renderLive = (at = '/live/timing') => render(liveTree(at));

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

/*
  Picking a fight to watch is the one thing a steward does on this panel, and it
  used to mean hitting a 16-pixel camera glyph on a list that reorders itself
  every second.
*/
describe('taking a pressure pairing', () => {
  const battleCard = (id: string) => card(`battle-${id}`);

  /**
   * The pairing cards in the order they are drawn, held ones included.
   *
   * By test id rather than by role: every card also contains two per-car camera
   * buttons whose labels start the same way.
   */
  const cardOrder = (): string[] =>
    within(monitor())
      .getAllByTestId(/^pressure-battle-/)
      .map((element) => element.getAttribute('data-testid') ?? '');

  const take = (id: string) => fireEvent.click(battleCard(id));

  it('should watch the catching car when the box is clicked', () => {
    renderLive();

    take('closing');

    // Car 2 is the one closing on car 1, and it is drawn first for that reason.
    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '2',
    );
  });

  it('should lift the taken pairing to the top', () => {
    renderLive();
    expect(cardOrder()).toEqual([
      'pressure-battle-battle-closing',
      'pressure-battle-battle-traffic',
    ]);

    take('traffic');

    expect(cardOrder()).toEqual([
      'pressure-battle-battle-traffic',
      'pressure-battle-battle-closing',
    ]);
  });

  it('should mark the pinned pairing as pinned', () => {
    renderLive();

    take('traffic');

    expect(battleCard('traffic')).toHaveAttribute('aria-pressed', 'true');
    expect(battleCard('closing')).toHaveAttribute('aria-pressed', 'false');
    expect(
      within(battleCard('traffic')).getByText('Pinned'),
    ).toBeInTheDocument();
  });

  it('should release the pin from the card without re-pinning it', () => {
    renderLive();
    take('traffic');

    fireEvent.click(within(battleCard('traffic')).getByTestId('CancelIcon'));

    expect(battleCard('traffic')).toHaveAttribute('aria-pressed', 'false');
    expect(cardOrder()).toEqual([
      'pressure-battle-battle-closing',
      'pressure-battle-battle-traffic',
    ]);
  });

  /** Every car the camera was sent to, in order. */
  const focusedCars = (): string[] =>
    sendMessageMock.mock.calls
      .filter(
        ([channel]) => channel === CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      )
      .map(([, slotId]) => String(slotId));

  /*
    An incident between two cars is worth seeing from both ends — who arrived
    and who was arrived at are different questions — and clicking the card
    already being watched is the natural way to ask the second one.
  */
  it('should swap to the other car when taken again', () => {
    renderLive();

    // Car 1 is catching car 3, so the first click lands on 1.
    take('traffic');
    take('traffic');

    expect(focusedCars()).toEqual(['1', '3']);
  });

  it('should keep swapping back and forth', () => {
    renderLive();

    take('traffic');
    take('traffic');
    take('traffic');
    take('traffic');

    expect(focusedCars()).toEqual(['1', '3', '1', '3']);
  });

  // Swapping the camera is not releasing the fight. Unpinning is the pin button.
  it('should stay pinned across the swap', () => {
    renderLive();

    take('traffic');
    take('traffic');

    expect(battleCard('traffic')).toHaveAttribute('aria-pressed', 'true');
  });

  /*
    Read off the car the game is actually on rather than off a remembered side.
    The per-car buttons, the camera bar's driver cycle and the dossier all drive
    the same focus, so a remembered side would disagree with the picture the
    moment any of them was used — and the next click would land on the car
    already on screen.
  */
  it('should swap relative to the car already being watched', () => {
    renderLive();

    // Straight to the car ahead, using the card's own per-car button.
    fireEvent.click(
      within(battleCard('traffic')).getByRole('button', {
        name: 'Watch #3 Driver 3',
      }),
    );
    sendMessageMock.mockClear();

    // The card must now offer the other one, not start its own count again.
    take('traffic');

    expect(focusedCars()).toEqual(['1']);
  });

  /*
    The per-car buttons are the precise version of the same act — watch *this*
    one — so they must not drag the card's own behaviour along with them.
  */
  it('should not pin when a single car is chosen from within the box', () => {
    renderLive();

    fireEvent.click(
      within(battleCard('closing')).getByRole('button', {
        name: 'Watch #1 Driver 1',
      }),
    );

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '1',
    );
    expect(battleCard('closing')).toHaveAttribute('aria-pressed', 'false');
  });

  /*
    `battle.id` is `battle-{behind}-{ahead}` and flips the instant the pass
    completes. Pinning on it would drop the fight at exactly the moment a
    steward is watching it hardest, so the pin identifies the two cars instead.
  */
  it('should hold the pin through the overtake', () => {
    // Traffic pinned, so lifting it to the front is a real move rather than the
    // order it already had.
    const view = renderLive();
    take('traffic');
    expect(cardOrder()[0]).toBe('pressure-battle-battle-traffic');

    // The same two cars, the other way round, as the feed reports them once the
    // pass is complete.
    setBattles([
      CLOSING,
      {
        ...TRAFFIC,
        id: 'battle-3-1',
        aheadSlotId: 1,
        behindSlotId: 3,
        aheadSteamId: 'slot-1',
        behindSteamId: 'slot-3',
      },
    ]);
    view.rerender(liveTree());

    expect(cardOrder()[0]).toBe('pressure-battle-battle-3-1');
  });
});

/*
  There is no cap on pins, because the panel cannot know when a steward has
  finished watching a fight — only they can.
*/
describe('watching several pressure pairings at once', () => {
  const battleCard = (id: string) => card(`battle-${id}`);
  const heldCard = (key: string) => card(key);

  const cardOrder = (): string[] =>
    within(monitor())
      .getAllByTestId(/^pressure-battle-/)
      .map((element) => element.getAttribute('data-testid') ?? '');

  const take = (id: string) => fireEvent.click(battleCard(id));

  it('should keep every pairing the steward takes', () => {
    renderLive();

    take('traffic');
    take('closing');

    expect(battleCard('traffic')).toHaveAttribute('aria-pressed', 'true');
    expect(battleCard('closing')).toHaveAttribute('aria-pressed', 'true');
  });

  // Oldest first, so a card does not move under the cursor when another is
  // added below it.
  it('should hold pinned pairings in the order they were taken', () => {
    renderLive();

    take('traffic');
    take('closing');

    expect(cardOrder()).toEqual([
      'pressure-battle-battle-traffic',
      'pressure-battle-battle-closing',
    ]);
  });

  it('should release one pinned pairing without disturbing the others', () => {
    renderLive();
    take('traffic');
    take('closing');

    fireEvent.click(within(battleCard('traffic')).getByTestId('CancelIcon'));

    expect(battleCard('traffic')).toHaveAttribute('aria-pressed', 'false');
    expect(battleCard('closing')).toHaveAttribute('aria-pressed', 'true');
  });

  it('should release the whole shortlist at once', () => {
    renderLive();
    take('traffic');
    take('closing');

    fireEvent.click(screen.getByText('Unpin all (2)'));

    expect(battleCard('traffic')).toHaveAttribute('aria-pressed', 'false');
    expect(battleCard('closing')).toHaveAttribute('aria-pressed', 'false');
  });

  /*
    The reason a pin has to outlive the feed. A pairing enters at two seconds
    and is dropped once it passes 2.6 — and it also vanishes the moment a third
    car slots between the two, or either pits. None of those mean the steward
    has finished watching, so dropping the card would be the panel deciding that
    for them.
  */
  it('should keep a pinned pairing after the gap opens', () => {
    const view = renderLive();
    take('traffic');

    // The feed no longer carries it: the two cars are more than 2.6s apart.
    setBattles([CLOSING]);
    view.rerender(liveTree());

    expect(heldCard('slot-1~slot-3')).toBeInTheDocument();
    expect(heldCard('slot-1~slot-3')).toHaveAttribute('aria-pressed', 'true');
    expect(cardOrder()[0]).toBe('pressure-battle-slot-1~slot-3');
  });

  /*
    A card still showing the last numbers it had would be presenting a reading
    from some seconds ago as current. Absent is absent — the rule the whole live
    view follows.
  */
  it('should show no measurements for a pairing that is no longer close', () => {
    const view = renderLive();
    take('traffic');
    setBattles([CLOSING]);
    view.rerender(liveTree());

    const held = within(heldCard('slot-1~slot-3'));
    expect(held.getByText('NOT CLOSE')).toBeInTheDocument();
    expect(held.getByText('ETA —')).toBeInTheDocument();
    // The gap the card carried while it was live.
    expect(held.queryByText('1.80s')).not.toBeInTheDocument();
  });

  // Still the same two cars, so the panel still says which kind of fight it is.
  it('should keep naming the class relationship while held', () => {
    const view = renderLive();
    take('traffic');
    setBattles([CLOSING]);
    view.rerender(liveTree());

    expect(
      within(heldCard('slot-1~slot-3')).getByText('TRAFFIC'),
    ).toBeInTheDocument();
  });

  it('should pick the pairing back up when the cars close again', () => {
    const view = renderLive();
    take('traffic');

    setBattles([CLOSING]);
    view.rerender(liveTree());
    expect(heldCard('slot-1~slot-3')).toBeInTheDocument();

    setBattles([CLOSING, TRAFFIC]);
    view.rerender(liveTree());

    expect(battleCard('traffic')).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(battleCard('traffic')).getByText('1.80s'),
    ).toBeInTheDocument();
  });

  it('should let a held pairing be released like any other', () => {
    const view = renderLive();
    take('traffic');
    setBattles([CLOSING]);
    view.rerender(liveTree());

    fireEvent.click(
      within(heldCard('slot-1~slot-3')).getByTestId('CancelIcon'),
    );

    expect(screen.queryByTestId('pressure-battle-slot-1~slot-3')).toBeNull();
  });
});
