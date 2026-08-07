import { Box, Stack, Typography, useTheme } from '@mui/material';
import { LiveIncidentFrame } from '@types';
import { LiveIncidentTrace } from './liveFixtures';

/**
 * Throttle, brake and speed for each car through the captured window.
 *
 * The three are drawn together, and every trace shares one speed scale, because
 * separate scales would make two cars look alike when they were 40 kph apart.
 * The position summary under each trace is not decoration: a brake spike is
 * innocent if there is a corner there, so the trace is only evidence when read
 * with where the car actually was.
 *
 * The shaded band around the contact line is the same honesty applied to the
 * time axis. LMU reports the contact against a coarser clock than the frames
 * are sampled at, so the instant is a range; drawing it stops the dashed line
 * being read as a precision it does not have.
 */

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 84;
const MPS_TO_KPH = 3.6;

interface LiveIncidentTraceChartProps {
  traces: LiveIncidentTrace[];
  anchorErrorSeconds?: number;
}

const buildPath = (
  frames: LiveIncidentFrame[],
  toX: (t: number) => number,
  toY: (frame: LiveIncidentFrame) => number,
): string =>
  frames
    .map(
      (frame, index) =>
        `${index === 0 ? 'M' : 'L'}${toX(frame.t)} ${toY(frame)}`,
    )
    .join(' ');

const buildArea = (
  frames: LiveIncidentFrame[],
  toX: (t: number) => number,
  value: (frame: LiveIncidentFrame) => number,
): string => {
  const line = frames
    .map(
      (frame, index) =>
        `${index === 0 ? 'M' : 'L'}${toX(frame.t)} ${VIEW_HEIGHT - value(frame) * VIEW_HEIGHT}`,
    )
    .join(' ');

  return `${line} L${toX(frames[frames.length - 1].t)} ${VIEW_HEIGHT} L${toX(frames[0].t)} ${VIEW_HEIGHT} Z`;
};

const positionSummary = (frames: LiveIncidentFrame[]): string => {
  const offTrack = frames.some(
    (frame) =>
      Math.abs(frame.trackEdge) > 0 &&
      Math.abs(frame.pathLateral) > Math.abs(frame.trackEdge),
  );

  const distances = frames.map((frame) => frame.lapDist);
  const from = Math.round(Math.min(...distances));
  const to = Math.round(Math.max(...distances));

  return `${offTrack ? 'Left the track' : 'On track throughout'} · ${from}–${to} m`;
};

export const LiveIncidentTraceChart: React.FC<LiveIncidentTraceChartProps> = ({
  traces,
  anchorErrorSeconds,
}) => {
  const theme = useTheme();

  const usable = traces.filter((trace) => trace.frames.length >= 2);
  if (usable.length === 0) {
    return null;
  }

  const allFrames = usable.flatMap((trace) => trace.frames);
  const tMin = Math.min(...allFrames.map((frame) => frame.t));
  const tMax = Math.max(...allFrames.map((frame) => frame.t));
  const speedMax = Math.max(...allFrames.map((frame) => frame.speed), 1);

  const toX = (t: number) =>
    tMax === tMin ? 0 : ((t - tMin) / (tMax - tMin)) * VIEW_WIDTH;
  const toSpeedY = (frame: LiveIncidentFrame) =>
    VIEW_HEIGHT - (frame.speed / speedMax) * VIEW_HEIGHT;

  const contactX = toX(0);

  /*
    How wide the contact instant actually is.

    `anchorErrorSeconds` was already stated in the caption, which answers "how
    precise is this" but not the question a steward is actually asking — "is
    that brake release before the contact or after it?". Drawn against the same
    axis as the traces, the band answers it directly: an input inside the band
    cannot be ordered against the contact at all, and one outside it can.

    Clamped to the viewport, because the error can exceed the captured window on
    a sparsely sampled incident and a band running off the chart would read as
    no band at all.
  */
  const bandLeft = Math.max(0, toX(-(anchorErrorSeconds ?? 0)));
  const bandRight = Math.min(VIEW_WIDTH, toX(anchorErrorSeconds ?? 0));
  const bandWidth =
    anchorErrorSeconds !== undefined && anchorErrorSeconds > 0
      ? Math.max(0, bandRight - bandLeft)
      : 0;

  /*
    The band and the figure say the same thing, so the caption names the band
    where there is one and falls back to the bare number where the error is
    zero or unknown — a sentence pointing at a band nobody can see is worse than
    no sentence.
  */
  const caption =
    bandWidth > 0
      ? `The dashed line is the reported contact, and the shaded band is how precisely it could be located: ±${(anchorErrorSeconds as number).toFixed(2)}s. Inputs inside the band cannot be ordered against the contact.`
      : anchorErrorSeconds !== undefined
        ? `The dashed line is the reported contact, located to within ${anchorErrorSeconds.toFixed(2)}s.`
        : 'The dashed line is the reported contact.';

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="baseline" spacing={1.5} sx={{ mb: 1 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
        >
          Inputs and speed
        </Typography>
        <Typography
          variant="caption"
          sx={{ color: theme.palette.success.main }}
        >
          throttle
        </Typography>
        <Typography variant="caption" sx={{ color: theme.palette.error.main }}>
          brake
        </Typography>
        <Typography variant="caption" color="text.primary">
          speed
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {tMin.toFixed(1)}s to +{tMax.toFixed(1)}s · peak{' '}
          {(speedMax * MPS_TO_KPH).toFixed(0)} kph
        </Typography>
      </Stack>

      {usable.map((trace) => (
        <Box key={trace.steamId} sx={{ mb: 1.5 }}>
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography variant="caption" fontWeight={700}>
              {trace.displayName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {positionSummary(trace.frames)}
            </Typography>
          </Stack>

          <Box
            component="svg"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            sx={{
              width: '100%',
              height: 84,
              display: 'block',
              backgroundColor: 'background.default',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            {/*
              Behind the traces on purpose: it is the context they are read in,
              not a channel of its own, and drawn over the top it would wash out
              the brake trace it exists to help interpret.
            */}
            {bandWidth > 0 ? (
              <rect
                data-testid="trace-uncertainty-band"
                x={bandLeft}
                y={0}
                width={bandWidth}
                height={VIEW_HEIGHT}
                fill={theme.palette.warning.main}
                opacity={0.16}
              />
            ) : null}
            <path
              d={buildArea(trace.frames, toX, (frame) => frame.throttle)}
              fill={theme.palette.success.main}
              opacity={0.22}
            />
            <path
              d={buildArea(trace.frames, toX, (frame) => frame.brake)}
              fill={theme.palette.error.main}
              opacity={0.28}
            />
            <path
              d={buildPath(trace.frames, toX, toSpeedY)}
              fill="none"
              stroke={theme.palette.text.primary}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={contactX}
              x2={contactX}
              y1={0}
              y2={VIEW_HEIGHT}
              stroke={theme.palette.warning.main}
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          </Box>
        </Box>
      ))}

      <Typography variant="caption" color="text.secondary">
        {caption}
      </Typography>
    </Box>
  );
};
