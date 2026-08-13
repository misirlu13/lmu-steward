import React, { useEffect } from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import {
  LiveCaptureDriver,
  LiveDataForReplay,
  LiveIncidentRecord,
  StewardDecision,
} from '@types';
import { ApiProvider } from './ApiContext';
import { LiveSessionProvider, useLiveSession } from './LiveSessionContext';
import { LiveIncidentDossier } from '../components/Live/LiveIncidentDossier';
import { ReplayIncidentDossier } from '../components/Replay/ReplayIncidentDossier';
import { ReplayIncidentEvent } from '../components/Replay/replayTimelineTypes';
import { useLiveSessionData } from '../hooks/useLiveSessionData';
import { useLiveIncidentContext } from '../hooks/useLiveIncidentContext';
import { liveIncidentsFixture } from '../components/Live/liveFixtures';
import { initializeMessageBus, sendMessage } from '../utils/postMessage';

/*
  The real `ApiProvider`, for the reason `stewardAuthor.integration.test.tsx`
  spells out: every other renderer test mocks `useApi` wholesale, which hands the
  same value to every consumer by construction and so cannot catch the defect
  this file is about.

  And this is the larger case of the two. One configured tariff reaches *four*
  places — the buttons the live dossier draws, the buttons the replay dossier
  draws, and the "does this need a target driver" guard on each of the two decide
  paths. Any of them growing a list of its own is a live session where a button
  offers a penalty the guard then refuses, or vice versa.

  Only the live poll and the incident context are stubbed; neither is on the path
  under test.
*/
jest.mock('../hooks/useLiveSessionData', () => ({
  ...jest.requireActual('../hooks/useLiveSessionData'),
  useLiveSessionData: jest.fn(),
}));
jest.mock('../hooks/useLiveIncidentContext', () => ({
  useLiveIncidentContext: jest.fn(),
}));
jest.mock('../utils/postMessage', () => ({
  initializeMessageBus: jest.fn(),
  sendMessage: jest.fn(),
}));

const initializeMessageBusMock = initializeMessageBus as jest.MockedFunction<
  typeof initializeMessageBus
>;
const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;
const useLiveSessionDataMock = useLiveSessionData as jest.MockedFunction<
  typeof useLiveSessionData
>;
const useLiveIncidentContextMock =
  useLiveIncidentContext as jest.MockedFunction<typeof useLiveIncidentContext>;

const SESSION_KEY = 'live|WeatherTech Raceway Laguna Seca|10|1785798030000';

let handlers: Record<string, (data: unknown) => void> = {};

const savedDecisions = (): StewardDecision[] =>
  sendMessageMock.mock.calls
    .filter(([channel]) => channel === CONSTANTS.API.POST_STEWARD_DECISION)
    .map(([, payload]) => payload as StewardDecision);

const applySettings = (stewardActions: unknown) => {
  act(() => {
    handlers[CONSTANTS.API.GET_USER_SETTINGS]?.({
      status: 'success',
      data: { stewardActions },
    });
  });
};

/** A league that uses none of the shipped wording. */
const LEAGUE_TARIFF = [
  { id: 'l-1', label: 'DT', driverScoped: true },
  { id: 'l-2', label: '30s + 2 Points', driverScoped: true },
  { id: 'l-3', label: 'Racing Incident', driverScoped: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  handlers = {};
  initializeMessageBusMock.mockImplementation((messageBusHandlers) => {
    handlers = messageBusHandlers as Record<string, (data: unknown) => void>;
  });
});

/* ------------------------------------------------------------------ live */

const incident = liveIncidentsFixture[0];

const pollResult = () => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'WeatherTech Raceway Laguna Seca',
      sessionType: 'RACE' as const,
    },
    drivers: [],
    incidents: [],
  },
  standings: [],
  incidents: [{ ...incident, drivers: [...incident.drivers] }],
  sessionKey: SESSION_KEY,
});

