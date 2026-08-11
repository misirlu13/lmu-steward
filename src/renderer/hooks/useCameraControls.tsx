import { sendMessage } from '@/renderer/utils/postMessage';
import { CONSTANTS } from '@constants';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import VideocamIcon from '@mui/icons-material/Videocam';
import CameraOutdoorIcon from '@mui/icons-material/CameraOutdoor';
import { ReactNode, useEffect, useRef, useState } from 'react';

export type CameraMode = 'driving' | 'onboard' | 'trackside';

type CameraCommand = {
  cameraGroup: string;
  /** -1 back, 1 forward. Not 0/1 — see the note on `CAMERA` in constants. */
  direction: -1 | 1;
};

export const cameraModeConfig: Record<
  CameraMode,
  {
    label: string;
    icon: ReactNode;
    previousCommand: CameraCommand;
    nextCommand: CameraCommand;
  }
> = {
  driving: {
    label: 'Driver',
    icon: <DirectionsCarIcon sx={{ fontSize: 16 }} />,
    previousCommand: CONSTANTS.REPLAY_COMMANDS.CAMERA.DRIVING_ANGLE_PREVIOUS,
    nextCommand: CONSTANTS.REPLAY_COMMANDS.CAMERA.DRIVING_ANGLE_NEXT,
  },
  onboard: {
    label: 'Onboard',
    icon: <VideocamIcon sx={{ fontSize: 16 }} />,
    previousCommand: CONSTANTS.REPLAY_COMMANDS.CAMERA.ONBOARD_ANGLE_PREVIOUS,
    nextCommand: CONSTANTS.REPLAY_COMMANDS.CAMERA.ONBOARD_ANGLE_NEXT,
  },
  trackside: {
    label: 'Trackside',
    icon: <CameraOutdoorIcon sx={{ fontSize: 16 }} />,
    previousCommand: CONSTANTS.REPLAY_COMMANDS.CAMERA.TRACKSIDE_ANGLE_PREVIOUS,
    nextCommand: CONSTANTS.REPLAY_COMMANDS.CAMERA.TRACKSIDE_ANGLE_NEXT,
  },
};

/**
 * LMU's `currentCameraGroup` translated into the group the app draws.
 *
 * **`startsWith`, not equality, and that is the whole point of this function.**
 * Measured on 2026-08-08 by setting each group and reading `getCameraInfo`
 * back: `Driving` → driving, `Onboard` → onboard, and trackside reports
 * **two** values — `TracksideCycle` while the auto-director is picking angles,
 * `Trackside` once the steward has stepped onto a fixed numbered group. A
 * lowercase equality compare handles three of those four cases and fails on the
 * most common one, because `TracksideCycle` is where the group *starts*.
 *
 * Undefined for anything unrecognised, so a group LMU adds later leaves the
 * bar showing what the steward last chose rather than silently snapping it to
 * a wrong guess.
 *
 * Note what is deliberately not read here: `getCameraInfo` also reports
 * `cameraName` (`COCKPIT`, `ONBOARD01`, `TRACKING009`), and that changes by
 * itself as the trackside director cycles. Keying anything on it would make the
 * control move while nobody is touching it.
 */
export const cameraModeFromGroup = (
  currentCameraGroup?: unknown,
): CameraMode | undefined => {
  const group =
    typeof currentCameraGroup === 'string'
      ? currentCameraGroup.trim().toLowerCase()
      : '';

  if (group.startsWith('trackside')) {
    return 'trackside';
  }
  if (group.startsWith('driving')) {
    return 'driving';
  }
  if (group.startsWith('onboard')) {
    return 'onboard';
  }

  return undefined;
};

/**
 * How long a group the app asked for outranks the group the game reports.
 *
 * A camera command is optimistic — the button lights immediately — and the
 * game takes a poll tick or two to agree. Until it agrees, the reported value
 * is the *old* group, and adopting it would flick the toggle back under the
 * steward's finger. After this long without confirmation the game wins anyway:
 * the app being unable to get its way is exactly the case where guessing is
 * worst.
 */
const CAMERA_MODE_CONFIRM_TIMEOUT_MS = 3000;

/**
 * Camera group selection and angle cycling, for any surface that drives LMU's
 * camera.
 *
 * Lived under `components/Replay/hooks` until the live view needed it too.
 * Nothing in it is replay-specific — it posts a camera group and a direction —
 * and the live session's control bar drives exactly the same endpoint.
 *
 * `reportedMode` is what the game says it is actually showing, when the caller
 * is in a position to ask. Callers that pass nothing keep the old behaviour of
 * trusting their own last command, which is all the replay view can do while
 * it drives the picture unilaterally.
 */
export const useCameraControls = (
  cameraCommandDebounceMs: number,
  /**
   * The game's own answer, re-supplied on every reading rather than only when
   * the value changes — a command that never takes effect has to be noticed by
   * the *absence* of a change, which a value-keyed effect cannot see.
   */
  reportedMode?: { mode?: CameraMode },
) => {
  const [cameraMode, setCameraMode] = useState<CameraMode>('driving');
  const cameraCommandDebounceTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingModeRef = useRef<
    { mode: CameraMode; requestedAt: number } | undefined
  >(undefined);

  useEffect(() => {
    const reported = reportedMode?.mode;
    if (!reported) {
      return;
    }

    const pending = pendingModeRef.current;
    if (pending) {
      if (pending.mode === reported) {
        pendingModeRef.current = undefined;
      } else if (
        Date.now() - pending.requestedAt <
        CAMERA_MODE_CONFIRM_TIMEOUT_MS
      ) {
        return;
      } else {
        pendingModeRef.current = undefined;
      }
    }

    setCameraMode((previous) => (previous === reported ? previous : reported));
  }, [reportedMode]);

  useEffect(() => {
    return () => {
      if (cameraCommandDebounceTimeoutRef.current) {
        clearTimeout(cameraCommandDebounceTimeoutRef.current);
      }
    };
  }, []);

  const scheduleCameraCommand = (command: CameraCommand) => {
    if (cameraCommandDebounceTimeoutRef.current) {
      clearTimeout(cameraCommandDebounceTimeoutRef.current);
    }

    cameraCommandDebounceTimeoutRef.current = setTimeout(() => {
      sendMessage(CONSTANTS.API.POST_CAMERA_ANGLE, command);
      cameraCommandDebounceTimeoutRef.current = null;
    }, cameraCommandDebounceMs);
  };

  const onCycleCamera = (direction: 'previous' | 'next') => {
    const command =
      direction === 'previous'
        ? cameraModeConfig[cameraMode].previousCommand
        : cameraModeConfig[cameraMode].nextCommand;

    scheduleCameraCommand(command);
  };

  const onCameraModeChange = (nextMode: CameraMode | null) => {
    if (!nextMode) {
      return;
    }

    setCameraMode(nextMode);
    pendingModeRef.current = { mode: nextMode, requestedAt: Date.now() };
    scheduleCameraCommand(cameraModeConfig[nextMode].nextCommand);
  };

  return {
    cameraMode,
    onCameraModeChange,
    onCycleCamera,
  };
};
