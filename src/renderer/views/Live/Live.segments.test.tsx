import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LiveShell } from './LiveShell';
import { LiveOverview } from './LiveOverview';
import { LiveIncidents } from './LiveIncidents';
import { useApi } from '../../providers/ApiContext';
import { DEFAULT_STEWARD_ACTIONS } from '../../utils/stewardActions';
import {
  buildIncidents,
  useLiveSessionData,
} from '../../hooks/useLiveSessionData';
import { sendMessage } from '../../utils/postMessage';
import {
  LiveCaptureDriver,
  LiveCaptureIncident,
  LiveIncidentRecord,
  LiveSessionSummary,
  StewardDecision,
} from '../../../../types';

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

const RACE_KEY = 'live|Laguna Seca|10|1800000000000';
const PRACTICE_KEY = 'live|Laguna Seca|1|1799990000000';
const QUALIFYING_KEY = 'live|Laguna Seca|5|1799995000000';

const captureDriver = (slotId: number, name: string): LiveCaptureDriver =>
  ({
    steamId: `7656119800000000${slotId}`,
    driverName: name,
    vehicleName: `#${slotId} Oreca`,
    vehicleClass: 'LMP2',
    place: slotId,
    lapsCompleted: 4,
    lastLapTime: 96.2,
    bestLapTime: 95.8,
    timeBehindLeader: 0,
    lapsBehindLeader: 0,
    penalties: 0,
    inPits: false,
    control: 0,
    flag: 0,
    pitStops: 0,
    finishStatus: 0,
    slotId,
  }) as LiveCaptureDriver;

const RACE_FIELD = [captureDriver(1, 'Race Driver A')];
const PRACTICE_FIELD = [
  captureDriver(1, 'Practice Driver A'),
  captureDriver(2, 'Practice Driver B'),
];

/** One incident live in the race, so "the queue changed" is unambiguous. */
const RACE_INCIDENTS: LiveCaptureIncident[] = [
  {
    id: 'live-1-1',
    persistedId: `${RACE_KEY}#race0001`,
    seq: 1,
    etSeconds: 900,
    lap: 8,
    kind: 'incident',
    objectStruck: 'Immovable',
    magnitude: 700,
    raw: 'Race Driver A reported contact with Immovable',
    parties: [{ slotId: 1, displayName: 'Race Driver A' }],
  } as unknown as LiveCaptureIncident,
];

const persistedIncident = (index: number): LiveIncidentRecord =>
  ({
    id: `${PRACTICE_KEY}#p${index}`,
    sessionKey: PRACTICE_KEY,
    occurredAt: 1_799_990_000_000 + index * 60_000,
    hasContext: false,
    incident: {
      id: `live-9-${index}`,
      seq: index,
      etSeconds: 120 * index,
      lap: index,
      kind: 'track-limits',
      raw: `Practice Driver ${index === 1 ? 'A' : 'B'} exceeded track limits`,
      parties: [
        {
          slotId: index,
          displayName: `Practice Driver ${index === 1 ? 'A' : 'B'}`,
        },
      ],
      warningPoints: 23.75,
    },
  }) as unknown as LiveIncidentRecord;

const PRACTICE_RECORDS = [persistedIncident(1), persistedIncident(2)];

const summary = (
  sessionKey: string,
  session: number,
  startedAt: number,
  incidentCount: number,
): LiveSessionSummary =>
  ({
    sessionKey,
    trackName: 'Laguna Seca',
    sessionType:
      session === 10 ? 'RACE' : session === 5 ? 'QUALIFY' : 'PRACTICE',
    session,
    startedAt,
    lastSeenAt: startedAt + 3_600_000,
    driverCount: 2,
    incidentCount,
    evidenceCount: 0,
    linkState: 'unlinked',
  }) as LiveSessionSummary;

const SEGMENTS = [
  summary(PRACTICE_KEY, 1, 1_799_990_000_000, 2),
  summary(QUALIFYING_KEY, 5, 1_799_995_000_000, 0),
  summary(RACE_KEY, 10, 1_800_000_000_000, 1),
];

let subscribers: Record<string, (payload: unknown) => void>;
let saveStewardDecision: jest.Mock;
let stewardDecisions: Record<string, StewardDecision>;

/*
  The second incident arrives already `DECIDED` with no decision record behind
  it — the shape the dev-mode fixtures use, and the one that made the rail badge
  read 7 against a queue showing 3. Anything counting "has no record" rather than
  "would still be NEW" counts it.
*/
const liveQueue = () => [
  ...buildIncidents(RACE_INCIDENTS, RACE_FIELD),
  {
    ...buildIncidents(RACE_INCIDENTS, RACE_FIELD)[0],
    id: `${RACE_KEY}#race0002`,
    rawText: 'Race Driver B already called',
    drivers: [
      {
        ...buildIncidents(RACE_INCIDENTS, RACE_FIELD)[0].drivers[0],
        displayName: 'Race Driver B',
      },
    ],
    state: 'DECIDED' as const,
  },
];

