import { useEffect, useState } from 'react';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
  Box,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { CONSTANTS } from '@constants';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import { useApi } from '../../providers/ApiContext';
import {
  CameraMode,
  cameraModeConfig,
  useCameraControls,
} from '../../hooks/useCameraControls';
import { LiveStanding } from './liveFixtures';

const CAMERA_COMMAND_DEBOUNCE_MS = 300;

/**
 * How much room the fixed bar takes at the bottom of the window.
 *
 * Exported because the shell has to subtract it from the height it gives a
 * section — a bar that overlaps the bottom of the timing table would hide the
 * back of the field.
 */
export const LIVE_CAMERA_BAR_HEIGHT = 64;

interface LiveCameraControlsProps {
  /** The field, in classification order, as the cycle steps through it. */
  standings: LiveStanding[];
  /** The class the timing side is narrowed to, or `ALL`. */
  classFilter: string;
  focusedSlotId?: number;
  onCycleFocus: (direction: 'previous' | 'next') => void;
}

/**
 * The live session's camera bar: which angle, and which car.
 *
 * A deliberately slimmer thing than the replay's jump bar, because two thirds
 * of that bar cannot exist here. **There is no playback and no timeline in a
 * live session** — the session is happening, so there is nothing to pause, no
 * speed to change, and no incident to jump backwards to. Those controls are not
 * disabled here, they are absent: a greyed-out play button invites a steward to
 * wonder what is broken.
 *
 * What is left is the half that does work live. Camera group and angle go
 * through the same endpoint the replay uses, and the driver cycle uses
 * `/rest/watch/focus`, which the watchlist and the dossier already drive.
 *
 * It sits fixed at the bottom of the shell, above every section, for the same
 * reason the session header sits above them: which car the steward is watching
 * is not a property of the screen they happen to be on.
 */
export const LiveCameraControls: React.FC<LiveCameraControlsProps> = ({
  standings,
  classFilter,
  focusedSlotId,
  onCycleFocus,
}) => {
  const { subscribeToApiChannel } = useApi();
  const { cameraMode, onCameraModeChange, onCycleCamera } = useCameraControls(
    CAMERA_COMMAND_DEBOUNCE_MS,
  );
  const [cameraError, setCameraError] = useState<string | undefined>();

  /*
    The camera-angle endpoint is `/rest/replay/CameraController/setCamera` —
    named for the replay, and never yet exercised against a live session. If it
    turns out to be replay-only, the buttons would otherwise do nothing at all
    with no explanation, which is the worst of the available outcomes. The
    failure is caught and shown instead.
  */
  useEffect(() => {
    const unsubscribe = subscribeToApiChannel(
      CONSTANTS.API.POST_CAMERA_ANGLE,
      (payload: unknown) => {
        const response = payload as { status?: string; message?: string };
        setCameraError(
          response?.status === 'error'
            ? (response.message ?? 'The game refused the camera command.')
            : undefined,
        );
      },
    );

    return () => unsubscribe?.();
  }, [subscribeToApiChannel]);

  const focused = standings.find(
    (standing) =>
      standing.slotId !== undefined && standing.slotId === focusedSlotId,
  );
  const cyclable = standings.some(
    (standing) =>
      standing.slotId !== undefined &&
      (classFilter === 'ALL' || standing.carClass === classFilter),
  );

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Camera controls"
      sx={{
        borderColor: 'divider',
        borderRadius: 0,
        px: 2,
        py: 1,
        height: LIVE_CAMERA_BAR_HEIGHT,
        boxSizing: 'border-box',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        boxShadow: (theme) => `0 -2px 8px ${theme.palette.primary.main}33`,
      }}
    >
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ height: '100%' }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
          >
            Watching
          </Typography>

          <Tooltip title="Previous car in the classification">
            <span>
              <IconButton
                size="small"
                aria-label="Previous car"
                disabled={!cyclable}
                onClick={() => onCycleFocus('previous')}
              >
                <ArrowBackIosNewIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span>
          </Tooltip>

          {/*
            Fixed width so stepping through the field does not shuffle the
            camera controls sideways under the steward's cursor.
          */}
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            sx={{ minWidth: 240 }}
          >
            {focused ? (
              <>
                <Typography variant="body2" color="text.secondary">
                  #{focused.carNumber}
                </Typography>
                <CarClassBadge carClass={focused.carClass} />
                <Typography variant="body2" fontWeight={700} noWrap>
                  {focused.displayName}
                </Typography>
                {focused.isAiDriver ? <AiBadge /> : null}
              </>
            ) : (
              /*
                Not "no car is being watched" — the game is always showing
                somebody. This says only that nothing has been chosen from here
                yet, because the app has no way to ask the game who is on
                screen without polling it.
              */
              <Typography variant="body2" color="text.secondary">
                {cyclable ? 'No car selected yet' : 'No cars to follow'}
              </Typography>
            )}
          </Stack>

          <Tooltip title="Next car in the classification">
            <span>
              <IconButton
                size="small"
                aria-label="Next car"
                disabled={!cyclable}
                onClick={() => onCycleFocus('next')}
              >
                <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </span>
          </Tooltip>

          {classFilter !== 'ALL' ? (
            <Tooltip title="The camera steps through this class only, matching the timing screen's filter.">
              <Typography variant="caption" color="primary.main">
                {classFilter} only
              </Typography>
            </Tooltip>
          ) : null}
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0 }} />

        {cameraError ? (
          <Tooltip title={cameraError}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
              <Typography variant="caption" color="warning.main">
                Camera command refused
              </Typography>
            </Stack>
          </Tooltip>
        ) : null}

        <Stack direction="row" spacing={1} alignItems="center">
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
          >
            Camera
          </Typography>

          <Tooltip title="Previous angle in this group">
            <IconButton
              size="small"
              aria-label="Previous camera angle"
              onClick={() => onCycleCamera('previous')}
            >
              <ArrowBackIosNewIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={cameraMode}
            aria-label="Camera group"
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

          <Tooltip title="Next angle in this group">
            <IconButton
              size="small"
              aria-label="Next camera angle"
              onClick={() => onCycleCamera('next')}
            >
              <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>
    </Paper>
  );
};
