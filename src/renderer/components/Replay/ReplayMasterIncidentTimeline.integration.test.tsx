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