/**
 * The live dossier with the shell's own wiring behind it, so the buttons on
 * screen and the guard the click passes through are the real pair.
 */
const LiveTariff = () => {
  const {
    selectedIncident,
    targetSteamId,
    onSelectIncident,
    onSelectTarget,
    onFlag,
    onDefer,
    onDecide,
    unreviewedCount,
  } = useLiveSession();

  useEffect(() => {
    onSelectIncident(incident.id);
  }, [onSelectIncident]);

  return (
    <>
      {/*
        The shell's header is not rendered here, so the count it would show is
        surfaced directly off the provider — which is where it is derived and
        what these tests are actually about.
      */}
      <span data-testid="unreviewed">{unreviewedCount}</span>
      <LiveIncidentDossier
        incident={selectedIncident}
        onFlag={onFlag}
        onDefer={onDefer}
        onDecide={onDecide}
        targetSteamId={targetSteamId}
        onSelectTarget={onSelectTarget}
      />
    </>
  );
};

const renderLiveTariff = () => {
  useLiveSessionDataMock.mockImplementation(
    () => pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );
  useLiveIncidentContextMock.mockReturnValue({
    context: undefined,
  } as unknown as ReturnType<typeof useLiveIncidentContext>);

  return render(
    <ApiProvider>
      <MemoryRouter initialEntries={['/live/incidents']}>
        <LiveSessionProvider>
          <LiveTariff />
        </LiveSessionProvider>
      </MemoryRouter>
    </ApiProvider>,
  );
};

/* ---------------------------------------------------------------- replay */

const captureDriver = (slotId: number, driverName: string): LiveCaptureDriver =>
  ({
    slotId,
    steamId: `7656119800000000${slotId}`,
    driverName,
    vehicleName: `#${slotId} Car`,
    vehicleClass: 'Hyper',
    place: slotId,
    lapsCompleted: 3,
    lastLapTime: 95,
    timeBehindLeader: 0,
    lapsBehindLeader: 0,
    penalties: 0,
    inPits: false,
    control: 2,
    flag: 0,
    pitStops: 0,
    finishStatus: 0,
  }) as LiveCaptureDriver;

const RECORD_ID = `${SESSION_KEY}#abc123def456`;

const record: LiveIncidentRecord = {
  id: RECORD_ID,
  sessionKey: SESSION_KEY,
  occurredAt: 1785798030000,
  hasContext: true,
  incident: {
    id: 'live-1-33',
    kind: 'incident',
    etSeconds: 1434.4,
    raw: '<Incident et="1434.4">Antares Au(13) reported contact (230.22) with another vehicle Rui Andrade(22)</Incident>',
    parties: [
      { slotId: 13, displayName: 'Antares Au' },
      { slotId: 22, displayName: 'Rui Andrade' },
    ],
    objectStruck: 'another vehicle',
    magnitude: 230.22,
    evidence: { offTrackSlotIds: [], cars: [] },
  },
} as unknown as LiveIncidentRecord;

const liveDataForReplay: LiveDataForReplay = {
  sessionKey: SESSION_KEY,
  trackName: 'WeatherTech Raceway Laguna Seca',
  sessionType: 'PRACTICE',
  startedAt: 1785798030000,
  incidents: [record],
  drivers: [captureDriver(13, 'Antares Au'), captureDriver(22, 'Rui Andrade')],
} as unknown as LiveDataForReplay;

const replayEvent: ReplayIncidentEvent = {
  id: 'collision-4-1434.4',
  type: 'collision',
  timestampLabel: '23:54.4',
  lapLabel: 'Lap 12',
  drivers: [],
  etSeconds: 1434.4,
  liveIncidentId: RECORD_ID,
  hasLiveContext: true,
} as unknown as ReplayIncidentEvent;