const pollResult = () => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'Laguna Seca',
      sessionType: 'RACE' as const,
    },
    drivers: RACE_FIELD,
    incidents: RACE_INCIDENTS,
    battles: [],
  },
  standings: [],
  incidents: liveQueue(),
  sessionKey: RACE_KEY,
});

beforeEach(() => {
  jest.clearAllMocks();
  subscribers = {};
  saveStewardDecision = jest.fn();
  stewardDecisions = {};

  useApiMock.mockImplementation(
    () =>
      ({
        isConnected: true,
        hasApiStatusResponse: true,
        liveSessionStatus: { state: 'live' },
        stewardDecisions,
        saveStewardDecision,
        stewardActions: DEFAULT_STEWARD_ACTIONS,
        subscribeToApiChannel: jest.fn(
          (channel: string, callback: (payload: unknown) => void) => {
            subscribers[channel] = callback;
            return jest.fn();
          },
        ),
      }) as unknown as ReturnType<typeof useApi>,
  );
  useLiveSessionDataMock.mockImplementation(
    () => pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

const renderLive = (at = '/live/incidents') =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/live" element={<LiveShell />}>
          <Route index element={<LiveOverview />} />
          <Route path="incidents" element={<LiveIncidents />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

const deliver = (payload: unknown) =>
  act(() => subscribers[CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS]?.(payload));

const deliverSegments = () =>
  deliver({
    status: 'success',
    data: {
      anchorSessionKey: RACE_KEY,
      segments: SEGMENTS,
      incidents: [],
      drivers: [],
    },
  });

const deliverPracticeRecord = () =>
  deliver({
    status: 'success',
    data: {
      anchorSessionKey: RACE_KEY,
      segments: SEGMENTS,
      recordFor: PRACTICE_KEY,
      incidents: PRACTICE_RECORDS,
      drivers: PRACTICE_FIELD,
    },
  });

/*
  These render the real `LiveShell`, the real provider and the real
  `useLiveSessionSegments` against a `subscribeToApiChannel` that records what
  was subscribed to. The unit tests below the seam all mock `useApi` wholesale,
  so a channel with no `messageBusHandlers` entry is invisible to them — the
  table-driven test in `ApiContext.integration.test.tsx` carries that half.
*/
describe('live session segments', () => {
  it('should ask for the weekend on its own channel', () => {
    renderLive();

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS,
      expect.objectContaining({ sessionKey: RACE_KEY }),
    );
  });

  it('should not draw a picker for a weekend that has only run one session', () => {
    renderLive();

    deliver({
      status: 'success',
      data: {
        anchorSessionKey: RACE_KEY,
        segments: [summary(RACE_KEY, 10, 1_800_000_000_000, 1)],
        incidents: [],
        drivers: [],
      },
    });

    expect(screen.queryByText('Practice 1')).not.toBeInTheDocument();
  });

  it('should label each segment from its raw session number', () => {
    renderLive();
    deliverSegments();

    expect(screen.getByText('Practice 1')).toBeInTheDocument();
    expect(screen.getByText('Qualifying 1')).toBeInTheDocument();
    expect(screen.getByText('Race')).toBeInTheDocument();
  });

  it('should ask for a segment’s record only once it is opened', () => {
    renderLive();
    deliverSegments();

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS,
      expect.objectContaining({ recordFor: PRACTICE_KEY }),
    );

    fireEvent.click(screen.getByText('Practice 1'));

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.GET_LIVE_SESSION_SEGMENTS,
      expect.objectContaining({ recordFor: PRACTICE_KEY }),
    );
  });

  it('should show the opened segment’s own incidents', () => {
    renderLive();
    deliverSegments();

    expect(screen.getByText(/Race Driver A/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Practice 1'));
    deliverPracticeRecord();

    expect(screen.getAllByText(/Practice Driver/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Race Driver A/)).not.toBeInTheDocument();
  });

  /*
    The whole point of the step. The poll runs at 1 Hz and rewrites the live
    incident list every tick; a record that read from it would be replaced a
    second after the steward opened it.
  */
  it('should not let the live poll overwrite an opened record', () => {
    renderLive();
    deliverSegments();

    fireEvent.click(screen.getByText('Practice 1'));
    deliverPracticeRecord();

    // Three more poll ticks, each handing down a fresh live array.
    act(() => {
      subscribers[CONSTANTS.API.GET_LIVE_SESSION_STATUS]?.({});
    });
    for (let tick = 0; tick < 3; tick += 1) {
      act(() => {
        useLiveSessionDataMock.mockImplementation(
          () =>
            pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
        );
      });
    }

    expect(screen.getAllByText(/Practice Driver/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Race Driver A/)).not.toBeInTheDocument();
  });

  it('should say out loud that a past segment is a record', () => {
    renderLive();
    deliverSegments();

    expect(
      screen.queryByText(/record, not a live feed/),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Practice 1'));
    deliverPracticeRecord();

    expect(screen.getByText(/record, not a live feed/)).toBeInTheDocument();
  });

  it('should return to the running session from the picker', () => {
    renderLive();
    deliverSegments();

    fireEvent.click(screen.getByText('Practice 1'));
    deliverPracticeRecord();

    fireEvent.click(screen.getByRole('button', { name: 'Back to live' }));

    expect(screen.getByText(/Race Driver A/)).toBeInTheDocument();
    expect(
      screen.queryByText(/record, not a live feed/),
    ).not.toBeInTheDocument();
  });

  /*
    A record's slot ids address whoever holds those slots in the session running
    now, so the camera would move to the wrong car and look like it worked.
  */
  it('should offer no camera focus against a record', () => {
    renderLive();
    deliverSegments();

    fireEvent.click(screen.getByText(/Race Driver A/));
    expect(screen.getAllByRole('button', { name: 'Focus' }).length).toBe(1);

    fireEvent.click(screen.getByText('Practice 1'));
    deliverPracticeRecord();
    fireEvent.click(screen.getAllByText(/Practice Driver/)[0]);

    expect(screen.queryByRole('button', { name: 'Focus' })).toBeNull();
  });

  /*
    A call made while reading practice is a call about practice. The record has
    to carry practice's key and practice's type, or it is filed against the race
    and read back as one.
  */
  it('should write a decision against the segment being reviewed', () => {
    renderLive();
    deliverSegments();

    fireEvent.click(screen.getByText('Practice 1'));
    deliverPracticeRecord();

    fireEvent.click(screen.getAllByText(/Practice Driver/)[0]);
    fireEvent.click(screen.getByRole('button', { name: /Flag for review/i }));

    expect(saveStewardDecision).toHaveBeenCalledTimes(1);
    const decision = saveStewardDecision.mock.calls[0][0] as StewardDecision;
    expect(decision.sessionKey).toBe(PRACTICE_KEY);
    expect(decision.sessionType).toBe('PRACTICE');
  });

  /*
    The watchlist is a live panel — its rows are the cars on track and its
    tallies come from the running session — so its steward-penalty column has to
    stay on the running session too. Taking it from the record put "1 steward"
    against a driver whose live row said nothing had happened, seen against a
    real Laguna practice.
  */
  it('should keep the watchlist’s penalty count on the running session', () => {
    stewardDecisions = {
      d1: {
        id: 'd1',
        /*
          A different practice incident from the one selected below. The dossier
          excludes the incident's own record from its history — citing itself as
          precedent — so a call on `#p1` would show nothing while `#p1` is open.
        */
        incidentId: `${PRACTICE_KEY}#p2`,
        sessionKey: PRACTICE_KEY,
        state: 'DECIDED',
        outcome: '5s Penalty',
        decidedAt: 1,
        involvedParties: [],
        target: {
          steamId: '76561198000000001',
          driverName: 'Practice Driver A',
        },
      } as unknown as StewardDecision,
    };

    renderLive('/live');
    deliverSegments();

    fireEvent.click(screen.getByText('Practice 1'));
    deliverPracticeRecord();

    /*
      The dossier's history follows the record...

      Scoped to the history row on purpose. Unscoped, `/5s Penalty/` also matches
      the tariff button of the same name, which is drawn whether or not the record
      was read at all — so the assertion passed without proving anything.
    */
    fireEvent.click(screen.getAllByText(/Practice Driver/)[0]);
    expect(
      within(screen.getByTestId('prior-calls-76561198000000001')).getByText(
        /5s Penalty/,
      ),
    ).toBeInTheDocument();

    // ...the watchlist beside the live field does not.
    expect(screen.queryByText('1 steward')).not.toBeInTheDocument();
  });

  /*
    The rail badge is the app's only persistent "there is work waiting" signal,
    so it stays on the running session while the queue shows a record. Every
    other count on screen follows the selection.
  */
  it('should keep the nav badge counting the running session', () => {
    renderLive();
    deliverSegments();

    fireEvent.click(screen.getByText('Practice 1'));
    deliverPracticeRecord();

    /*
      Two unreviewed in practice. The race has two incidents but only one is
      `NEW`, so the badge must read 1 — counting decision records alone would
      read 2, which is how this was found on screen.
    */
    expect(screen.getByText(/Practice 1 \(record\)/)).toBeInTheDocument();
    expect(screen.getByText(/2 unreviewed/)).toBeInTheDocument();

    const rail = screen.getByRole('navigation', {
      name: 'Live session sections',
    });
    expect(
      [...rail.querySelectorAll('.MuiBadge-badge')]
        .map((badge) => badge.textContent)
        .filter(Boolean),
    ).toEqual(['1']);
  });
});
