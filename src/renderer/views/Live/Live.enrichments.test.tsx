import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StewardDecision } from '@types';
import { LiveShell } from './LiveShell';
import { LiveOverview } from './LiveOverview';
import { LiveIncidents } from './LiveIncidents';
import { useApi } from '../../providers/ApiContext';
import { DEFAULT_STEWARD_ACTIONS } from '../../utils/stewardActions';
import { useLiveSessionData } from '../../hooks/useLiveSessionData';
import {
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

const SESSION_KEY = 'bahrain|10|1700000000';

/** inc-0012, a two-car contact between Drake and Lindqvist. */
const incident = liveIncidentsFixture[0];
/** A second row to move the selection to. */
const otherIncident = liveIncidentsFixture[1];
const [drake, lindqvist] = incident.drivers;

const pollResult = () => ({
  data: {
    status: {
      state: 'live' as const,
      trackName: 'Bahrain',
      sessionType: 'RACE' as const,
    },
    drivers: [],
    incidents: [],
  },
  standings: liveStandingsFixture,
  incidents: [
    { ...incident, drivers: [...incident.drivers] },
    { ...otherIncident, drivers: [...otherIncident.drivers] },
  ],
  sessionKey: SESSION_KEY,
});

const saveStewardDecision = jest.fn();

const setDecisions = (decisions: Record<string, StewardDecision>) => {
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: decisions,
    saveStewardDecision,
    stewardActions: DEFAULT_STEWARD_ACTIONS,
    subscribeToApiChannel: jest.fn(),
  } as unknown as ReturnType<typeof useApi>);
};