const renderReplayTariff = () => {
  useLiveIncidentContextMock.mockReturnValue({
    context: undefined,
  } as unknown as ReturnType<typeof useLiveIncidentContext>);

  return render(
    <ApiProvider>
      <ReplayIncidentDossier
        event={replayEvent}
        liveData={liveDataForReplay}
        replayHash="hash-p1-7"
      />
    </ApiProvider>,
  );
};

/** The tariff row as it is actually drawn, keyed by nothing but its text. */
const tariffLabels = (): string[] =>
  screen
    .getAllByRole('button')
    .map((button) => button.textContent ?? '')
    .filter((text) =>
      [...LEAGUE_TARIFF, { label: '5s Penalty' }, { label: 'No Action' }].some(
        (action) => text.startsWith(action.label),
      ),
    );

/* ----------------------------------------------------------------- tests */

describe('the tariff a dossier offers', () => {
  it('should be the configured one, in the live dossier', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    expect(tariffLabels()).toEqual([
      'DT1',
      '30s + 2 Points2',
      'Racing Incident3',
    ]);
    expect(screen.queryByRole('button', { name: /5s Penalty/ })).toBeNull();
  });

  it('should be the configured one, in the replay dossier', () => {
    renderReplayTariff();
    applySettings(LEAGUE_TARIFF);

    expect(tariffLabels()).toEqual([
      'DT1',
      '30s + 2 Points2',
      'Racing Incident3',
    ]);
    expect(screen.queryByRole('button', { name: /5s Penalty/ })).toBeNull();
  });

  /*
    The defect this file exists for. A call made live and the same call revised
    post-session must be offered one vocabulary — the moment either surface grows
    a list of its own, a steward reviewing their own practice call finds the
    action they used is no longer on the panel.
  */
  it('should be the same list on both, from one setting', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);
    const live = tariffLabels();

    screen.getByText('DT');

    renderReplayTariff();
    applySettings(LEAGUE_TARIFF);

    // Both dossiers are mounted now, so each label appears exactly twice.
    expect(tariffLabels()).toEqual([...live, ...live]);
  });

  it('should fall back to the shipped tariff when nothing is configured', () => {
    renderLiveTariff();
    applySettings(null);

    expect(
      screen.getByRole('button', { name: /5s Penalty/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Note Only/ }),
    ).toBeInTheDocument();
  });
});

describe('a call written under a configured action', () => {
  it('should store the label as the outcome, from the live dossier', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    fireEvent.click(screen.getByRole('button', { name: /Racing Incident/ }));

    expect(savedDecisions()).toHaveLength(1);
    expect(savedDecisions()[0].outcome).toBe('Racing Incident');
  });

  it('should store the label as the outcome, from the replay dossier', () => {
    renderReplayTariff();
    applySettings(LEAGUE_TARIFF);

    fireEvent.click(screen.getByRole('button', { name: /Racing Incident/ }));

    expect(savedDecisions()).toHaveLength(1);
    expect(savedDecisions()[0].outcome).toBe('Racing Incident');
  });

  /*
    The check the original fixed union existed for, now that the vocabulary is a
    league's own: a user-defined penalty still refuses to be recorded against a
    two-car incident with nobody named. Asserted through the button's disabled
    state and the guard together, because the two are supposed to agree.
  */
  it('should refuse a configured penalty with no driver named', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    const penalty = screen.getByRole('button', { name: /30s \+ 2 Points/ });
    expect(penalty).toBeDisabled();

    // The keyboard path is not disabled by anything on screen, so it has to hold
    // the line itself.
    fireEvent.keyDown(window, { key: '2' });

    expect(savedDecisions()).toHaveLength(0);
  });

  // An incident-scoped action needs no target, exactly as the shipped set's
  // "No Action" did — which is what makes the flag worth configuring.
  it('should allow a configured incident-scoped action with no driver named', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    expect(
      screen.getByRole('button', { name: /Racing Incident/ }),
    ).toBeEnabled();
  });

  /*
    Both halves of the keyboard path come off the configured order, so a
    reordered tariff moves its keys with it. `3` is the third action, whatever it
    is called.
  */
  it('should take its keyboard shortcuts from the configured order', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    fireEvent.keyDown(window, { key: '3' });

    expect(savedDecisions()).toHaveLength(1);
    expect(savedDecisions()[0].outcome).toBe('Racing Incident');
  });

  it('should bind no key past the end of the configured list', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    fireEvent.keyDown(window, { key: '4' });

    expect(savedDecisions()).toHaveLength(0);
  });

  // Settings arriving after the app is up must reach a call made afterwards, or
  // an edited tariff only takes effect on the next launch.
  it('should pick up a tariff changed mid-session', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    act(() => {
      handlers[CONSTANTS.API.POST_USER_SETTINGS]?.({
        status: 'success',
        data: {
          stewardActions: [
            { id: 'n-1', label: 'Reprimand', driverScoped: false },
          ],
        },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: /Reprimand/ }));

    expect(savedDecisions()[0].outcome).toBe('Reprimand');
  });
});

