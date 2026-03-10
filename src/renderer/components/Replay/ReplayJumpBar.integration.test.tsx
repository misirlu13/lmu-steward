import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { ReplayJumpBar } from './ReplayJumpBar';
import { sendMessage } from '@/renderer/utils/postMessage';
import { ReplayIncidentEvent } from './ReplayMasterIncidentTimeline';

jest.mock('@/renderer/utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

describe('ReplayJumpBar integration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const incidents: ReplayIncidentEvent[] = [
    {
      id: 'incident-a',
      type: 'collision' as const,
      timestampLabel: '00:00:10',
      lapLabel: 'Lap 1',
      drivers: [{ displayName: 'Driver A', carNumber: '1', carClass: 'GT3' }],
    },
    {
      id: 'incident-b',
      type: 'penalty' as const,
      timestampLabel: '00:00:20',
      lapLabel: 'Lap 2',
      drivers: [{ displayName: 'Driver B', carNumber: '2', carClass: 'P2' }],
    },
  ];

  it('debounces next-incident jump and emits selected incident', () => {
    const onJumpToIncident = jest.fn();

    render(
      <ReplayJumpBar
        incidents={incidents}
        selectedIncidentId="incident-a"
        onJumpToIncident={onJumpToIncident}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next Incident' }));

    expect(onJumpToIncident).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(onJumpToIncident).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onJumpToIncident).toHaveBeenCalledWith(incidents[1]);
  });

  it('debounces camera mode changes and sends expected camera command', () => {
    render(<ReplayJumpBar incidents={incidents} />);

    fireEvent.click(screen.getByRole('button', { name: /onboard/i }));

    expect(sendMessage).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(sendMessage).toHaveBeenCalledWith(
      CONSTANTS.API.POST_CAMERA_ANGLE,
      CONSTANTS.REPLAY_COMMANDS.CAMERA.ONBOARD_ANGLE_NEXT,
    );
  });
});
