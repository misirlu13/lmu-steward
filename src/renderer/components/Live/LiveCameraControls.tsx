import { useEffect, useState } from 'react';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HistoryIcon from '@mui/icons-material/History';
import LocalParkingIcon from '@mui/icons-material/LocalParking';
import SensorsIcon from '@mui/icons-material/Sensors';
import {
  Box,
  Button,
  Chip,
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
import { LiveGameCameraReading } from '../../hooks/useLiveGameState';
import {
  REPLAY_SPEEDS,
  ReplaySpeed,
  replaySpeedLabel,
  useReplaySpeed,
} from '../../hooks/useReplayPlaybackControls';
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
  /** Whether the game is showing a rewound picture. Null when unknown. */
  isReplayActive: boolean | null;
  /** What the game reports its camera is doing, to reconcile the group against. */
  gameCamera?: LiveGameCameraReading;
  onReturnToLive: () => void;
}

/**
 * The live session's camera bar: which angle, which car, and — once the steward
 * has rewatched something — how fast the rewound picture is playing.
 *
 * Still a slimmer thing than the replay's jump bar, and for the same reason:
 * there is no timeline here. A live session has no scrubber, no incident to
 * seek forwards to, and nothing to pause *into*, so those controls are absent
 * rather than disabled — a greyed-out play button invites a steward to wonder
 * what is broken. **Speed is the exception, and only while a replay is
 * playing.** It appears when the game says the picture is rewound and vanishes
 * when it is not, because LMU resets playback to 1x on the way back to live and
 * a control showing a rung the game has already discarded is a lie.
 *
 * Camera group and angle go through the same endpoint the replay uses, and the
 * driver cycle uses `/rest/watch/focus`, which the watchlist and the dossier
 * already drive. Both of those are now reconciled against what the game reports
 * rather than against what this bar last asked for.
 *
 * It sits fixed at the bottom of the shell, above every section, for the same
 * reason the session header sits above them: which car the steward is watching
 * is not a property of the screen they happen to be on. That is also why the
 * replay warning lives here — it is true of the whole app, not of one view.
 */