/*
  A call is keyed on its target and a flag is keyed on the incident, so the two
  records never collided — and `applyDecisions` ranks a decision above a flag.
  The flag was written, stored, and then never seen again, which on screen was a
  decision that could not be removed and a flag that refused to select.
*/
describe('changing your mind after a call', () => {
  /** The head state each record was last written with, newest write per id. */
  const stateById = (): Record<string, string> =>
    savedDecisions().reduce<Record<string, string>>((states, decision) => {
      // eslint-disable-next-line no-param-reassign
      states[decision.id] = decision.state;
      return states;
    }, {});

  const callAgainstFirstDriver = () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    fireEvent.click(
      screen.getByTestId(`dossier-driver-${incident.drivers[0].steamId}`),
    );
    fireEvent.click(screen.getByRole('button', { name: /DT/ }));
  };

  it('should withdraw the call when the incident is flagged for review', () => {
    callAgainstFirstDriver();
    const call = savedDecisions()[0];
    expect(call.state).toBe('DECIDED');
    expect(call.outcome).toBe('DT');

    fireEvent.click(screen.getByRole('button', { name: /Flag for review/ }));

    // The call itself is revised, not left standing beside the flag.
    const withdrawn = savedDecisions().filter(
      (decision) => decision.id === call.id,
    );
    expect(withdrawn[withdrawn.length - 1]).toMatchObject({
      state: 'FLAGGED',
      outcome: undefined,
    });

    // And nothing anywhere still reads as decided.
    expect(Object.values(stateById())).not.toContain('DECIDED');
  });

  it('should withdraw the call when the incident is deferred', () => {
    callAgainstFirstDriver();
    const call = savedDecisions()[0];

    fireEvent.click(
      screen.getByRole('button', { name: /Defer to post-session/ }),
    );

    const withdrawn = savedDecisions().filter(
      (decision) => decision.id === call.id,
    );
    expect(withdrawn[withdrawn.length - 1]).toMatchObject({
      state: 'DEFERRED',
      outcome: undefined,
    });
    expect(Object.values(stateById())).not.toContain('DECIDED');
  });

  /*
    The withdrawal is a revision of the original record, not a new one. Losing
    the id would lose the trail — "DT, then withdrawn and flagged" is exactly
    what an appeal reads — and the decision layer never deletes.
  */
  it('should keep the withdrawn call under its original id', () => {
    callAgainstFirstDriver();
    const call = savedDecisions()[0];

    fireEvent.click(screen.getByRole('button', { name: /Flag for review/ }));

    expect(
      savedDecisions().filter((decision) => decision.id === call.id).length,
    ).toBeGreaterThan(1);
    expect(call.target?.steamId).toBe(incident.drivers[0].steamId);
  });

  // Deciding after a flag is the ordinary direction and must still settle it.
  it('should let a call replace a flag', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    fireEvent.click(screen.getByRole('button', { name: /Flag for review/ }));
    fireEvent.click(screen.getByRole('button', { name: /Racing Incident/ }));

    expect(Object.values(stateById())).toContain('DECIDED');
  });
});

