import { sendMessage } from '@/renderer/utils/postMessage';
import { CONSTANTS } from '@constants';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import VideocamIcon from '@mui/icons-material/Videocam';
import CameraOutdoorIcon from '@mui/icons-material/CameraOutdoor';
import { ReactNode, useEffect, useRef, useState } from 'react';

export type CameraMode = 'driving' | 'onboard' | 'trackside';

type CameraCommand = {
  cameraGroup: string;
  direction: 0 | 1;
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

export const useReplayCameraControls = (cameraCommandDebounceMs: number) => {
  const [cameraMode, setCameraMode] = useState<CameraMode>('driving');
  const cameraCommandDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    scheduleCameraCommand(cameraModeConfig[nextMode].nextCommand);
  };

  return {
    cameraMode,
    onCameraModeChange,
    onCycleCamera,
  };
};
