import { act, render } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { sendMessage } from '../utils/postMessage';
import {
  CameraMode,
  cameraModeConfig,
  cameraModeFromGroup,
  useCameraControls,
} from './useCameraControls';

jest.mock('../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

describe('reading LMU camera groups', () => {
  /*
    All four values were measured on 2026-08-08 by setting each group from the
    app and reading `getCameraInfo` back. The pair matters more than the list:
    trackside answers `TracksideCycle` on the auto-director entry and
    `Trackside` once stepped onto a numbered group, and `TracksideCycle` is
    where the group *starts* — so an equality compare gets three of four right
    and fails on the common one.
  */
  it.each([
    ['Driving', 'driving'],
    ['Onboard', 'onboard'],
    ['Trackside', 'trackside'],
    ['TracksideCycle', 'trackside'],
  ])('should read %s as the %s group', (group, expected) => {
    expect(cameraModeFromGroup(group)).toBe(expected);
  });

  it('should not care about case or padding', () => {
    expect(cameraModeFromGroup('  tracksidecycle ')).toBe('trackside');
  });

  /*
    Undefined rather than a fallback group: a value LMU adds later should leave
    the bar showing what the steward chose, not snap it somewhere they did not
    ask for.
  */
  it.each([['Banana'], [''], [undefined], [42]])(
    'should refuse to guess at %s',
    (group) => {
      expect(cameraModeFromGroup(group)).toBeUndefined();
    },
  );
});

/*
  The two values LMU actually means something by.

  Measured against a running session on 2026-08-10: with `direction: 0` the
  angle advanced on every call, so previous and next were the same button —
  ONBOARD03 → 04 → 05 → 06 walked forward under alternating clicks. `-1` steps
  back, repeatably, on Driving as well as Onboard. Asserted here because nothing
  about the number 0 looks wrong in a diff, and the endpoint answers 200 either
  way, so the app can never notice this for itself.
*/
describe('the direction LMU steps the camera in', () => {
  it.each([
    ['driving', 'Driving'],
    ['onboard', 'Onboard'],
    ['trackside', 'Trackside'],
  ] as const)('should step %s back with -1 and forward with 1', (_, group) => {
    const config = cameraModeConfig[_ as CameraMode];

    expect(config.previousCommand).toEqual({
      cameraGroup: group,
      direction: -1,
    });
    expect(config.nextCommand).toEqual({ cameraGroup: group, direction: 1 });
  });

  // The value that made both buttons go the same way.
  it('should never send 0 for either direction', () => {
    Object.values(cameraModeConfig).forEach((config) => {
      expect(config.previousCommand.direction).not.toBe(0);
      expect(config.nextCommand.direction).not.toBe(0);
    });
  });
});

const Harness: React.FC<{ reported?: { mode?: CameraMode } }> = ({
  reported,
}) => {
  const { cameraMode, onCameraModeChange, onCycleCamera } = useCameraControls(
    0,
    reported,
  );

  return (
    <>
      <button
        type="button"
        data-mode={cameraMode}
        onClick={() => onCameraModeChange('onboard')}
      >
        {cameraMode}
      </button>
      <button
        type="button"
        data-testid="prev"
        onClick={() => onCycleCamera('previous')}
      >
        prev
      </button>
      <button
        type="button"
        data-testid="next"
        onClick={() => onCycleCamera('next')}
      >
        next
      </button>
    </>
  );
};

const modeOn = (container: HTMLElement) =>
  container.querySelector('button')?.getAttribute('data-mode');

describe('reconciling the camera group against the game', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should adopt the group the game reports', () => {
    const { container, rerender } = render(<Harness />);
    expect(modeOn(container)).toBe('driving');

    rerender(<Harness reported={{ mode: 'trackside' }} />);

    expect(modeOn(container)).toBe('trackside');
  });

  /*
    The reading is the *old* group until the game catches up, and adopting it
    would flick the toggle back under the steward's finger a fraction of a
    second after they pressed it.
  */
  it('should keep a group the app just asked for until the game confirms it', () => {
    const { container, rerender } = render(
      <Harness reported={{ mode: 'driving' }} />,
    );

    act(() => {
      container.querySelector('button')?.click();
    });
    expect(modeOn(container)).toBe('onboard');
    expect(sendMessageMock).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.POST_CAMERA_ANGLE,
      cameraCommandFor('onboard'),
    );

    // A stale reading arrives before the game has moved. It must not win.
    rerender(<Harness reported={{ mode: 'driving' }} />);
    expect(modeOn(container)).toBe('onboard');

    rerender(<Harness reported={{ mode: 'onboard' }} />);
    expect(modeOn(container)).toBe('onboard');
  });

  /*
    And once the app's request has clearly not landed, the game wins anyway —
    the app being unable to get its way is the case where trusting its own idea
    of the camera is most wrong.
  */
  it('should give up on an unconfirmed request and believe the game', () => {
    const { container, rerender } = render(
      <Harness reported={{ mode: 'driving' }} />,
    );

    act(() => {
      container.querySelector('button')?.click();
    });
    expect(modeOn(container)).toBe('onboard');

    act(() => {
      jest.advanceTimersByTime(4000);
    });
    rerender(<Harness reported={{ mode: 'driving' }} />);

    expect(modeOn(container)).toBe('driving');
  });
});

/*
  The reported defect: next, then previous, then next only ever went one way.
  Both buttons were sending the same step, so the pair is asserted together —
  either alone would have passed throughout.
*/
describe('cycling the camera angle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** The direction of each camera command sent, in order. */
  const directionsSent = (): number[] =>
    sendMessageMock.mock.calls
      .filter(([channel]) => channel === CONSTANTS.API.POST_CAMERA_ANGLE)
      .map(([, command]) => (command as { direction: number }).direction);

  const press = (container: HTMLElement, testId: string) =>
    act(() => {
      container
        .querySelector<HTMLElement>(`[data-testid="${testId}"]`)
        ?.click();
      jest.advanceTimersByTime(1);
    });

  it('should send opposite directions for previous and next', () => {
    const { container } = render(<Harness />);

    press(container, 'next');
    press(container, 'prev');
    press(container, 'next');

    expect(directionsSent()).toEqual([1, -1, 1]);
  });

  it('should keep stepping back while previous is pressed', () => {
    const { container } = render(<Harness />);

    press(container, 'prev');
    press(container, 'prev');

    expect(directionsSent()).toEqual([-1, -1]);
  });
});

function cameraCommandFor(mode: CameraMode) {
  return CONSTANTS.REPLAY_COMMANDS.CAMERA[
    mode === 'onboard'
      ? 'ONBOARD_ANGLE_NEXT'
      : mode === 'trackside'
        ? 'TRACKSIDE_ANGLE_NEXT'
        : 'DRIVING_ANGLE_NEXT'
  ];
}