/*
  Every control on this screen is a toggle, and a button that lights up and then
  refuses to light down reads as stuck. Taking a call back is `WITHDRAWN` rather
  than a deletion because the decision layer never deletes — the record and its
  revisions are what a call is defended by under appeal, and "five seconds, then
  withdrawn" is a more useful trail than a row that quietly disappeared.
*/
describe('taking a call back', () => {
  const stateById = (): Record<string, string> =>
    savedDecisions().reduce<Record<string, string>>((states, decision) => {
      // eslint-disable-next-line no-param-reassign
      states[decision.id] = decision.state;
      return states;
    }, {});

  /** What the incident reads as once every record is applied. */
  const standingStates = () =>
    Object.values(stateById()).filter((state) => state !== 'WITHDRAWN');

  const press = (name: RegExp) =>
    fireEvent.click(screen.getByRole('button', { name }));

  it('should clear a deferral when defer is pressed again', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    press(/Defer to post-session/);
    expect(standingStates()).toContain('DEFERRED');

    press(/Defer to post-session/);

    expect(standingStates()).toHaveLength(0);
  });

  it('should clear a flag when flag is pressed again', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    press(/Flag for review/);
    press(/Flag for review/);

    expect(standingStates()).toHaveLength(0);
  });

  it('should clear a call when the same action is pressed again', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    press(/Racing Incident/);
    expect(standingStates()).toContain('DECIDED');

    press(/Racing Incident/);

    expect(standingStates()).toHaveLength(0);
  });

  // A withdrawn record carries no outcome — the call is the thing being taken
  // back, and leaving it on would keep it in every export.
  it('should drop the outcome from a withdrawn call', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    press(/Racing Incident/);
    press(/Racing Incident/);

    const last = savedDecisions()[savedDecisions().length - 1];
    expect(last.state).toBe('WITHDRAWN');
    expect(last.outcome).toBeUndefined();
  });

  /*
    The commoner correction, and it must not be mistaken for a toggle: pressing
    a *different* action replaces the call rather than clearing it.
  */
  it('should replace rather than clear when a different action is pressed', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    press(/Racing Incident/);
    fireEvent.click(
      screen.getByTestId(`dossier-driver-${incident.drivers[0].steamId}`),
    );
    press(/DT/);

    const last = savedDecisions()[savedDecisions().length - 1];
    expect(last.state).toBe('DECIDED');
    expect(last.outcome).toBe('DT');
  });

  // The record survives its own withdrawal, under the id it was made with.
  it('should keep the withdrawn record rather than deleting it', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    press(/Racing Incident/);
    const call = savedDecisions()[0];
    press(/Racing Incident/);

    const forCall = savedDecisions().filter(
      (decision) => decision.id === call.id,
    );
    expect(forCall.length).toBeGreaterThan(1);
    expect(forCall[forCall.length - 1].state).toBe('WITHDRAWN');
  });

  // And the incident can be called again afterwards, which is the point of
  // clearing it.
  it('should let the incident be called again after being cleared', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    press(/Racing Incident/);
    press(/Racing Incident/);
    press(/Racing Incident/);

    expect(standingStates()).toContain('DECIDED');
  });

  /*
    The count has to follow. An incident whose call has been taken back is
    waiting to be looked at again, and the header is what says so — a withdrawn
    record still counting as reviewed would hide work the steward has explicitly
    re-opened.
  */
  it('should count the incident as unreviewed again once cleared', () => {
    renderLiveTariff();
    applySettings(LEAGUE_TARIFF);

    const unreviewed = () => screen.getByTestId('unreviewed').textContent;
    expect(unreviewed()).toBe('1');

    press(/Racing Incident/);
    expect(unreviewed()).toBe('0');

    press(/Racing Incident/);

    expect(unreviewed()).toBe('1');
  });
});
