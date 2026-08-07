import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import {
  LiveSessionContextValue,
  LiveSessionProvider,
  useLiveSession,
} from './LiveSessionContext';
import { useApi } from './ApiContext';
import { useLiveSessionData } from '../hooks/useLiveSessionData';
import { LiveIncidents } from '../views/Live/LiveIncidents';
import { buildLiveIncidentsFixture } from '../components/Live/liveFixtures';

/*
  Every driver on every triage row renders one CarClassBadge, so a stub that
  counts its calls is a per-row render counter.

  LiveTriageQueue.test.tsx already asserts the row memo holds — but it feeds the
  queue a `noop` defined once at module scope, so it can only ever prove the
  memo works when the props are stable. It cannot see the provider that is now
  supplying those props. This file closes that seam: the same counter, driven
  through the real provider on a real poll tick.
*/
const badgeRenders = jest.fn();

jest.mock('../components/CarClassBadge/CarClassBadge', () => ({
  CarClassBadge: ({ carClass }: { carClass: string }) => {
    badgeRenders(carClass);
    return <span data-testid="car-class-badge">{carClass}</span>;
  },
}));

jest.mock('./ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../hooks/useLiveSessionData', () => ({
  ...jest.requireActual('../hooks/useLiveSessionData'),
  useLiveSessionData: jest.fn(),
}));
jest.mock('../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const useLiveSessionDataMock = useLiveSessionData as jest.MockedFunction<
  typeof useLiveSessionData
>;

/*
  What `buildIncidentsCached` hands the provider on a tick where no incident
  changed: the very same array it returned last time. Everything above it in
  the poll — the payload, the standings — is new, because it was just
  deserialised off the IPC channel.
*/
const STABLE_INCIDENTS = buildLiveIncidentsFixture(80);
const STABLE_DECISIONS = {};

const pollTick = () => ({
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
  standings: [],
  incidents: STABLE_INCIDENTS,
  sessionKey: 'bahrain|10|1700000000',
});

beforeEach(() => {
  jest.clearAllMocks();
  badgeRenders.mockClear();
  useApiMock.mockReturnValue({
    isConnected: true,
    hasApiStatusResponse: true,
    liveSessionStatus: { state: 'live' },
    stewardDecisions: STABLE_DECISIONS,
    saveStewardDecision: jest.fn(),
    subscribeToApiChannel: jest.fn(),
  } as unknown as ReturnType<typeof useApi>);
  useLiveSessionDataMock.mockImplementation(
    () => pollTick() as unknown as ReturnType<typeof useLiveSessionData>,
  );
});

describe('LiveSessionProvider referential stability', () => {
  it('should hand down the same callbacks across a poll tick', () => {
    const seen: LiveSessionContextValue[] = [];
    const Probe: React.FC = () => {
      seen.push(useLiveSession());
      return null;
    };

    // Freshly built each time: React bails out of re-rendering a subtree it is
    // handed the identical element for, which would make this assert nothing.
    const tree = () => (
      <MemoryRouter initialEntries={['/live/incidents']}>
        <LiveSessionProvider>
          <Probe />
        </LiveSessionProvider>
      </MemoryRouter>
    );

    const { rerender } = render(tree());
    rerender(tree());

    const [first] = seen;
    const last = seen[seen.length - 1];
    expect(seen.length).toBeGreaterThan(1);

    /*
      Each of these is a prop on a memoised component downstream. A provider
      that rebuilt any of them every tick would silently undo the row memo — no
      test would fail, the queue would just go back to re-rendering four
      hundred rows a second.
    */
    expect(last.onSelectIncident).toBe(first.onSelectIncident);
    expect(last.onSelectTarget).toBe(first.onSelectTarget);
    expect(last.onChangeStateFilter).toBe(first.onChangeStateFilter);
    expect(last.onChangeIncidentFilters).toBe(first.onChangeIncidentFilters);
    expect(last.onResetIncidentFilters).toBe(first.onResetIncidentFilters);
    expect(last.onChangeReasoning).toBe(first.onChangeReasoning);
    expect(last.onFocusCar).toBe(first.onFocusCar);
    expect(last.onFlag).toBe(first.onFlag);
    expect(last.onDefer).toBe(first.onDefer);
    expect(last.onDecide).toBe(first.onDecide);

    /*
      The filters travel as one object into `LiveTriageQueue`, where they feed
      the memo that narrows four hundred incidents and the effect that resets
      the scroll window. A provider that rebuilt the object every tick would
      re-filter the session once a second and yank the steward back to the top
      of the list while they were reading it.
    */
    expect(last.incidentFilters).toBe(first.incidentFilters);
    expect(last.incidentFilterOptions).toBe(first.incidentFilterOptions);

    /*
      Both are derived from the decision store, which does not change on a poll
      tick — so both must survive one. `priorCallsByDriver` feeds a `useMemo` in
      the dossier; rebuilding it every second would re-filter every party's
      history once a second for no reason, and `stewardPenaltiesByDriver` is
      read on every row of the watchlist.
    */
    expect(last.priorCallsByDriver).toBe(first.priorCallsByDriver);
    expect(last.stewardPenaltiesByDriver).toBe(first.stewardPenaltiesByDriver);
  });

  it('should pass the incident list through untouched when no decision applies', () => {
    const seen: LiveSessionContextValue[] = [];
    const Probe: React.FC = () => {
      seen.push(useLiveSession());
      return null;
    };

    // Freshly built each time: React bails out of re-rendering a subtree it is
    // handed the identical element for, which would make this assert nothing.
    const tree = () => (
      <MemoryRouter initialEntries={['/live/incidents']}>
        <LiveSessionProvider>
          <Probe />
        </LiveSessionProvider>
      </MemoryRouter>
    );

    const { rerender } = render(tree());
    rerender(tree());

    // The decision merge maps over the array. If it produced a new one on a
    // quiet tick, the cache upstream would be buying nothing.
    expect(seen[seen.length - 1].incidents).toBe(seen[0].incidents);
    expect(seen[0].incidents[0]).toBe(STABLE_INCIDENTS[0]);
  });

  it('should not re-render triage rows on a poll tick that changed nothing', () => {
    const tree = () => (
      <MemoryRouter initialEntries={['/live/incidents']}>
        <LiveSessionProvider>
          <LiveIncidents />
        </LiveSessionProvider>
      </MemoryRouter>
    );

    const { rerender } = render(tree());
    expect(badgeRenders).toHaveBeenCalled();
    badgeRenders.mockClear();

    rerender(tree());

    expect(badgeRenders).not.toHaveBeenCalled();
  });
});