/** A call already on the books, against a driver and on another incident. */
const priorDecision = (
  over: Partial<StewardDecision> = {},
): Record<string, StewardDecision> => ({
  'prior-1': {
    id: 'prior-1',
    basis: 'incident',
    incidentId: 'inc-0004',
    sessionKey: SESSION_KEY,
    sessionTrack: 'Bahrain',
    sessionType: 'RACE',
    involvedParties: [
      { steamId: drake.steamId, driverName: drake.displayName },
      { steamId: lindqvist.steamId, driverName: lindqvist.displayName },
    ],
    target: { steamId: drake.steamId, driverName: drake.displayName },
    lapLabel: 'L12',
    /*
      The steward's own label, which is what a record now carries — no lookup
      turns this into display text, so what is stored here is what is printed.
    */
    outcome: '10s Penalty',
    stewardAuthor: 'Steward',
    decidedAt: 1,
    state: 'DECIDED',
    status: 'provisional',
    revisions: [],
    ...over,
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  setDecisions({});
  useLiveSessionDataMock.mockImplementation(
    () => pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

const liveRoutes = () => (
  <Routes>
    <Route path="/live" element={<LiveShell />}>
      <Route index element={<LiveOverview />} />
      <Route path="incidents" element={<LiveIncidents />} />
    </Route>
  </Routes>
);

const renderLive = (path = '/live/incidents') =>
  render(<MemoryRouter initialEntries={[path]}>{liveRoutes()}</MemoryRouter>);

const selectIncident = () =>
  fireEvent.click(screen.getByText(incident.timestampLabel));

const savedDecision = (): StewardDecision =>
  saveStewardDecision.mock.calls[0][0] as StewardDecision;

describe('optional reasoning on a live call', () => {
  it('should carry the typed reason onto the decision', () => {
    renderLive();
    selectIncident();

    fireEvent.change(screen.getByLabelText(/Reasoning \(optional\)/i), {
      target: { value: 'Late dive from too far back' },
    });
    fireEvent.click(screen.getByRole('button', { name: /No Action/ }));

    expect(savedDecision().reasoning).toBe('Late dive from too far back');
  });

  /*
    The draft lives in the provider precisely so this works. A steward who types
    a reason and then reaches for the shortcut would otherwise watch it vanish,
    which teaches them not to use one or the other.
  */
  it('should carry the typed reason through the keyboard path too', () => {
    renderLive();
    selectIncident();

    fireEvent.change(screen.getByLabelText(/Reasoning \(optional\)/i), {
      target: { value: 'Nothing in it' },
    });
    fireEvent.keyDown(window, { key: '4' });

    expect(savedDecision().reasoning).toBe('Nothing in it');
  });

  // A record that says "reasoning: (blank)" is not the same as one that says
  // nothing, and an export has to be able to tell them apart.
  it('should record nothing rather than an empty string', () => {
    renderLive();
    selectIncident();

    fireEvent.change(screen.getByLabelText(/Reasoning \(optional\)/i), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /No Action/ }));

    expect(savedDecision().reasoning).toBeUndefined();
  });

  // Parking an incident is the most common live action, and "why I parked it"
  // is worth as much as "why I called it".
  it('should carry the reason onto a deferral', () => {
    renderLive();
    selectIncident();

    fireEvent.change(screen.getByLabelText(/Reasoning \(optional\)/i), {
      target: { value: 'Needs the replay' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: /Defer to post-session/ }),
    );

    const saved = savedDecision();
    expect(saved.state).toBe('DEFERRED');
    expect(saved.reasoning).toBe('Needs the replay');
  });

  /*
    The shortcuts are bound to `window`, so without a guard "drive-through at
    turn 1" would issue a drive-through on the `3` and flag the incident on the
    `f` while the steward was still typing it.
  */
  it('should not fire shortcuts from inside the reasoning field', () => {
    renderLive();
    selectIncident();

    const field = screen.getByLabelText(/Reasoning \(optional\)/i);
    fireEvent.keyDown(field, { key: '3' });
    fireEvent.keyDown(field, { key: 'f' });
    fireEvent.keyDown(field, { key: 'd' });

    expect(saveStewardDecision).not.toHaveBeenCalled();

    // And still fires from anywhere else on the page.
    fireEvent.keyDown(window, { key: '4' });
    expect(saveStewardDecision).toHaveBeenCalledTimes(1);
  });

  it('should drop the draft once the call is written', () => {
    renderLive();
    selectIncident();

    fireEvent.change(screen.getByLabelText(/Reasoning \(optional\)/i), {
      target: { value: 'For this one only' },
    });
    fireEvent.click(screen.getByRole('button', { name: /No Action/ }));

    expect(screen.getByLabelText(/Reasoning \(optional\)/i)).toHaveValue('');
  });

  // A reason left over from the last incident is worse than none: it would be
  // written onto a call it was never about.
  it('should drop the draft when the steward moves to another incident', () => {
    renderLive();
    selectIncident();

    fireEvent.change(screen.getByLabelText(/Reasoning \(optional\)/i), {
      target: { value: 'For this one only' },
    });
    fireEvent.click(screen.getByText(otherIncident.timestampLabel));

    expect(screen.getByLabelText(/Reasoning \(optional\)/i)).toHaveValue('');
  });
});

describe('prior calls in the dossier', () => {
  it('should show a party history against the driver it was called on', () => {
    setDecisions(priorDecision());
    renderLive();
    selectIncident();

    expect(
      within(screen.getByTestId(`prior-calls-${drake.steamId}`)).getByText(
        'L12 · 10s Penalty',
      ),
    ).toBeInTheDocument();

    /*
      A penalty against one driver of a contact is a call about that driver
      only. Listing it under the other party would make an innocent driver look
      like a repeat offender.
    */
    expect(
      within(screen.getByTestId(`prior-calls-${lindqvist.steamId}`)).getByText(
        'None',
      ),
    ).toBeInTheDocument();
  });

  // A finding about the incident as a whole belongs to everyone who was in it.
  it('should show an untargeted finding against every party', () => {
    setDecisions(priorDecision({ target: undefined, outcome: 'No Action' }));
    renderLive();
    selectIncident();

    [drake, lindqvist].forEach((driver) => {
      expect(
        within(screen.getByTestId(`prior-calls-${driver.steamId}`)).getByText(
          'L12 · No Action',
        ),
      ).toBeInTheDocument();
    });
  });

  it('should ignore calls made in a different session', () => {
    setDecisions(priorDecision({ sessionKey: 'monza|10|1600000000' }));
    renderLive();
    selectIncident();

    expect(screen.queryByText(/Prior calls this session/i)).toBeNull();
  });
});

describe('watchlist penalties', () => {
  // Scoped by testid: every one of these drivers also appears in the attention
  // list and the field table on this page.
  const watchlistRow = (steamId: string) =>
    screen.getByTestId(`watchlist-${steamId}`);

  it('should count the steward own penalties alongside the game own', () => {
    setDecisions(priorDecision());
    renderLive('/live');

    /*
      Two different facts, kept apart. `outstandingPenalties` is what LMU is
      making a driver serve; the steward tally is what has been called against
      them, which the game knows nothing about. Summing them would double-count
      a call the steward also entered in-game.
    */
    expect(
      within(watchlistRow(drake.steamId)).getByText('1 steward'),
    ).toBeInTheDocument();
  });

  it('should show no steward count before any call is made', () => {
    renderLive('/live');

    expect(screen.queryByText(/\d+ steward/)).toBeNull();
    // The game's own penalties are unaffected — Okonkwo carries one in the
    // standings fixture.
    expect(screen.getAllByText('1 in-game').length).toBeGreaterThan(0);
  });

  // A "no action" is the steward clearing a driver, not penalising them.
  it('should not count an incident-scoped finding as a penalty', () => {
    setDecisions(priorDecision({ target: undefined, outcome: 'No Action' }));
    renderLive('/live');

    expect(screen.queryByText(/\d+ steward/)).toBeNull();
  });
});
