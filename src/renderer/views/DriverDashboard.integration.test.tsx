import '@testing-library/jest-dom';
import { act, render, screen } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { CareerAggregate } from '@types';
import { DriverDashboardView } from './DriverDashboard';
import { sendMessage } from '../utils/postMessage';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../components/Common/ViewHeader', () => ({
  ViewHeader: ({ title }: { title: React.ReactNode }) => <div>{title}</div>,
}));

const listeners = new Map<string, (payload: unknown) => void>();

const buildAggregate = (
  overrides: Partial<CareerAggregate> = {},
): CareerAggregate =>
  ({
    identity: { primary: 'Bradley Drake', aliases: [], unclaimed: [] },
    headline: {
      firstSessionAt: 1764700000,
      lastSessionAt: 1785000000,
      sessions: 169,
      races: 23,
      qualifying: 15,
      practice: 131,
      multiplayerSessions: 23,
      raceWeekendSessions: 146,
      lapsCompleted: 1050,
      distanceKm: 5822,
      timeOnTrackSec: 90000,
      tracks: 12,
      layouts: 14,
      cars: 14,
      classes: 4,
    },
    results: {
      wins: 2,
      podiums: 5,
      topFives: 7,
      poles: 1,
      frontRows: 2,
      winsMultiplayer: 1,
      winsRaceWeekend: 1,
      podiumsMultiplayer: 2,
      podiumsRaceWeekend: 3,
      averageClassFinish: 8.4,
      averageClassGrid: 9.1,
      bestClassFinish: 1,
      worstClassFinish: 24,
      finishes: 12,
      dnfs: 10,
      dnfMechanical: 7,
      dnfAccident: 3,
      disqualifications: 1,
      netPositionsGained: -2,
      bestComeback: 16,
      lapsLed: 19,
      finishDistribution: [
        { position: 1, count: 2 },
        { position: 3, count: 1 },
      ],
    },
    discipline: {
      incidentsCaused: 1099,
      incidentsInvolved: 1200,
      incidentsPer100Km: 18.9,
      contactWithVehicle: 600,
      contactWithScenery: 499,
      worstImpactForce: 4529,
      penalties: 47,
      penaltiesByReason: [{ reason: 'Speeding In Pitlane', count: 46 }],
      trackLimitWarnings: 160,
      trackLimitInvalidLaps: 40,
      longestCleanStreak: 6,
    },
    tracks: [
      {
        trackFolder: 'Monza_2023',
        trackLayout: 'layoutMonza',
        trackVenue: 'Autodromo Nazionale Monza',
        sessions: 13,
        races: 3,
        wins: 1,
        podiums: 1,
        bestClassGridPos: 4,
        bestClassFinishPos: 1,
        bestLapSec: 101.45,
        averageFinishPercentile: 0.2,
        lapsCompleted: 120,
        distanceKm: 695,
        incidentsCaused: 110,
        incidentsPer100Km: 15.8,
        lastRacedAt: 1785000000,
      },
    ],
    cars: [],
    recentSessions: [],
    dataHealth: {
      sessionsWithMissingFiles: 38,
      excludedSessions: 0,
      lastScan: {
        scannedAt: Date.now(),
        logsSeen: 388,
        logsParsed: 388,
        sessionsRecorded: 169,
        sessionsMissingFiles: 38,
        skippedImported: 12,
        skippedUnclaimed: 0,
      },
    },
    ...overrides,
  }) as CareerAggregate;

const reply = (channel: string, payload: unknown) => {
  act(() => {
    listeners.get(channel)?.(payload);
  });
};

describe('DriverDashboardView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listeners.clear();
    (window as unknown as { electron?: unknown }).electron = {
      ipcRenderer: {
        on: (channel: string, handler: (payload: unknown) => void) => {
          listeners.set(channel, handler);
          return jest.fn();
        },
      },
    };
  });

  it('asks for the career summary on mount', () => {
    render(<DriverDashboardView />);

    expect(sendMessage).toHaveBeenCalledWith(CONSTANTS.API.GET_CAREER_SUMMARY);
  });

  it('renders the headline, results and track mastery once data arrives', () => {
    render(<DriverDashboardView />);

    reply(CONSTANTS.API.GET_CAREER_SUMMARY, {
      status: 'success',
      data: { aggregate: buildAggregate() },
    });

    expect(screen.getByText('Bradley Drake')).toBeInTheDocument();
    expect(screen.getByText('169')).toBeInTheDocument();
    expect(screen.getByText('23 races · 131 practice')).toBeInTheDocument();
    expect(screen.getByText('Track mastery')).toBeInTheDocument();
    expect(screen.getByText('Autodromo Nazionale Monza')).toBeInTheDocument();
  });

  /*
   * Decision 2: wins aggregate into one number, but the online/offline split is
   * always reachable without it.
   */
  it('shows one wins total alongside its online and offline split', () => {
    render(<DriverDashboardView />);

    reply(CONSTANTS.API.GET_CAREER_SUMMARY, {
      status: 'success',
      data: { aggregate: buildAggregate() },
    });

    // "Wins" is both a headline tile and a track-table column, so the split
    // line beneath the tile is what identifies the tile uniquely.
    const split = screen.getByText('1 online · 1 offline');
    const tile = split.closest('.MuiCard-root');

    expect(tile).not.toBeNull();
    expect(tile).toHaveTextContent('Wins');
    expect(tile).toHaveTextContent('2');
  });

  /*
   * The persistence promise, stated on the page: a session outlives the file it
   * came from, and the user can see that it did.
   */
  it('reports sessions whose files are gone as kept', () => {
    render(<DriverDashboardView />);

    reply(CONSTANTS.API.GET_CAREER_SUMMARY, {
      status: 'success',
      data: { aggregate: buildAggregate() },
    });

    expect(
      screen.getByText(/38 sessions whose files are no longer on disk, kept/),
    ).toBeInTheDocument();
  });

  it('offers to claim a driver name it does not recognise', () => {
    render(<DriverDashboardView />);

    reply(CONSTANTS.API.GET_CAREER_SUMMARY, {
      status: 'success',
      data: {
        aggregate: buildAggregate({
          identity: {
            primary: 'Bradley Drake',
            aliases: [],
            unclaimed: [{ name: 'BD_Racing', sessionCount: 14 }],
          },
        }),
      },
    });

    expect(screen.getByText('BD_Racing')).toBeInTheDocument();

    screen.getByRole('button', { name: "That's me" }).click();

    expect(sendMessage).toHaveBeenCalledWith(
      CONSTANTS.API.POST_CAREER_CLAIM_IDENTITY,
      { name: 'BD_Racing' },
    );
  });

  it('explains where the data comes from when nothing is recorded', () => {
    render(<DriverDashboardView />);

    reply(CONSTANTS.API.GET_CAREER_SUMMARY, {
      status: 'success',
      data: {
        aggregate: buildAggregate({
          headline: { ...buildAggregate().headline, sessions: 0 },
        }),
      },
    });

    expect(screen.getByText('No sessions recorded yet')).toBeInTheDocument();

    screen.getByRole('button', { name: 'Scan result logs' }).click();

    expect(sendMessage).toHaveBeenCalledWith(CONSTANTS.API.POST_CAREER_RESCAN, {
      rebuild: false,
    });
  });

  it('surfaces an error rather than rendering an empty career', () => {
    render(<DriverDashboardView />);

    reply(CONSTANTS.API.GET_CAREER_SUMMARY, {
      status: 'error',
      message: 'Unable to read career data.',
    });

    expect(screen.getByText('Unable to read career data.')).toBeInTheDocument();
  });
});
