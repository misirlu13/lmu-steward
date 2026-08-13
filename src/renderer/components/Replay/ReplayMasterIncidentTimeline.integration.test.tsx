import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ReplayIncidentEvent,
  ReplayMasterIncidentTimeline,
} from './ReplayMasterIncidentTimeline';

const events: ReplayIncidentEvent[] = [
  {
    id: 'collision-1',
    type: 'collision',
    timestampLabel: '00:00:10',
    lapLabel: 'Lap 1',
    description: 'Collision Alpha',
    etSeconds: 10,
    drivers: [
      {
        displayName: 'Driver Alpha',
        carNumber: '12',
        carClass: 'GT3',
      },
    ],
  },
  {
    id: 'penalty-1',
    type: 'penalty',
    timestampLabel: '00:00:20',
    lapLabel: 'Lap 2',
    description: 'Penalty Bravo',
    etSeconds: 20,
    drivers: [
      {
        displayName: 'Driver Bravo',
        carNumber: '99',
        carClass: 'P2',
      },
    ],
  },
  {
    id: 'track-limit-1',
    type: 'track-limit',
    timestampLabel: '00:00:30',
    lapLabel: 'Lap 3',
    description: 'Limited Data Event',
    etSeconds: 30,
    drivers: [
      {
        displayName: 'Driver Limited',
        carNumber: '7',
        carClass: 'GT3',
        hasLapData: false,
      },
    ],
  },
];