export const LiveCameraControls: React.FC<LiveCameraControlsProps> = ({
  standings,
  classFilter,
  focusedSlotId,
  onCycleFocus,
  isReplayActive,
  gameCamera,
  onReturnToLive,
}) => {
  const { subscribeToApiChannel } = useApi();
  const { cameraMode, onCameraModeChange, onCycleCamera } = useCameraControls(
    CAMERA_COMMAND_DEBOUNCE_MS,
    gameCamera,
  );
  const { speed, onSpeedChange } = useReplaySpeed();
  const [cameraError, setCameraError] = useState<string | undefined>();

  /*
    `/rest/replay/CameraController/setCamera` is named for the replay but is
    **not replay-only** — verified against a live 38-car practice session at
    Circuit of the Americas on 2026-08-08, with `/rest/replay/isActive` false
    throughout. All three groups move the live camera.

    Keep this subscription anyway, but know what it can and cannot catch. The
    endpoint answers 200 to any well-formed body — a bogus `cameraGroup`, a
    `direction` of 99 and `{}` all come back 200 — so the game never reports
    refusing a command we could actually send. The only failure that reaches
    here is the fetch itself throwing, i.e. LMU gone or not listening, which is
    a transport fault rather than a refusal.
  */
  useEffect(() => {
    const unsubscribe = subscribeToApiChannel(
      CONSTANTS.API.POST_CAMERA_ANGLE,
      (payload: unknown) => {
        const response = payload as { status?: string; message?: string };
        setCameraError(
          response?.status === 'error'
            ? (response.message ??
                'Le Mans Ultimate did not answer the camera command.')
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
                {/*
                  Because 21% of steps land on one. Eight of the 38 cars in the
                  verification session were pitted, and on a trackside camera a
                  pitted car is a static shot of empty pit boxes — the steward
                  finds out by looking at the game, having already moved the
                  camera off whatever they were watching. Render-only: the
                  standing already carries this.
                */}
                {focused.pitStatus !== 'TRK' ? (
                  <Tooltip
                    title={
                      focused.pitStatus === 'GAR'
                        ? 'In the garage. A trackside camera will show a stationary car.'
                        : 'In the pits. A trackside camera will show a stationary car.'
                    }
                  >
                    <Chip
                      size="small"
                      icon={<LocalParkingIcon sx={{ fontSize: 12 }} />}
                      label={focused.pitStatus === 'GAR' ? 'Garage' : 'Pits'}
                      color="warning"
                      variant="outlined"
                      sx={{ height: 20, fontSize: 10 }}
                    />
                  </Tooltip>
                ) : null}
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

        {/*
          Only while the game is actually rewound, and only on the game's word.
          `isReplayActive` is polled rather than remembered because
          `/rest/replay/toggleactive` has no setter: the steward can press LMU's
          own LIVE button at any moment, and a bar tracking this locally would
          then offer "View live" on a live session and toggle *into* a replay.

          The sentence is the point of the whole strip. Scoring does not follow
          the picture — verified live, and the reason a live capture survives
          being scrubbed at all — so the timing screen, track map, pressure
          monitor and standings all keep showing the running session while the
          game shows something from minutes ago. The plan ruled that a
          half-moved view is worse than either whole one, which leaves saying so
          out loud as the only honest option.
        */}
        {isReplayActive === true ? (
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'warning.main',
              backgroundColor: (theme) => `${theme.palette.warning.main}14`,
            }}
          >
            <Chip
              size="small"
              icon={<HistoryIcon sx={{ fontSize: 13 }} />}
              label="Replay"
              color="warning"
              sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
            />
            {/*
              Short enough to survive the bar it lives in. The full sentence
              would not fit beside the driver group, the speed ladder and the
              three camera groups at 1264 px — measured, not guessed — and a
              sentence that truncates to "the rest of the app is sti…" fails at
              the one job this strip has. The tooltip carries the detail.
            */}
            <Tooltip title="Only the game's picture is rewound. Timing, the track map, the pressure monitor and standings are all still showing the running session, and the session is still being captured.">
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ flexShrink: 0 }}
              >
                Picture only — timing stays live
              </Typography>
            </Tooltip>

            <ToggleButtonGroup
              size="small"
              exclusive
              value={speed}
              aria-label="Replay speed"
              onChange={(_, value: ReplaySpeed | null) => {
                if (value) {
                  onSpeedChange(value);
                }
              }}
            >
              {REPLAY_SPEEDS.map((option) => (
                <ToggleButton key={option} value={option}>
                  {replaySpeedLabel[option]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Button
              size="small"
              variant="contained"
              startIcon={<SensorsIcon sx={{ fontSize: 14 }} />}
              onClick={onReturnToLive}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              View live
            </Button>
          </Stack>
        ) : null}

        {/*
          Not "camera command refused", which is a failure the game cannot
          produce. `setCamera` answers 200 to any well-formed body — a
          `cameraGroup` of "Banana", a `direction` of 99 and `{}` all come back
          200 — so it never refuses a command this app is capable of sending.
          The only thing that reaches here is the fetch throwing, which means
          LMU is gone or not listening, and the old wording sent a steward
          looking at their camera settings for a dead game.
        */}
        {cameraError ? (
          <Tooltip title={cameraError}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
              <Typography variant="caption" color="warning.main">
                Lost contact with the game
              </Typography>
            </Stack>
          </Tooltip>
        ) : null}

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ flexShrink: 0 }}
        >
          {/*
            The word goes when the replay strip arrives, because the bar has
            only so much room and this is the least informative thing on it —
            three labelled buttons with icons, each with its own tooltip, do not
            need a heading. Losing a camera group off the right edge would be
            the alternative, and that was what happened before this line.
          */}
          {isReplayActive === true ? null : (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
            >
              Camera
            </Typography>
          )}

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
