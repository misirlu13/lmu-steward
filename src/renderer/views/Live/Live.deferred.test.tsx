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
import { liveIncidentsFixture } from '../../components/Live/liveFixtures';

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

// A fresh, undecided incident — the state the badge is counting.
const incident = liveIncidentsFixture[0];

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
  standings: [],
  incidents: [{ ...incident, drivers: [...incident.drivers] }],
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

const deferredDecision = (): Record<string, StewardDecision> => ({
  'a-deferral': {
    id: 'a-deferral',
    basis: 'incident',
    incidentId: incident.id,
    sessionKey: SESSION_KEY,
    sessionTrack: 'Bahrain',
    sessionType: 'RACE',
    involvedParties: [],
    stewardAuthor: 'Steward',
    decidedAt: 0,
    state: 'DEFERRED',
    status: 'provisional',
    revisions: [],
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

/** The count on the rail's Incidents link, scoped away from the header copy. */
const railBadge = () =>
  within(screen.getByRole('navigation')).queryByText(/^\d+$/);

describe('deferring an incident to post-session review', () => {
  it('should record a deferral as its own state, with no outcome', () => {
    renderLive();
    fireEvent.click(screen.getByText(incident.timestampLabel));

    fireEvent.click(
      screen.getByRole('button', { name: /Defer to post-session/ }),
    );

    expect(saveStewardDecision).toHaveBeenCalledTimes(1);
    const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;
    expect(saved.state).toBe('DEFERRED');
    // A deferral is the absence of a call, not a call of "nothing". Writing an
    // outcome here would put a finding in the export nobody made.
    expect(saved.outcome).toBeUndefined();
    expect(saved.incidentId).toBe(incident.id);
    expect(saved.sessionKey).toBe(SESSION_KEY);
  });

  it('should defer from the keyboard, on the incidents route', () => {
    renderLive();
    fireEvent.click(screen.getByText(incident.timestampLabel));

    fireEvent.keyDown(window, { key: 'd' });

    expect(saveStewardDecision).toHaveBeenCalledTimes(1);
    expect(
      (saveStewardDecision.mock.calls[0][0] as StewardDecision).state,
    ).toBe('DEFERRED');
  });

  it('should show the incident as deferred rather than flagged', () => {
    setDecisions(deferredDecision());
    renderLive();

    // The queue row and the dossier both have to read it the same way, or the
    // steward learns to distrust one of them.
    expect(screen.getByText('Deferred 1')).toBeInTheDocument();
    expect(screen.queryByText('Flagged 1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(incident.timestampLabel));
    expect(
      screen.getByText(/Held for post-session review/i),
    ).toBeInTheDocument();
  });

  /*
    The reason `DEFERRED` is worth having at all. A steward who has said "this
    one needs the replay" has finished with it for the session; a badge that
    kept counting it would never reach zero.
  */
  it('should drop a deferred incident out of the nav badge', () => {
    const { unmount } = renderLive();
    expect(railBadge()).toHaveTextContent('1');
    unmount();

    setDecisions(deferredDecision());
    renderLive();

    expect(railBadge()).toBeNull();
  });
});
