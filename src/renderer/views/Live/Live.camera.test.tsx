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
import { useLiveSessionData } from '../../hooks/useLiveSessionData';
import { sendMessage } from '../../utils/postMessage';
import {
  LiveStanding,
  liveStandingsFixture,
} from '../../components/Live/liveFixtures';

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

/*
  The layout fixture with slots attached. The camera addresses a car by slot —
  it is the only key LMU's focus endpoint takes — and the fixture predates
  them, so a bar fed the bare fixture could only ever prove the disabled case.
*/
const STANDINGS = liveStandingsFixture.map((standing, index) => ({
  ...standing,
  slotId: index + 1,
}));

const pollResult = (standings: LiveStanding[] = STANDINGS) => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'Bahrain',
      sessionType: 'RACE' as const,
    },
    drivers: [],
    incidents: [],
    battles: [],
  },
  standings,
  incidents: [],
  sessionKey: 'bahrain|10|1700000000',
});

let liveSessionStatus: { state: string } = { state: 'live' };

/*
  A working subscription registry, not a bare `jest.fn()`. The bar now reconciles
  itself against replies from the game, so a mock that swallows them can only
  ever test the half of the behaviour that guesses.
*/
let subscribers: Record<string, Set<(payload: unknown) => void>> = {};

const emit = (channel: string, payload: unknown) =>
  act(() => {
    subscribers[channel]?.forEach((callback) => callback(payload));
  });

/**
 * What the game answers when asked which car is on screen.
 *
 * A bare number, which is what `/rest/watch/focus` actually returns — verified
 * against a running session on 2026-08-08, where it answered `30`. The dev-mode
 * mock had carried `{slotID: 0}` since it was written and nothing had ever read
 * it, so the wrong shape cost nothing until now.
 */
const gameFocus = (slotId: number) =>
  emit(CONSTANTS.API.GET_FOCUSED_CAR, { status: 'success', data: slotId });

