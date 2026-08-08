import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LiveShell } from './LiveShell';
import { LiveIncidents } from './LiveIncidents';
import { useApi } from '../../providers/ApiContext';
import { useLiveSessionData } from '../../hooks/useLiveSessionData';
import { sendMessage } from '../../utils/postMessage';
import {
  LiveIncident,
  liveIncidentsFixture,
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
  The seek target the whole feature turns on. `LiveIncident.etSeconds` is the
  same clock as LMU's `replaytime` — cross-checked against the game's own
  incident list on five real incidents, deltas 0–0.9 s and all of that the app's
  mm:ss rounding — so "rewatch this incident" needs no new data.
*/
const INCIDENT: LiveIncident = {
  ...liveIncidentsFixture[0],
  etSeconds: 2841.6,
  // Slots attached explicitly: the camera addresses a car by slot and nothing
  // else, and the layout fixtures predate them.
  drivers: liveIncidentsFixture[0].drivers.map((driver, index) => ({
    ...driver,
    slotId: index === 0 ? 14 : 21,
  })),
};

const [FIRST_PARTY, SECOND_PARTY] = INCIDENT.drivers;

const STANDINGS = liveStandingsFixture.map((standing, index) => ({
  ...standing,
  slotId: index + 1,
}));

const pollResult = () => ({
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
  standings: STANDINGS,
  incidents: [INCIDENT],
  sessionKey: 'bahrain|10|1700000000',
});

let isReplayActive: boolean | null = false;

beforeEach(() => {
  jest.clearAllMocks();
  isReplayActive = false;
  useApiMock.mockImplementation(
    () =>
      ({
        isConnected: true,
        hasApiStatusResponse: true,
        liveSessionStatus: { state: 'live' },
        isReplayActive,
        stewardDecisions: {},
        stewardActions: [],
        saveStewardDecision: jest.fn(),
        subscribeToApiChannel: () => () => {},
      }) as unknown as ReturnType<typeof useApi>,
  );
  useLiveSessionDataMock.mockImplementation(
    () => pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

const renderLive = () =>
  render(
    <MemoryRouter initialEntries={['/live/incidents']}>
      <Routes>
        <Route path="/live" element={<LiveShell />}>
          <Route path="incidents" element={<LiveIncidents />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const bar = () => within(screen.getByLabelText('Camera controls'));

const callsOn = (channel: string) =>
  sendMessageMock.mock.calls.filter(([sent]) => sent === channel);

const openTheDossier = () =>
  fireEvent.click(screen.getByText(INCIDENT.drivers[0].displayName));

describe('rewatching an incident from the live view', () => {
  /*
    One message, not three. The renderer never issues `toggleactive` itself:
    `isActive` has to be read first, the toggle has no setter to pair with it,
    and `replaytime` is inert until the toggle has landed. Sequencing that in
    the renderer would put a read-then-act race on the click path, so main owns
    the whole thing and the renderer states an intent.
  */
  it('should ask for the incident, not for a mode change and a seek', () => {
    renderLive();
    openTheDossier();

    fireEvent.click(screen.getByText('Rewatch'));

    expect(callsOn(CONSTANTS.API.POST_REPLAY_REWATCH)).toEqual([
      [
        CONSTANTS.API.POST_REPLAY_REWATCH,
        { etSeconds: INCIDENT.etSeconds, slotId: FIRST_PARTY.slotId },
      ],
    ]);
    expect(callsOn(CONSTANTS.API.PUT_REPLAY_COMMAND_TIME)).toHaveLength(0);
  });

  /*
    Reported from real use: rewinding without aiming the camera drops the steward
    at the right moment pointed at whatever they were last watching, so the
    incident is not on screen. The only workaround was to focus a driver and
    press Rewatch a second time — which is the app making the steward do the
    second half of its own job.
  */
  it('should aim the camera at a party to the incident', () => {
    renderLive();
    openTheDossier();

    fireEvent.click(screen.getByText('Rewatch'));

    const [[, payload]] = callsOn(CONSTANTS.API.POST_REPLAY_REWATCH);
    expect((payload as { slotId?: number }).slotId).toBe(FIRST_PARTY.slotId);
  });

  /*
    Unless the steward has said who they are interested in. Naming a penalty
    target and then having the camera swing to the other car would contradict
    them — the same preference the replay view's jump already makes.
  */
  it('should prefer the penalty target once one has been picked', () => {
    renderLive();
    openTheDossier();

    fireEvent.click(
      screen.getByTestId(`dossier-driver-${SECOND_PARTY.steamId}`),
    );
    fireEvent.click(screen.getByText('Rewatch'));

    const [[, payload]] = callsOn(CONSTANTS.API.POST_REPLAY_REWATCH);
    expect((payload as { slotId?: number }).slotId).toBe(SECOND_PARTY.slotId);
  });
});

describe('the footer while the game is showing a replay', () => {
  /*
    A live session has no speed, because nothing is being played back. The
    control is absent rather than disabled — the same rule the rest of this bar
    follows — and it appears only on the game's own word.
  */
  it('should carry no speed control while the picture is live', () => {
    renderLive();

    expect(bar().queryByLabelText('Replay speed')).not.toBeInTheDocument();
    expect(bar().queryByText('View live')).not.toBeInTheDocument();
  });

  it('should offer speed and a way back once the game says it is rewound', () => {
    isReplayActive = true;
    renderLive();

    expect(bar().getByLabelText('Replay speed')).toBeInTheDocument();
    expect(bar().getByText('View live')).toBeInTheDocument();
  });

  /*
    The honesty requirement, and the reason this strip exists at all. Scoring
    does not follow the picture: standings, timing, the track map and the
    pressure monitor keep showing the running session while the game shows
    something from minutes ago. The plan ruled that a half-moved view is worse
    than either whole one, which leaves saying so as the only option left.
  */
  it('should say that only the picture has moved', () => {
    isReplayActive = true;
    renderLive();

    expect(bar().getByText(/timing stays live/i)).toBeInTheDocument();
  });

  /*
    The measured ladder. Each rung is one command sent outright rather than a
    step towards a rate: none of the three is cumulative — three `SLOW`s in a
    row still read 0.5x, three `FORWARDSCAN`s still read 2x — so a control that
    nudged would sit on the wrong number for the rest of the session.

    Walked in sequence rather than case by case because the group is exclusive:
    clicking the rung already selected deselects instead of re-sending, which is
    also why 1x has to be reached from somewhere else.
  */
  it('should send each rung of the speed ladder as its own command', () => {
    isReplayActive = true;
    renderLive();
    const sent = () =>
      callsOn(CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN).at(-1)?.[1];

    fireEvent.click(bar().getByText('x0.5'));
    expect(sent()).toBe(CONSTANTS.REPLAY_COMMANDS.SCAN.SLOW);

    fireEvent.click(bar().getByText('x2.0'));
    expect(sent()).toBe(CONSTANTS.REPLAY_COMMANDS.SCAN.FORWARD_SCAN);

    fireEvent.click(bar().getByText('x1.0'));
    expect(sent()).toBe(CONSTANTS.REPLAY_COMMANDS.SCAN.PLAY);
  });

  /*
    "View live" states an intent too. It cannot be a bare toggle: pressed while
    already live — which is reachable, because the steward can use LMU's own
    LIVE button — a toggle would rewind the picture into a replay.
  */
  it('should ask to return to live rather than toggling', () => {
    isReplayActive = true;
    renderLive();

    fireEvent.click(bar().getByText('View live'));

    expect(callsOn(CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE)).toEqual([
      [CONSTANTS.API.POST_REPLAY_RETURN_TO_LIVE, undefined],
    ]);
  });

  // Unknown is not false. A game that will not answer must not be told to
  // toggle on the strength of a guess.
  it('should show nothing when the game will not say', () => {
    isReplayActive = null;
    renderLive();

    expect(bar().queryByText('View live')).not.toBeInTheDocument();
  });
});
