import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { LiveView } from './Live';
import { useApi } from '../providers/ApiContext';
import { useLiveSessionData } from '../hooks/useLiveSessionData';
import { liveIncidentsFixture } from '../components/Live/liveFixtures';

jest.mock('../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../hooks/useLiveSessionData', () => ({
  ...jest.requireActual('../hooks/useLiveSessionData'),
  useLiveSessionData: jest.fn(),
}));
jest.mock('../utils/postMessage', () => ({ sendMessage: jest.fn() }));

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
  } as unknown as ReturnType<typeof useApi>);
  useLiveSessionDataMock.mockReturnValue(
    pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

const renderLive = () =>
  render(
    <MemoryRouter>
      <LiveView />
    </MemoryRouter>,
  );

// The queue row is identified by its timestamp. The driver name appears in the
// queue, the dossier, the measurements table and the trace labels, so the
// dossier chip is addressed directly rather than by DOM order.
const selectIncidentAndDriver = () => {
  fireEvent.click(screen.getByText(contact.timestampLabel));
  fireEvent.click(
    screen.getByTestId(`dossier-driver-${contact.drivers[0].steamId}`),
  );
};

describe('live decision targeting', () => {
  it('should keep the selected driver when the incident list is replaced', () => {
    const { rerender } = renderLive();

    selectIncidentAndDriver();
    expect(
      screen.getByText(
        new RegExp(`Penalty applies to ${contact.drivers[0].displayName}`, 'i'),
      ),
    ).toBeInTheDocument();

    // Simulate the next poll: same incidents, new array and object identities.
    useLiveSessionDataMock.mockReturnValue(
      pollResult() as unknown as ReturnType<typeof useLiveSessionData>,
    );
    rerender(
      <MemoryRouter>
        <LiveView />
      </MemoryRouter>,
    );

    // Before the fix this reverted to "Select a driver above" a second after
    // the steward chose one.
    expect(
      screen.getByText(
        new RegExp(`Penalty applies to ${contact.drivers[0].displayName}`, 'i'),
      ),
    ).toBeInTheDocument();
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
