import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { LiveIncidentDossier } from './LiveIncidentDossier';
import { LiveIncident, liveIncidentsFixture } from './liveFixtures';

const noop = () => {};

const renderDossier = (incident?: LiveIncident) =>
  render(
    <LiveIncidentDossier
      incident={incident}
      onFocusCar={noop}
      onFlag={noop}
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
    expect(screen.getByText(/located to within 0.10s/i)).toBeInTheDocument();
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

describe('LiveIncidentDossier decision targeting', () => {
  const renderWithTarget = (targetSteamId?: string) => {
    const onDecide = jest.fn();
    const onSelectTarget = jest.fn();

    render(
      <LiveIncidentDossier
        incident={withEvidence}
        onFocusCar={noop}
        onFlag={noop}
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
