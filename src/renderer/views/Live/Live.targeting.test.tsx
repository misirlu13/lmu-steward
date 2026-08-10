import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
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

// A two-car contact, so nothing is auto-targeted and the steward must choose.
const contact = liveIncidentsFixture[0];

/**
 * The live view is fed by a 1Hz poll that hands it a brand-new incidents array
 * every tick, with identical content. Anything derived from that array's
 * identity is at the mercy of the next tick.
 */
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
  // Fresh object identities, same content — exactly what a poll produces.
  incidents: [{ ...contact, drivers: [...contact.drivers] }],
});

beforeEach(() => {
  jest.clearAllMocks();
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: {},
    saveStewardDecision: jest.fn(),
    stewardActions: DEFAULT_STEWARD_ACTIONS,
    // The dossier pulls the captured trace on demand rather than reading it
    // off the polled incident, so it subscribes even when there is nothing to
    // fetch.
    subscribeToApiChannel: jest.fn(),
  } as unknown as ReturnType<typeof useApi>);
  useLiveSessionDataMock.mockReturnValue(
    pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

/*
  The real route tree, not the incidents section on its own. Selection now
  lives in the provider at the shell, so a test that mounted only one section
  could not tell whether it survives a navigation.
*/
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

// The queue row is identified by its timestamp. The driver name appears in the
// queue, the dossier, the measurements table and the trace labels, so the
// dossier chip is addressed directly rather than by DOM order.
const selectIncidentAndDriver = () => {
  fireEvent.click(screen.getByText(contact.timestampLabel));
  fireEvent.click(
    screen.getByTestId(`dossier-driver-${contact.drivers[0].steamId}`),
  );
};

/** The dossier's footer line, which names whoever a penalty would land on. */
const targetLine = () =>
  screen.queryByText(
    new RegExp(`Penalty applies to ${contact.drivers[0].displayName}`, 'i'),
  );

describe('live decision targeting', () => {
  it('should keep the selected driver when the incident list is replaced', () => {
    const { rerender } = renderLive();

    selectIncidentAndDriver();
    expect(targetLine()).toBeInTheDocument();

    // Simulate the next poll: same incidents, new array and object identities.
    useLiveSessionDataMock.mockReturnValue(
      pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
    );
    rerender(
      <MemoryRouter initialEntries={['/live/incidents']}>
        {liveRoutes()}
      </MemoryRouter>,
    );

    // Before the fix this reverted to "Select a driver above" a second after
    // the steward chose one.
    expect(targetLine()).toBeInTheDocument();
  });

  it('should clear the target when the steward moves to another incident', () => {
    const twoIncidents = {
      ...pollResult(),
      incidents: [
        { ...contact },
        {
          ...liveIncidentsFixture[1],
          drivers: [...liveIncidentsFixture[1].drivers],
        },
      ],
    };
    useLiveSessionDataMock.mockReturnValue(
      twoIncidents as unknown as ReturnType<typeof useLiveSessionData>,
    );

    renderLive();
    selectIncidentAndDriver();

    fireEvent.click(screen.getByText(liveIncidentsFixture[1].timestampLabel));

    expect(screen.getByText(/select a driver above/i)).toBeInTheDocument();
  });
});

describe('live shell navigation', () => {
  it('should keep the selected incident and target across a section change', () => {
    renderLive();

    selectIncidentAndDriver();
    expect(targetLine()).toBeInTheDocument();

    // Out to the overview and back, via the rail the steward would use.
    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Incidents'));

    expect(targetLine()).toBeInTheDocument();
  });

  it('should open the incident queue on an incident chosen from the overview', () => {
    renderLive('/live');

    // The overview is a summary, so choosing something from it is a request to
    // go and work on it.
    fireEvent.click(screen.getByText(contact.timestampLabel));

    expect(screen.getByText('Incident Dossier')).toBeInTheDocument();
    /*
      Identified by its parties rather than by its id, which the header no
      longer prints — a store primary key was nothing a steward could use. The
      assertion still has to name *which* incident opened, or the test would
      pass on any dossier at all.
    */
    expect(
      screen.getByTestId(`dossier-driver-${contact.drivers[0].steamId}`),
    ).toBeInTheDocument();
  });
});
