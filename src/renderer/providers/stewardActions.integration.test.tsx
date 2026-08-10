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
    onDecide,
  } = useLiveSession();

  useEffect(() => {
    onSelectIncident(incident.id);
  }, [onSelectIncident]);

  return (
    <LiveIncidentDossier
      incident={selectedIncident}
      onFlag={onFlag}
      onDecide={onDecide}
      targetSteamId={targetSteamId}
      onSelectTarget={onSelectTarget}
    />
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
