import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LiveIncidentDossier } from './LiveIncidentDossier';
import {
  LiveIncident,
  LivePriorCall,
  liveIncidentsFixture,
} from './liveFixtures';

const noop = () => {};

const renderDossier = (incident?: LiveIncident) =>
  render(
    <LiveIncidentDossier
      incident={incident}
      onFocusCar={noop}
      onFlag={noop}
      onDefer={noop}
      onDecide={noop}
      targetSteamId={undefined}
      onSelectTarget={noop}
    />,
  );

// inc-0012 is the fixture carrying a real captured window, so this exercises the
// evidence rows, the per-car measurements and the trace chart together.
const withEvidence = liveIncidentsFixture[0];

describe('LiveIncidentDossier', () => {
  it('should prompt for a selection when no incident is chosen', () => {
    renderDossier(undefined);

    expect(
      screen.getByText(/Select an incident from the queue/i),
    ).toBeInTheDocument();
  });

  it('should render derived pairwise evidence', () => {
    renderDossier(withEvidence);

    expect(screen.getByText('28.4 kph')).toBeInTheDocument();
    expect(
      screen.getByText('Sector 3 · 3,808 m (66% of lap)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Multiclass traffic')).toBeInTheDocument();
    expect(screen.getByText('Nils Lindqvist #92')).toBeInTheDocument();
  });

  it('should render per-car measurements for both parties', () => {
    renderDossier(withEvidence);

    expect(screen.getByText('148 kph')).toBeInTheDocument();
    expect(screen.getByText('165 kph')).toBeInTheDocument();
    expect(screen.getByText('19.3 m/s²')).toBeInTheDocument();
  });

  it('should mark a truncated duration as a floor rather than an exact figure', () => {
    renderDossier(withEvidence);

    // Braking that predates the captured window reads 2.0s+, not 2.0s.
    expect(screen.getByText('2.0s+')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
  });

  it('should present the traces with their position context', () => {
    renderDossier(withEvidence);

    expect(screen.getByText(/Inputs and speed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/On track throughout/i)).toHaveLength(2);
    expect(screen.getByText(/±0.10s/i)).toBeInTheDocument();
  });

  /*
    The number was already in the caption. The band is what lets a steward see
    whether a brake release falls inside the uncertainty or outside it, which is
    the difference between "he braked, then was hit" and "cannot be ordered".
  */
  it('should draw the contact uncertainty as a band on every trace', () => {
    renderDossier(withEvidence);

    // One per car, since each trace gets its own chart.
    expect(screen.getAllByTestId('trace-uncertainty-band')).toHaveLength(2);
  });

  /*
    Steering is the channel the "was that aimed at him?" question is asked of,
    so it has to be drawn for every car whether or not the driver used it — a
    band that only appeared on cars that turned would read as "no data" on
    exactly the car a steward had just cleared.
  */
  it('should draw a steering trace for every car', () => {
    renderDossier(withEvidence);

    expect(screen.getAllByTestId('trace-steering')).toHaveLength(2);
  });

  /*
    The captured fixture is a straight-line braking-zone shunt, so both cars
    barely steer. On the fixed full-scale axis that is a nearly flat line by
    design, and the printed peak is what stops it being read as a broken
    channel.
  */
  it('should state each peak steering input as a number', () => {
    renderDossier(withEvidence);

    expect(screen.getByText('peak steering 0.10')).toBeInTheDocument();
    expect(screen.getByText('peak steering 0.23')).toBeInTheDocument();
  });

  it('should say the steering axis is full-scale rather than fitted', () => {
    renderDossier(withEvidence);

    expect(
      screen.getByText(/full-scale from −1 to \+1 lock/i),
    ).toBeInTheDocument();
    // And makes no claim about handedness, which nothing in the capture records.
    expect(
      screen.getByText(/which side is which is not recorded/i),
    ).toBeInTheDocument();
  });

  it('should draw no band when the contact instant was located exactly', () => {
    renderDossier({ ...withEvidence, anchorErrorSeconds: 0 });

    expect(screen.queryByTestId('trace-uncertainty-band')).toBeNull();
    // And says so plainly rather than pointing at a band nobody can see.
    expect(screen.getByText(/located to within 0.00s/i)).toBeInTheDocument();
  });

  it('should show a dash rather than a guess when no context was captured', () => {
    const withoutEvidence: LiveIncident = {
      ...withEvidence,
      evidence: { cars: [] },
      traces: undefined,
      anchorErrorSeconds: undefined,
    };

    renderDossier(withoutEvidence);

    expect(screen.queryByText(/Inputs and speed/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

/*
  The store's primary key is not stewarding information. It read
  `live|{track}|{session}|{startedAt}#{digest}`, and nothing a steward can reach
  accepts or emits it — no export column carries it and no control takes one as
  input — while its session half restated the view header. Asserted rather than
  merely deleted because a raw id in a header is exactly the kind of debug
  affordance that creeps back in.
*/
describe('LiveIncidentDossier header', () => {
  it('should identify the incident by time, lap and drivers, not by its key', () => {
    renderDossier(withEvidence);

    expect(screen.queryByText(withEvidence.id)).not.toBeInTheDocument();
    // Paired with a positive assertion so the test cannot pass on a blank render.
    expect(
      screen.getByTestId(`dossier-driver-${withEvidence.drivers[0].steamId}`),
    ).toBeInTheDocument();
  });
});

describe('LiveIncidentDossier rewatch', () => {
  it('should hand back the incident, leaving the sequence to main', () => {
    const onRewatch = jest.fn();
    render(
      <LiveIncidentDossier
        incident={withEvidence}
        onRewatch={onRewatch}
        onFlag={noop}
        onDecide={noop}
        targetSteamId={undefined}
        onSelectTarget={noop}
      />,
    );

    fireEvent.click(screen.getByText('Rewatch'));

    expect(onRewatch).toHaveBeenCalledWith(withEvidence.id);
  });

  /*
    Hidden, not disabled, and for the same reason `onFocusCar` is: against a
    finished segment the elapsed times index *that* session's replay while the
    seek addresses the buffer of the one running now. The picture would land
    somewhere unrelated and look like it had worked, which is worse than the
    button not being there. The replay-side dossier passes nothing for the same
    reason — it already is the footage.
  */
  it('should not be drawn when the caller has no live buffer to seek', () => {
    renderDossier(withEvidence);

    expect(screen.queryByText('Rewatch')).not.toBeInTheDocument();
  });
});

describe('LiveIncidentDossier decision targeting', () => {
  const renderWithTarget = (targetSteamId?: string) => {
    const onDecide = jest.fn();
    const onSelectTarget = jest.fn();

    render(
      <LiveIncidentDossier
        incident={withEvidence}
        onFocusCar={noop}
        onFlag={noop}
        onDefer={noop}
        onDecide={onDecide}
        targetSteamId={targetSteamId}
        onSelectTarget={onSelectTarget}
      />,
    );

    return { onDecide, onSelectTarget };
  };

  // A penalty recorded against a two-car incident with no target is a call
  // nobody can act on.
  it('should refuse to assign a penalty until a driver is chosen', () => {
    renderWithTarget(undefined);

    expect(screen.getByText(/select a driver above/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5s Penalty/ })).toBeDisabled();
  });

  it('should name the driver a penalty would apply to', () => {
    renderWithTarget(withEvidence.drivers[0].steamId);

    expect(
      screen.getByText(/Penalty applies to Bradley Drake/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5s Penalty/ })).toBeEnabled();
  });

  // "No action" is a finding about the incident, not about one driver, so it
  // must stay available with no target selected.
  it('should keep incident-scoped outcomes available without a target', () => {
    renderWithTarget(undefined);

    expect(screen.getByRole('button', { name: /No Action/ })).toBeEnabled();
  });

  /*
    Deferring is a call about the incident, not about a driver, so it has to
    stay available with nothing targeted — the same reasoning that keeps "no
    action" enabled.
  */
  it('should defer without requiring a target', () => {
    const onDefer = jest.fn();
    render(
      <LiveIncidentDossier
        incident={withEvidence}
        onFocusCar={noop}
        onFlag={noop}
        onDefer={onDefer}
        onDecide={noop}
        targetSteamId={undefined}
        onSelectTarget={noop}
      />,
    );

    const defer = screen.getByRole('button', { name: /Defer to post-session/ });
    expect(defer).toBeEnabled();

    fireEvent.click(defer);

    expect(onDefer).toHaveBeenCalledWith(withEvidence.id);
  });

  // The replay-side dossier reuses this component, and there the steward is
  // already in the review a deferral points at.
  it('should hide the defer action when no handler is supplied', () => {
    render(
      <LiveIncidentDossier
        incident={withEvidence}
        onFocusCar={noop}
        onFlag={noop}
        onDecide={noop}
        targetSteamId={undefined}
        onSelectTarget={noop}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Defer to post-session/ }),
    ).not.toBeInTheDocument();
    // The other way of not deciding stays, because "come back to this" is
    // still meaningful in a review session.
    expect(
      screen.getByRole('button', { name: /Flag for review/ }),
    ).toBeInTheDocument();
  });

  it('should say a deferred incident is held for post-session review', () => {
    renderDossier({ ...withEvidence, state: 'DEFERRED' });

    expect(
      screen.getByText(/Held for post-session review/i),
    ).toBeInTheDocument();
  });

  it('should select a driver when their chip is clicked', () => {
    const { onSelectTarget } = renderWithTarget(undefined);

    // The name also appears in the measurements table and the trace labels;
    // the first is the chip.
    fireEvent.click(screen.getAllByText('Nils Lindqvist')[0]);

    expect(onSelectTarget).toHaveBeenCalledWith(
      withEvidence.drivers.find((d) => d.displayName === 'Nils Lindqvist')
        ?.steamId,
    );
  });
});

describe('LiveIncidentDossier prior calls', () => {
  const [drake, lindqvist] = withEvidence.drivers;

  const call = (over: Partial<LivePriorCall> = {}): LivePriorCall => ({
    decisionId: 'd-1',
    incidentId: 'inc-9000',
    lapLabel: 'L12',
    state: 'DECIDED',
    outcome: '10s Penalty',
    wasTarget: true,
    decidedAt: 1,
    ...over,
  });

  const renderWithHistory = (history: Map<string, LivePriorCall[]>) =>
    render(
      <LiveIncidentDossier
        incident={withEvidence}
        onFocusCar={noop}
        onFlag={noop}
        onDecide={noop}
        targetSteamId={undefined}
        onSelectTarget={noop}
        priorCallsByDriver={history}
      />,
    );

  it('should list every prior call against a party', () => {
    renderWithHistory(
      new Map([
        [
          drake.steamId,
          [
            call({ decisionId: 'd-1', lapLabel: 'L12' }),
            call({
              decisionId: 'd-2',
              lapLabel: 'L20',
              outcome: undefined,
              state: 'FLAGGED',
            }),
          ],
        ],
      ]),
    );

    const row = screen.getByTestId(`prior-calls-${drake.steamId}`);
    expect(within(row).getByText('L12 · 10s Penalty')).toBeInTheDocument();
    expect(within(row).getByText('L20 · Flagged')).toBeInTheDocument();
  });

  /*
    The outcome is the steward's own words, stored on the record, so a call made
    under an action that has since been renamed or deleted has to read back as
    the text it was made under. `penalty-10s` is what the shipped enum used to
    store, and it is exactly what a decision predating a configured tariff
    carries — there is no label table left to miss a key in.
  */
  it('should print an outcome from a vocabulary no longer configured', () => {
    renderWithHistory(
      new Map([[drake.steamId, [call({ outcome: 'penalty-10s' })]]]),
    );

    const row = screen.getByTestId(`prior-calls-${drake.steamId}`);
    expect(within(row).getByText('L12 · penalty-10s')).toBeInTheDocument();
  });

  /*
    The comparison is the whole value of the section. A panel that listed only
    the driver with a record would hide that the other one has none, which is
    exactly what a steward weighing a two-car contact wants to know.
  */
  it('should show the other party as having none rather than omitting them', () => {
    renderWithHistory(new Map([[drake.steamId, [call()]]]));

    const row = screen.getByTestId(`prior-calls-${lindqvist.steamId}`);
    expect(within(row).getByText('None')).toBeInTheDocument();
  });

  it('should stay hidden when neither party has a record', () => {
    renderWithHistory(new Map());

    expect(screen.queryByText(/Prior calls this session/i)).toBeNull();
  });

  // Citing the call just made on the incident in front of the steward as
  // precedent for itself.
  it('should exclude this incident own record', () => {
    renderWithHistory(
      new Map([[drake.steamId, [call({ incidentId: withEvidence.id })]]]),
    );

    expect(screen.queryByText(/Prior calls this session/i)).toBeNull();
  });

  it('should collapse a long history to a count', () => {
    renderWithHistory(
      new Map([
        [
          drake.steamId,
          Array.from({ length: 7 }, (_, index) =>
            call({ decisionId: `d-${index}`, lapLabel: `L${index}` }),
          ),
        ],
      ]),
    );

    expect(screen.getByText('+3 earlier')).toBeInTheDocument();
  });
});

describe('LiveIncidentDossier reasoning capture', () => {
  it('should offer an optional reasoning field without gating the tariff', () => {
    const onChangeReasoning = jest.fn();
    render(
      <LiveIncidentDossier
        incident={withEvidence}
        onFocusCar={noop}
        onFlag={noop}
        onDecide={noop}
        targetSteamId={undefined}
        onSelectTarget={noop}
        reasoning=""
        onChangeReasoning={onChangeReasoning}
      />,
    );

    const field = screen.getByLabelText(/Reasoning \(optional\)/i);
    fireEvent.change(field, { target: { value: 'Dived from too far back' } });

    expect(onChangeReasoning).toHaveBeenCalledWith('Dived from too far back');
    // Nothing is gated on it — an empty reason must never block a call.
    expect(screen.getByRole('button', { name: /No Action/ })).toBeEnabled();
  });

  // The replay dossier passes no handler: reviewing there revises a record that
  // already carries its reasoning.
  it('should draw no field when there is nowhere for the text to go', () => {
    render(
      <LiveIncidentDossier
        incident={withEvidence}
        onFocusCar={noop}
        onFlag={noop}
        onDecide={noop}
        targetSteamId={undefined}
        onSelectTarget={noop}
      />,
    );

    expect(screen.queryByLabelText(/Reasoning \(optional\)/i)).toBeNull();
  });
});
