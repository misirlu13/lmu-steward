import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LiveShell } from './LiveShell';
import { LiveOverview } from './LiveOverview';
import { LiveIncidents } from './LiveIncidents';
import { useApi } from '../../providers/ApiContext';
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

// The layout fixture covers five classifications across seven incidents, which
// is what makes it worth filtering.
const trackLimits = liveIncidentsFixture.find(
  (incident) => incident.classification === 'track-limits',
)!;
const aContact = liveIncidentsFixture.find(
  (incident) => incident.classification === 'contact',
)!;

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
  // Fresh identities, same content — exactly what a poll produces.
  incidents: liveIncidentsFixture.map((incident) => ({ ...incident })),
  sessionKey: 'bahrain|10|1700000000',
});

beforeEach(() => {
  jest.clearAllMocks();
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: {},
    saveStewardDecision: jest.fn(),
    subscribeToApiChannel: jest.fn(),
  } as unknown as ReturnType<typeof useApi>);
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

const renderLive = () =>
  render(
    <MemoryRouter initialEntries={['/live/incidents']}>
      {liveRoutes()}
    </MemoryRouter>,
  );

/** The chip row, scoped away from the identical labels on the queue rows. */
const typeFilter = (label: string) =>
  within(screen.getByRole('group', { name: 'Incident type' })).getByText(label);

describe('live incident quick filters', () => {
  it('should narrow the queue to one classification', () => {
    renderLive();
    expect(screen.getByText(aContact.timestampLabel)).toBeInTheDocument();

    fireEvent.click(typeFilter('Track Limits'));

    expect(screen.getByText(trackLimits.timestampLabel)).toBeInTheDocument();
    expect(screen.queryByText(aContact.timestampLabel)).not.toBeInTheDocument();
    expect(screen.getByText('All 1')).toBeInTheDocument();
  });

  it('should clear the filter when the active chip is clicked again', () => {
    renderLive();

    fireEvent.click(typeFilter('Track Limits'));
    fireEvent.click(typeFilter('Track Limits'));

    expect(screen.getByText(aContact.timestampLabel)).toBeInTheDocument();
    expect(
      screen.getByText(`All ${liveIncidentsFixture.length}`),
    ).toBeInTheDocument();
  });

  /*
    Filter state lives in the provider, not the view. A steward who narrows to
    one driver's contacts, checks the overview and comes back has not changed
    their mind about what they were looking at.
  */
  it('should survive a section change', () => {
    renderLive();

    fireEvent.click(typeFilter('Track Limits'));

    fireEvent.click(screen.getByText('Overview'));
    expect(screen.getByText('Needs Attention')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Incidents'));

    expect(screen.getByText('All 1')).toBeInTheDocument();
    expect(screen.queryByText(aContact.timestampLabel)).not.toBeInTheDocument();
  });

  it('should say so when the filters, not the session, emptied the queue', () => {
    renderLive();

    fireEvent.click(typeFilter('Track Limits'));
    // A track-limit element carries no magnitude, so this pair cannot match.
    fireEvent.mouseDown(screen.getByLabelText('Magnitude'));
    fireEvent.click(screen.getByRole('option', { name: '2000+' }));

    expect(
      screen.getByText(new RegExp(`${liveIncidentsFixture.length} hidden`)),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Clear filters/ }));

    expect(screen.getByText(aContact.timestampLabel)).toBeInTheDocument();
  });
});
