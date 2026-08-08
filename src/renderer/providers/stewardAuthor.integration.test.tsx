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
import { ReplayIncidentDossier } from '../components/Replay/ReplayIncidentDossier';
import { ReplayIncidentEvent } from '../components/Replay/replayTimelineTypes';
import { useLiveSessionData } from '../hooks/useLiveSessionData';
import { useLiveIncidentContext } from '../hooks/useLiveIncidentContext';
import { liveIncidentsFixture } from '../components/Live/liveFixtures';
import { initializeMessageBus, sendMessage } from '../utils/postMessage';

/*
  The real `ApiProvider`, deliberately. Every other renderer test mocks `useApi`
  wholesale, which makes them structurally incapable of catching what this file
  is for: the steward's name is one value that reaches decision records from two
  unrelated call sites, and a mocked `useApi` would supply it to both by hand.

  Only the two data sources below are stubbed — the live poll and the incident
  context — because neither is on the path being tested.
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

/** Every decision the renderer asked main to persist, in order. */
const savedDecisions = (): StewardDecision[] =>
  sendMessageMock.mock.calls
    .filter(([channel]) => channel === CONSTANTS.API.POST_STEWARD_DECISION)
    .map(([, payload]) => payload as StewardDecision);

const applySettings = (stewardAuthorName: unknown) => {
  act(() => {
    handlers[CONSTANTS.API.GET_USER_SETTINGS]?.({
      status: 'success',
      data: { stewardAuthorName },
    });
  });
};

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
 * Drives the live call the way a keypress does, without the shell around it —
 * what is under test is which name `LiveSessionContext` writes, not the queue.
 */
const LiveDecider = () => {
  const { onDecide, onSelectIncident } = useLiveSession();

  useEffect(() => {
    onSelectIncident(incident.id);
  }, [onSelectIncident]);

  return (
    <button type="button" onClick={() => onDecide(incident.id, 'no-action')}>
      call it
    </button>
  );
};

const renderLiveDecider = () => {
  useLiveSessionDataMock.mockImplementation(
    () => pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );

  return render(
    <ApiProvider>
      <MemoryRouter initialEntries={['/live/incidents']}>
        <LiveSessionProvider>
          <LiveDecider />
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

const renderReplayDossier = () => {
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

/* ----------------------------------------------------------------- tests */

describe('the steward author on a new decision', () => {
  it('should be the name from settings, on a live call', () => {
    renderLiveDecider();
    applySettings('Bradley');

    fireEvent.click(screen.getByRole('button', { name: 'call it' }));

    expect(savedDecisions()).toHaveLength(1);
    expect(savedDecisions()[0].stewardAuthor).toBe('Bradley');
  });

  it('should be the name from settings, on a replay review', () => {
    renderReplayDossier();
    applySettings('Bradley');

    fireEvent.click(screen.getByRole('button', { name: /No Action/ }));

    expect(savedDecisions()).toHaveLength(1);
    expect(savedDecisions()[0].stewardAuthor).toBe('Bradley');
  });

  /*
    The defect this whole file exists for. Two call sites deriving one value
    independently is how the last two bugs in this plan got shipped, so the
    thing worth asserting is not "each side is right" but "the two agree" —
    which fails the moment either grows a constant of its own.
  */
  it('should be the same on both, from one setting', () => {
    renderLiveDecider();
    applySettings('Race Control');
    fireEvent.click(screen.getByRole('button', { name: 'call it' }));

    const [live] = savedDecisions();

    sendMessageMock.mockClear();

    renderReplayDossier();
    applySettings('Race Control');
    fireEvent.click(screen.getByRole('button', { name: /No Action/ }));

    const [replay] = savedDecisions();

    expect(live.stewardAuthor).toBe(replay.stewardAuthor);
    expect(live.stewardAuthor).toBe('Race Control');
  });

  it.each([
    ['blank', ''],
    ['whitespace only', '   '],
    ['never set', undefined],
  ])(
    'should never be empty when the setting is %s',
    (_case, stewardAuthorName) => {
      renderLiveDecider();
      applySettings(stewardAuthorName);

      fireEvent.click(screen.getByRole('button', { name: 'call it' }));

      expect(savedDecisions()[0].stewardAuthor).toBe('Steward');
    },
  );

  // Settings arriving after the app is up must reach a call made afterwards,
  // or the name only takes effect on the next launch.
  it('should pick up a name changed mid-session', () => {
    renderLiveDecider();
    applySettings('Bradley');

    act(() => {
      handlers[CONSTANTS.API.POST_USER_SETTINGS]?.({
        status: 'success',
        data: { stewardAuthorName: 'Someone Else' },
      });
    });

    fireEvent.click(screen.getByRole('button', { name: 'call it' }));

    expect(savedDecisions()[0].stewardAuthor).toBe('Someone Else');
  });
});