beforeEach(() => {
  jest.clearAllMocks();
  liveSessionStatus = { state: 'live' };
  subscribers = {};
  useApiMock.mockImplementation(
    () =>
      ({
        isConnected: true,
        hasApiStatusResponse: true,
        liveSessionStatus,
        isReplayActive: false,
        stewardDecisions: {},
        saveStewardDecision: jest.fn(),
        subscribeToApiChannel: (
          channel: string,
          callback: (payload: unknown) => void,
        ) => {
          subscribers[channel] ??= new Set();
          subscribers[channel].add(callback);
          return () => subscribers[channel]?.delete(callback);
        },
      }) as unknown as ReturnType<typeof useApi>,
  );
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

const bar = () => within(screen.getByLabelText('Camera controls'));

const focusCalls = () =>
  sendMessageMock.mock.calls.filter(
    ([channel]) => channel === CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
  );

describe('live camera bar', () => {
  it('should be on every live section, like the header', () => {
    renderLive('/live/incidents');
    expect(screen.getByLabelText('Camera controls')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Timing'));
    expect(screen.getByLabelText('Camera controls')).toBeInTheDocument();
  });

  /*
    A live session has nothing to pause, no speed to change and no incident to
    jump backwards to. The replay bar's playback half is absent rather than
    disabled — a greyed-out play button invites a steward to wonder what broke.
  */
  it('should carry no playback or incident-jump controls', () => {
    renderLive();

    const controls = bar();
    expect(controls.queryByText('x1.0')).not.toBeInTheDocument();
    expect(controls.queryByText('Next Incident')).not.toBeInTheDocument();
    expect(controls.queryByText(/Incident Jump/)).not.toBeInTheDocument();
  });

  it('should offer the three camera groups the replay bar does', () => {
    renderLive();

    const controls = bar();
    expect(controls.getByText('Driver')).toBeInTheDocument();
    expect(controls.getByText('Onboard')).toBeInTheDocument();
    expect(controls.getByText('Trackside')).toBeInTheDocument();
  });

  // Nothing to point a camera at, so nothing that pretends it can.
  it('should not appear when there is no live session', () => {
    liveSessionStatus = { state: 'detached' };
    renderLive();

    expect(screen.queryByLabelText('Camera controls')).not.toBeInTheDocument();
  });
});

describe('live camera driver cycling', () => {
  it('should start at the leader and step down the classification', () => {
    renderLive();
    const controls = bar();

    fireEvent.click(controls.getByLabelText('Next car'));
    expect(focusCalls().at(-1)).toEqual([
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '1',
    ]);
    expect(controls.getByText(STANDINGS[0].displayName)).toBeInTheDocument();

    fireEvent.click(controls.getByLabelText('Next car'));
    expect(focusCalls().at(-1)).toEqual([
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '2',
    ]);
    expect(controls.getByText(STANDINGS[1].displayName)).toBeInTheDocument();
  });

  // "Previous" before anything is selected means the back of the field, not
  // car two — the two directions have to start from opposite ends.
  it('should start at the back of the field going the other way', () => {
    renderLive();

    fireEvent.click(bar().getByLabelText('Previous car'));

    expect(focusCalls().at(-1)).toEqual([
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      String(STANDINGS.length),
    ]);
  });

  it('should wrap around at the end of the field', () => {
    renderLive();
    const next = bar().getByLabelText('Next car');

    STANDINGS.forEach(() => fireEvent.click(next));
    fireEvent.click(next);

    expect(focusCalls().at(-1)).toEqual([
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '1',
    ]);
  });

  /*
    The camera steps through the same cars the timing screen is showing. A
    steward who has narrowed to GT3 is watching GT3, and a cycle that dropped
    them into a Hypercar would undo the narrowing they just asked for.
  */
  it('should honour the shared class filter', () => {
    renderLive();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Car class' })).getByText(
        /^GT3/,
      ),
    );

    fireEvent.click(bar().getByLabelText('Next car'));

    const gt3 = STANDINGS.filter((standing) => standing.carClass === 'GT3');
    expect(focusCalls().at(-1)).toEqual([
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      String(gt3[0].slotId),
    ]);
  });

  // The selection is shell state, not screen state — the whole reason the bar
  // is persistent rather than living on the timing view.
  it('should keep the watched car across a section change', () => {
    renderLive();
    fireEvent.click(bar().getByLabelText('Next car'));

    fireEvent.click(screen.getByText('Incidents'));

    expect(bar().getByText(STANDINGS[0].displayName)).toBeInTheDocument();
  });

  /*
    The defect, reproduced. Live: stepped via the app to classification index
    25, moved the camera out-of-band to index 2 as LMU's own controls or its
    auto-director would, pressed **next** once — and it went to index 26, its
    own pointer plus one, yanking the camera off what was on screen and then
    naming the wrong driver in the bar. Fixed means it steps from the game.
  */
  it('should step from the car the game says is on screen, not from its own pointer', () => {
    renderLive();
    const controls = bar();

    fireEvent.click(controls.getByLabelText('Next car'));
    gameFocus(1);
    expect(focusCalls().at(-1)?.[1]).toBe('1');

    // The camera moves inside the game, and the app is told about it only by
    // being asked.
    gameFocus(5);
    expect(controls.getByText(STANDINGS[4].displayName)).toBeInTheDocument();

    fireEvent.click(controls.getByLabelText('Next car'));

    expect(focusCalls().at(-1)?.[1]).toBe('6');
  });

  /*
    But a reading that arrives between the click and the game acting on it must
    not drag the pointer back. Stepping is optimistic on purpose — twenty clicks
    at 142 ms apiece landed twenty exact steps precisely because nothing waits
    for a round trip — and reconciling mid-step would be worse than the drift it
    fixes.
  */
  it('should not let a stale reading fight the steward mid-step', () => {
    renderLive();
    const controls = bar();

    fireEvent.click(controls.getByLabelText('Next car'));
    fireEvent.click(controls.getByLabelText('Next car'));
    expect(focusCalls().at(-1)?.[1]).toBe('2');

    // The game is still reporting the car from before either click.
    gameFocus(1);
    expect(controls.getByText(STANDINGS[1].displayName)).toBeInTheDocument();

    fireEvent.click(controls.getByLabelText('Next car'));
    expect(focusCalls().at(-1)?.[1]).toBe('3');
  });

  /*
    Both shapes, because the endpoint's response body is not documented in LMU's
    Swagger spec — it lists paths, methods and parameters only. A live call says
    it is a bare number today; an object was believed for long enough to be
    written into a mock, and reading only one of the two would silently disable
    the reconciliation above rather than fail loudly.
  */
  it('should read the slot whether the game sends a number or an object', () => {
    renderLive();
    const controls = bar();

    emit(CONSTANTS.API.GET_FOCUSED_CAR, { status: 'success', data: 3 });
    expect(controls.getByText(STANDINGS[2].displayName)).toBeInTheDocument();

    emit(CONSTANTS.API.GET_FOCUSED_CAR, {
      status: 'success',
      data: { slotID: 4 },
    });
    expect(controls.getByText(STANDINGS[3].displayName)).toBeInTheDocument();
  });

  // A car the game says nothing about leaves the bar as it was, rather than
  // clearing to "no car selected" once a second.
  it('should ignore a focus reading it cannot read', () => {
    renderLive();
    const controls = bar();

    fireEvent.click(controls.getByLabelText('Next car'));
    gameFocus(1);
    emit(CONSTANTS.API.GET_FOCUSED_CAR, { status: 'error', message: 'gone' });

    expect(controls.getByText(STANDINGS[0].displayName)).toBeInTheDocument();
  });

  // Slots come from the capture; the layout fixtures carry none, and LMU's
  // focus endpoint has nothing else to address a car by.
  it('should disable the cycle when no car has a slot', () => {
    useLiveSessionDataMock.mockImplementation(
      () =>
        pollResult(
          liveStandingsFixture.map((standing) => ({
            ...standing,
            slotId: undefined,
          })),
        ) as unknown as ReturnType<typeof useLiveSessionData>,
    );
    renderLive();

    expect(bar().getByLabelText('Next car')).toBeDisabled();
    expect(bar().getByText('No cars to follow')).toBeInTheDocument();
  });
});