describe('ReplayMasterIncidentTimeline integration', () => {
  it('invokes jump callback for visible events', () => {
    const onJumpToIncident = jest.fn();

    render(
      <ReplayMasterIncidentTimeline
        events={events}
        availableClasses={['GT3', 'P2']}
        onJumpToIncident={onJumpToIncident}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /jump/i })[0]);

    expect(onJumpToIncident).toHaveBeenCalledWith(events[0]);
  });

  /*
    Reading an incident and seeking the footage to it are two acts. Loading a
    picture takes over Le Mans Ultimate and costs seconds, and a steward working
    down a long list wants to read the evidence on several before deciding which
    one is worth watching — so opening the dossier must not command the game.
  */
  describe('opening a row', () => {
    const renderTimeline = () => {
      const onSelectIncident = jest.fn();
      const onJumpToIncident = jest.fn();

      render(
        <ReplayMasterIncidentTimeline
          events={events}
          availableClasses={['GT3', 'P2']}
          onSelectIncident={onSelectIncident}
          onJumpToIncident={onJumpToIncident}
        />,
      );

      return { onSelectIncident, onJumpToIncident };
    };

    const row = (name: RegExp) => screen.getByRole('button', { name });

    it('should open the dossier when the row is clicked', () => {
      const { onSelectIncident } = renderTimeline();

      fireEvent.click(row(/Review the incident at 00:00:10/));

      expect(onSelectIncident).toHaveBeenCalledWith(events[0]);
    });

    // The point of the change: a glance must not become a seek.
    it('should not seek the replay when the row is clicked', () => {
      const { onJumpToIncident } = renderTimeline();

      fireEvent.click(row(/Review the incident at 00:00:10/));

      expect(onJumpToIncident).not.toHaveBeenCalled();
    });

    it('should still seek from the jump button', () => {
      const { onJumpToIncident } = renderTimeline();

      fireEvent.click(screen.getAllByRole('button', { name: /jump/i })[0]);

      expect(onJumpToIncident).toHaveBeenCalledWith(events[0]);
    });

    /*
      The button sits inside the row, and both are clickable. One press must run
      one handler — harmless today only because jumping happens to select too,
      and not harmless the moment either changes.
    */
    it('should not also fire the row when the jump button is pressed', () => {
      const { onSelectIncident } = renderTimeline();

      fireEvent.click(screen.getAllByRole('button', { name: /jump/i })[0]);

      expect(onSelectIncident).not.toHaveBeenCalled();
    });

    it('should open the dossier from the keyboard', () => {
      const { onSelectIncident } = renderTimeline();

      fireEvent.keyDown(row(/Review the penalty at 00:00:20/), {
        key: 'Enter',
      });

      expect(onSelectIncident).toHaveBeenCalledWith(events[1]);
    });
  });

  /*
    Capture routinely attaches partway through a session — the app is often
    started after the race is under way — so a long list interleaves incidents
    that carry telemetry with ones that can only be watched. The two are
    reviewed differently, which is what makes them worth separating.
  */
  describe('filtering by evidence', () => {
    /** The same three events, with the collision carrying live capture. */
    const mixedEvents: ReplayIncidentEvent[] = [
      { ...events[0], liveIncidentId: 'live-1', hasLiveContext: true },
      events[1],
      events[2],
    ];

    const renderMixed = () =>
      render(
        <ReplayMasterIncidentTimeline
          events={mixedEvents}
          availableClasses={['GT3', 'P2']}
        />,
      );

    const pill = (name: string) => screen.getByRole('button', { name });

    it('should offer both pills when a capture is behind the replay', () => {
      renderMixed();

      expect(pill('Live Capture')).toBeTruthy();
      expect(pill('Log Only')).toBeTruthy();
    });

    it('should show everything until one is switched off', () => {
      renderMixed();

      expect(screen.getByText('Collision Alpha')).toBeTruthy();
      expect(screen.getByText('Penalty Bravo')).toBeTruthy();
    });

    it('should hide the captured incidents when Live Capture is switched off', () => {
      renderMixed();

      fireEvent.click(pill('Live Capture'));

      expect(screen.queryByText('Collision Alpha')).toBeNull();
      expect(screen.getByText('Penalty Bravo')).toBeTruthy();
    });

    it('should leave only the captured incidents when Log Only is switched off', () => {
      renderMixed();

      fireEvent.click(pill('Log Only'));

      expect(screen.getByText('Collision Alpha')).toBeTruthy();
      expect(screen.queryByText('Penalty Bravo')).toBeNull();
    });

    // Matching the type pills: a filter that can hide every row reads as broken.
    it('should refuse to switch the last one off', () => {
      renderMixed();

      fireEvent.click(pill('Live Capture'));
      fireEvent.click(pill('Log Only'));

      expect(screen.getByText('Penalty Bravo')).toBeTruthy();
    });

    it('should come back with Reset Filters', () => {
      renderMixed();
      fireEvent.click(pill('Live Capture'));

      fireEvent.click(screen.getByText('Reset Filters'));

      expect(screen.getByText('Collision Alpha')).toBeTruthy();
    });

    /*
      Most replays have no captured session behind them, and two pills where one
      hides everything and the other does nothing is furniture.
    */
    it('should not offer the pills when nothing was captured', () => {
      render(
        <ReplayMasterIncidentTimeline
          events={events}
          availableClasses={['GT3', 'P2']}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Live Capture' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Log Only' })).toBeNull();
    });
  });

  it('applies type/search/limited-data filters and reset behavior', () => {
    render(
      <ReplayMasterIncidentTimeline
        events={events}
        availableClasses={['GT3', 'P2']}
      />,
    );

    expect(screen.getByText('Penalty Bravo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Penalty' }));
    expect(screen.queryByText('Penalty Bravo')).toBeNull();

    fireEvent.change(screen.getByPlaceholderText('Search driver / car #'), {
      target: { value: 'alpha' },
    });
    expect(screen.getByText('Collision Alpha')).toBeTruthy();
    expect(screen.queryByText('Limited Data Event')).toBeNull();

    fireEvent.click(screen.getByText('Reset Filters'));
    expect(screen.getByText('Penalty Bravo')).toBeTruthy();

    fireEvent.click(screen.getByText('Hide Limited Data'));
    expect(screen.queryByText('Limited Data Event')).toBeNull();
  });
});
