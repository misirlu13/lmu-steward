import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  LiveCaptureDriver,
  LiveDataForReplay,
  LiveIncidentRecord,
  StewardDecision,
} from '@types';
import { ReplayIncidentDossier } from './ReplayIncidentDossier';
import { ReplayIncidentEvent } from './replayTimelineTypes';
import { useApi } from '../../providers/ApiContext';
import { DEFAULT_STEWARD_ACTIONS } from '../../utils/stewardActions';
import { useLiveIncidentContext } from '../../hooks/useLiveIncidentContext';

jest.mock('../../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../../hooks/useLiveIncidentContext', () => ({
  useLiveIncidentContext: jest.fn(),
}));
jest.mock('../../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const useLiveIncidentContextMock =
  useLiveIncidentContext as jest.MockedFunction<typeof useLiveIncidentContext>;

const SESSION_KEY = 'live|WeatherTech Raceway Laguna Seca|1|1785798030000';
const INCIDENT_ID = `${SESSION_KEY}#abc123def456`;

const driver = (slotId: number, driverName: string): LiveCaptureDriver =>
  ({
    slotId,
    steamId: '0',
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

const record: LiveIncidentRecord = {
  id: INCIDENT_ID,
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
};

const liveData: LiveDataForReplay = {
  sessionKey: SESSION_KEY,
  trackName: 'WeatherTech Raceway Laguna Seca',
  sessionType: 'PRACTICE',
  startedAt: 1785798030000,
  link: {
    replayHash: 'hash-p1-7',
    replayIdentityKey: 'identity-p1-7',
    replayName: 'WeatherTech Raceway Laguna Seca P1 7',
    method: 'roster',
    confidence: 1,
    linkedAt: 1786031059199,
  },
  incidents: [record],
  drivers: [driver(13, 'Antares Au'), driver(22, 'Rui Andrade')],
};

const event = (
  overrides: Partial<ReplayIncidentEvent> = {},
): ReplayIncidentEvent => ({
  id: 'collision-4-1434.4',
  type: 'collision',
  timestampLabel: '23:54.4',
  lapLabel: 'Lap 12',
  drivers: [],
  etSeconds: 1434.4,
  liveIncidentId: INCIDENT_ID,
  hasLiveContext: true,
  ...overrides,
});

const renderDossier = (
  overrides: {
    event?: ReplayIncidentEvent | undefined;
    data?: LiveDataForReplay | null;
    decisions?: Record<string, StewardDecision>;
  } = {},
) => {
  const saveStewardDecision = jest.fn();

  useApiMock.mockReturnValue({
    stewardDecisions: overrides.decisions ?? {},
    saveStewardDecision,
    stewardActions: DEFAULT_STEWARD_ACTIONS,
  } as unknown as ReturnType<typeof useApi>);

  render(
    <ReplayIncidentDossier
      event={'event' in overrides ? overrides.event : event()}
      liveData={'data' in overrides ? (overrides.data ?? null) : liveData}
      replayHash="hash-p1-7"
    />,
  );

  return { saveStewardDecision };
};

beforeEach(() => {
  jest.clearAllMocks();
  useLiveIncidentContextMock.mockReturnValue({
    context: undefined,
    isLoading: false,
  });
});

describe('ReplayIncidentDossier', () => {
  it('shows the captured evidence for the selected incident', () => {
    renderDossier();

    expect(screen.getByText('Incident Dossier')).toBeInTheDocument();
    expect(screen.getByText('Antares Au')).toBeInTheDocument();
    expect(screen.getByText('Rui Andrade')).toBeInTheDocument();
  });

  /*
    The replay's clock, not the capture's. A replay of a session joined late has
    its own zero point, and showing the raw elapsed time here would put a
    different time on the dossier than on the incident it belongs to.
  */
  it('shows the replay’s normalised time rather than the raw capture time', () => {
    renderDossier();

    expect(screen.getByText(/23:54\.4/)).toBeInTheDocument();
    expect(screen.getByText(/Lap 12/)).toBeInTheDocument();
  });

  /*
    Most incidents were never captured and most replays have no capture at all,
    so this is the ordinary case rather than the edge — and it used to leave the
    steward watching the footage with nothing to record against it. The panel
    stays; only the evidence half is replaced.
  */
  it('still offers a call on an incident that was not captured', () => {
    render(
      <ReplayIncidentDossier
        event={event({ liveIncidentId: undefined })}
        liveData={liveData}
        replayHash="hash-p1-7"
      />,
    );

    expect(screen.getByText('No captured evidence')).toBeInTheDocument();
    expect(screen.getByText('5s Penalty')).toBeInTheDocument();
    expect(screen.getByText(/Flag for review/)).toBeInTheDocument();
  });

  // The measurements are what capture supplies, so with none there is nothing
  // for any of them to say — a grid of dashes reads as broken, not as empty.
  it('draws no evidence grid for an uncaptured incident', () => {
    render(
      <ReplayIncidentDossier
        event={event({ liveIncidentId: undefined })}
        liveData={liveData}
        replayHash="hash-p1-7"
      />,
    );

    expect(screen.queryByText('Closing Speed')).not.toBeInTheDocument();
    expect(screen.queryByText('Speed at contact')).not.toBeInTheDocument();
    expect(screen.queryByText('Raw stream')).not.toBeInTheDocument();
  });

  it('still offers a call when the replay has no linked capture', () => {
    useApiMock.mockReturnValue({
      stewardDecisions: {},
      saveStewardDecision: jest.fn(),
      stewardActions: DEFAULT_STEWARD_ACTIONS,
    } as unknown as ReturnType<typeof useApi>);

    render(
      <ReplayIncidentDossier
        event={event()}
        liveData={null}
        replayHash="hash-p1-7"
      />,
    );

    expect(screen.getByText('No captured evidence')).toBeInTheDocument();
    expect(screen.getByText('5s Penalty')).toBeInTheDocument();
  });

  /*
    A replay event id is a position in one file — `collision-4-1434.4` — so two
    replays hold the same one. Without the replay in the key, a call on one race
    would surface against an unrelated incident in another.
  */
  it('keys an uncaptured call on the replay, never on a blank session', () => {
    const saveStewardDecision = jest.fn();
    useApiMock.mockReturnValue({
      stewardDecisions: {},
      saveStewardDecision,
      stewardActions: DEFAULT_STEWARD_ACTIONS,
    } as unknown as ReturnType<typeof useApi>);

    render(
      <ReplayIncidentDossier
        event={event()}
        liveData={null}
        replayHash="hash-p1-7"
      />,
    );

    fireEvent.click(screen.getByText('No Action'));

    const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;
    expect(saved.sessionKey).toBe('replay|hash-p1-7');
    expect(saved.id.startsWith('replay|hash-p1-7|')).toBe(true);
  });

  // Nothing to file a call against and nowhere to file it.
  it('renders nothing without a replay to anchor the call to', () => {
    const { container } = render(
      <ReplayIncidentDossier
        event={event()}
        liveData={null}
        replayHash={undefined}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  /*
    🛑 The point of the whole step. A call made live and the same call reviewed
    here must resolve to ONE decision id, or the store ends up holding two
    contradictory records instead of one with a revision history — and "we
    called it live, reviewed it after, and changed it" stops being provable.
  */
  it('keys the decision on the persisted incident id and the real session key', () => {
    const { saveStewardDecision } = renderDossier();

    fireEvent.click(screen.getByText('Antares Au'));
    fireEvent.click(screen.getByText('5s Penalty'));

    expect(saveStewardDecision).toHaveBeenCalledTimes(1);
    const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;

    expect(saved.id).toBe(`${SESSION_KEY}|${INCIDENT_ID}|slot-13`);
    expect(saved.incidentId).toBe(INCIDENT_ID);
    expect(saved.sessionKey).toBe(SESSION_KEY);
  });

  /*
    A live call is provisional because it was made under time pressure with no
    footage. Reviewing it here is the moment that stops being true — and the
    moment the replay it was reviewed against becomes knowable.
  */
  it('records a post-session call as final, against the replay', () => {
    const { saveStewardDecision } = renderDossier();

    fireEvent.click(screen.getByText('Antares Au'));
    fireEvent.click(screen.getByText('10s Penalty'));

    const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;

    expect(saved.status).toBe('final');
    expect(saved.replayHash).toBe('hash-p1-7');
    // The label is the value: what the button said is what the record carries
    // and what an export prints, with no lookup table in between.
    expect(saved.outcome).toBe('10s Penalty');
    expect(saved.state).toBe('DECIDED');
  });

  /*
    A finding about the incident as a whole records no driver, even with one
    selected. `types.ts` has always said so, and it is what keeps `target` the
    durable answer to "was this a call against someone" once the tariff behind it
    has been renamed — plus writing the selection on would mark that driver at
    fault for a call that cleared them.
  */
  it('records no target for an action that is not driver-scoped', () => {
    const { saveStewardDecision } = renderDossier();

    fireEvent.click(screen.getByText('Antares Au'));
    fireEvent.click(screen.getByText('No Action'));

    const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;

    expect(saved.outcome).toBe('No Action');
    expect(saved.target).toBeUndefined();
  });

  // A penalty nobody is assigned is not a call anyone can act on.
  it('refuses a driver-scoped penalty with no target chosen', () => {
    const { saveStewardDecision } = renderDossier();

    fireEvent.click(screen.getByText('5s Penalty'));

    expect(saveStewardDecision).not.toHaveBeenCalled();
  });

  it('surfaces a call already made against this incident', () => {
    renderDossier({
      decisions: {
        existing: {
          id: `${SESSION_KEY}|${INCIDENT_ID}|slot-13`,
          incidentId: INCIDENT_ID,
          sessionKey: SESSION_KEY,
          state: 'DECIDED',
          status: 'provisional',
          outcome: 'penalty-5s',
          reasoning: 'Called live',
          basis: 'incident',
          involvedParties: [],
          stewardAuthor: 'Steward',
          decidedAt: 1785798030000,
          sessionTrack: 'WeatherTech Raceway Laguna Seca',
          sessionType: 'PRACTICE',
          revisions: [],
        } as StewardDecision,
      },
    });

    expect(screen.getByText('Decision')).toBeInTheDocument();
    expect(screen.getByText('Called live')).toBeInTheDocument();
  });

  /*
    The field the live dossier has and this one did not. It was left off because
    a blank box wired into the decision would wipe the reasoning a live call
    already carries the first time any button here was pressed — so seeding it
    from the record is what makes it safe to add, and is asserted here rather
    than assumed.
  */
  describe('the reasoning note', () => {
    const note = () => screen.getByLabelText('Reasoning (optional)');

    const withLiveCall = (reasoning?: string) =>
      renderDossier({
        decisions: {
          existing: {
            id: `${SESSION_KEY}|${INCIDENT_ID}|slot-13`,
            incidentId: INCIDENT_ID,
            sessionKey: SESSION_KEY,
            state: 'DECIDED',
            status: 'provisional',
            outcome: '5s Penalty',
            reasoning,
            basis: 'incident',
            involvedParties: [],
            stewardAuthor: 'Steward',
            decidedAt: 1785798030000,
            sessionTrack: 'WeatherTech Raceway Laguna Seca',
            sessionType: 'PRACTICE',
            revisions: [],
          } as StewardDecision,
        },
      });

    it('is offered on a captured incident', () => {
      renderDossier();

      expect(note()).toBeInTheDocument();
    });

    it('starts from the note the live call already carries', () => {
      withLiveCall('Called live');

      expect(note()).toHaveValue('Called live');
    });

    it('is written onto the call', () => {
      const { saveStewardDecision } = renderDossier();

      fireEvent.change(note(), {
        target: { value: 'Reviewed on the replay — contact was avoidable' },
      });
      fireEvent.click(screen.getByText('No Action'));

      const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;
      expect(saved.reasoning).toBe(
        'Reviewed on the replay — contact was avoidable',
      );
    });

    /*
      The defect the field was withheld to avoid: pressing a button without
      touching the note must not blank the one already on the record.
    */
    it('does not wipe the live note when the call is confirmed untouched', () => {
      const { saveStewardDecision } = withLiveCall('Called live');

      fireEvent.click(screen.getByText('No Action'));

      const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;
      expect(saved.reasoning).toBe('Called live');
    });

    it('records nothing rather than a blank string when left empty', () => {
      const { saveStewardDecision } = renderDossier();

      fireEvent.change(note(), { target: { value: '   ' } });
      fireEvent.click(screen.getByText('No Action'));

      const saved = saveStewardDecision.mock.calls[0][0] as StewardDecision;
      expect(saved.reasoning).toBeUndefined();
    });

    it('is offered on an uncaptured incident too', () => {
      render(
        <ReplayIncidentDossier
          event={event({ liveIncidentId: undefined })}
          liveData={liveData}
          replayHash="hash-p1-7"
        />,
      );

      expect(note()).toBeInTheDocument();
    });
  });

  /*
    The evidence rides the incident row and is already in hand, so a steward can
    read closing speeds and measurements while the ~100 KB trace is still being
    fetched. Blocking the panel behind a spinner would hide what is usable.
  */
  it('shows the evidence while the trace is still being read off disk', () => {
    useLiveIncidentContextMock.mockReturnValue({
      context: undefined,
      isLoading: true,
    });

    renderDossier();

    expect(screen.getByText('Incident Dossier')).toBeInTheDocument();
    expect(screen.getByText('Antares Au')).toBeInTheDocument();
  });
});
