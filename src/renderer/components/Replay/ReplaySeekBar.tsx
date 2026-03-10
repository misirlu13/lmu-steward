import { sendMessage } from '@/renderer/utils/postMessage';
import { CONSTANTS } from '@constants';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FastForwardIcon from '@mui/icons-material/FastForward';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import VideocamIcon from '@mui/icons-material/Videocam';
import CameraOutdoorIcon from '@mui/icons-material/CameraOutdoor';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import {
  Box,
  IconButton,
  Paper,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useState } from 'react';

interface ReplayJumpBarProps {
  totalDurationSeconds?: number | null;
}

type CameraMode = 'driving' | 'onboard' | 'trackside';

const cameraModeConfig: Record<
  CameraMode,
  {
    label: string;
    icon: React.ReactNode;
    previousCommand: { cameraGroup: string; direction: 0 | 1 };
    nextCommand: { cameraGroup: string; direction: 0 | 1 };
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

const formatDurationLabel = (seconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const ReplayJumpBar = ({ totalDurationSeconds }: ReplayJumpBarProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [cameraMode, setCameraMode] = useState<CameraMode>('driving');
  const [jumpPercent, setJumpPercent] = useState(0);
  const [currentPlaybackDirection, setCurrentPlaybackDirection] = useState<'forward' | 'reverse'>('forward');

  const hasValidDuration =
    Number.isFinite(totalDurationSeconds) && Number(totalDurationSeconds) > 0;
  const replayDurationSeconds = hasValidDuration
    ? Number(totalDurationSeconds)
    : 0;
  const jumpTargetSeconds = hasValidDuration
    ? (jumpPercent / 100) * replayDurationSeconds
    : 0;

  const onReverseScan = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.REVERSE_SCAN,
    );
    setCurrentPlaybackDirection('reverse');
    setIsPlaying(true);
  };

  const onReverse = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.PLAYBACK_BACKWARDS,
    );
    setCurrentPlaybackDirection('reverse');
    setIsPlaying(true);
  };

  const onReverseSlow = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.SLOW_BACKWARDS,
    );
    setCurrentPlaybackDirection('reverse');
    setIsPlaying(true);
  };

  const onForwardScan = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.FORWARD_SCAN,
    );
    setCurrentPlaybackDirection('forward');
    setIsPlaying(true);
  };

  const onForward = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.PLAY,
    );
    setCurrentPlaybackDirection('forward');
    setIsPlaying(true);
  };

  const onForwardSlow = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.SLOW,
    );
    setCurrentPlaybackDirection('forward');
    setIsPlaying(true);
  };

  const onReverseBySpeed = () => {
    if (speed === 0.5) {
      onReverseSlow();
      return;
    }
    if (speed === 1) {
      onReverse();
      return;
    }
    onReverseScan();
  };

  const onForwardBySpeed = () => {
    if (speed === 0.5) {
      onForwardSlow();
      return;
    }
    if (speed === 1) {
      onForward();
      return;
    }
    onForwardScan();
  };

  const onPlayPause = () => {
    if (isPlaying) {
      sendMessage(
        CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
        CONSTANTS.REPLAY_COMMANDS.SCAN.STOP,
      );
      setIsPlaying(false);
    } else {
      if (currentPlaybackDirection === 'reverse') {
        onReverseBySpeed();
        return;
      }
      onForwardBySpeed();
      return;
    }
  };

  const onSpeedChange = (nextSpeed: 0.5 | 1 | 2) => {
    setSpeed(nextSpeed);
    if (currentPlaybackDirection === 'reverse') {
      if (nextSpeed === 0.5) {
        onReverseSlow();
        return;
      }
      if (nextSpeed === 1) {
        onReverse();
        return;
      }
      onReverseScan();
      return;
    }

    if (nextSpeed === 0.5) {
      onForwardSlow();
      return;
    }
    if (nextSpeed === 1) {
      onForward();
      return;
    }
    onForwardScan();
  };

  const onCycleCamera = (direction: 'previous' | 'next') => {
    sendMessage(
      CONSTANTS.API.POST_CAMERA_ANGLE,
      direction === 'previous'
        ? cameraModeConfig[cameraMode].previousCommand
        : cameraModeConfig[cameraMode].nextCommand,
    );
  };

  const onCameraModeChange = (nextMode: CameraMode | null) => {
    if (!nextMode) {
      return;
    }

    setCameraMode(nextMode);
    sendMessage(
      CONSTANTS.API.POST_CAMERA_ANGLE,
      cameraModeConfig[nextMode].nextCommand,
    );
  };

  const onJumpCommit = (value: number | number[]) => {
    if (!hasValidDuration) {
      return;
    }

    const nextPercent = Array.isArray(value) ? value[0] : value;
    const clampedPercent = Math.min(100, Math.max(0, nextPercent));
    setJumpPercent(clampedPercent);

    const jumpSeconds = (clampedPercent / 100) * replayDurationSeconds;
    sendMessage(CONSTANTS.API.PUT_REPLAY_COMMAND_TIME, String(jumpSeconds));
  };

  return (
    <Paper
      variant="outlined"
      sx={{ borderColor: 'divider', borderRadius: 0, p: 2, position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 1000 }}
    >
      <Box sx={{ px: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Replay Jump Bar
        </Typography>
        <Slider
          value={jumpPercent}
          onChange={(_, value) => setJumpPercent(value as number)}
          onChangeCommitted={(_, value) => onJumpCommit(value)}
          size="small"
          min={0}
          max={100}
          disabled={!hasValidDuration}
          valueLabelDisplay="on"
          valueLabelFormat={(value) =>
            hasValidDuration
              ? formatDurationLabel((Number(value) / 100) * replayDurationSeconds)
              : '--:--:--'
          }
        />
        <Typography variant="caption" color="text.secondary">
          {hasValidDuration
            ? `Jump target ${formatDurationLabel(jumpTargetSeconds)} • Not synced with LMU live playback position.`
            : 'Replay duration unavailable. Jump bar is disabled.'}
        </Typography>
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={2}
        justifyContent={{ xs: 'space-between', md: 'space-between' }}
        sx={{ mt: 1 }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
        >
          <IconButton onClick={onReverseBySpeed} size="small">
            <FastRewindIcon />
          </IconButton>
          <IconButton
            onClick={onPlayPause}
            sx={{
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { backgroundColor: 'primary.dark' },
            }}
          >
            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
          <IconButton onClick={onForwardBySpeed} size="small">
            <FastForwardIcon />
          </IconButton>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={speed}
            onChange={(_, value: 0.5 | 1 | 2 | null) => {
              if (value) {
                onSpeedChange(value);
              }
            }}
          >
            <ToggleButton value={0.5}>x0.5</ToggleButton>
            <ToggleButton value={1}>x1.0</ToggleButton>
            <ToggleButton value={2}>x2.0</ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ ml: 'auto' }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase' }}
          >
            Camera
          </Typography>

          <IconButton size="small" onClick={() => onCycleCamera('previous')}>
            <ArrowBackIosNewIcon sx={{ fontSize: 14 }} />
          </IconButton>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={cameraMode}
            onChange={(_, value: CameraMode | null) =>
              onCameraModeChange(value)
            }
          >
            {(Object.keys(cameraModeConfig) as CameraMode[]).map((mode) => (
              <ToggleButton key={mode} value={mode}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {cameraModeConfig[mode].icon}
                  <span>{cameraModeConfig[mode].label}</span>
                </Stack>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <IconButton size="small" onClick={() => onCycleCamera('next')}>
            <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Stack>
      </Stack>
    </Paper>
  );
};
