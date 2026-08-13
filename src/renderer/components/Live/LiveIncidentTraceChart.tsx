import { Box, Stack, Typography, useTheme } from '@mui/material';
import { LiveIncidentFrame } from '@types';
import { LiveIncidentTrace } from './liveFixtures';

/**
 * Throttle, brake, speed and steering for each car through the captured window.
 *
 * Throttle, brake and speed are drawn together, and every trace shares one
 * speed scale, because separate scales would make two cars look alike when they
 * were 40 kph apart. The position summary under each trace is not decoration: a
 * brake spike is innocent if there is a corner there, so the trace is only
 * evidence when read with where the car actually was.
 *
 * The shaded band around the contact line is the same honesty applied to the
 * time axis. LMU reports the contact against a coarser clock than the frames
 * are sampled at, so the instant is a range; drawing it stops the dashed line
 * being read as a precision it does not have.
 *
 * Steering gets its own band below the inputs rather than a fourth overlay,
 * because it is signed where throttle and brake are 0..1 — its zero is the
 * middle of its band, not the baseline, and an area drawn up from the bottom
 * would put a straight-ahead car at half throttle.
 *
 * Two deliberate choices, both settled against the captured sessions on disk
 * rather than against the fixtures — see plans/live-capture-investigation.md:
 *
 *  - **The steering axis is fixed full-scale, −1..+1, never autoscaled.** Real
 *    incidents use the whole range: of the car traces that were actually moving,
 *    only 1% peak below 0.1 and the median uses 0.82 of the 2.0 available.
 *    Autoscaling would buy nothing on that data and would cost the one thing
 *    this trace exists for — a gentle correction and a deliberate swerve would
 *    draw identically, and the steward comparing two cars would be comparing two
 *    different axes.
 *  - **One SVG per car, not one per channel.** 86% of captured incidents carry a
 *    single car's window, so a per-channel layout overlaying "both cars" would
 *    be stacking four bands to draw one car, and would break the per-car tie
 *    between a trace and the position summary it has to be read with.
 *
 * Which sign is left and which is right is *not* established — nothing in the
 * sidecar or the SDK header we vendor documents it, so the axis is labelled by
 * magnitude only. Steering tracks yaw rate closely in the captured data
 * (r = +0.71), so the channel is coherent; that is a different claim from
 * knowing its handedness, and a stewarding tool must not guess at the
 * difference between turning into a car and turning away from one.
 */

const VIEW_WIDTH = 600;
/** The throttle/brake/speed band, unchanged: 0..1 and speed run bottom-up. */
const INPUT_HEIGHT = 84;
const BAND_GAP = 8;
const STEER_HEIGHT = 48;
const STEER_TOP = INPUT_HEIGHT + BAND_GAP;
const STEER_ZERO_Y = STEER_TOP + STEER_HEIGHT / 2;
const VIEW_HEIGHT = STEER_TOP + STEER_HEIGHT;
const MPS_TO_KPH = 3.6;

/**
 * Full lock either way, clamped.
 *
 * The clamp is what keeps the fixed axis honest: a value outside −1..1 would
 * draw outside its band and over the inputs above it, and a non-finite one
 * would silently void the whole path element rather than dropping a point.
 */
const clampSteering = (value: number): number =>
  Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

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
        `${index === 0 ? 'M' : 'L'}${toX(frame.t)} ${INPUT_HEIGHT - value(frame) * INPUT_HEIGHT}`,
    )
    .join(' ');

  return `${line} L${toX(frames[frames.length - 1].t)} ${INPUT_HEIGHT} L${toX(frames[0].t)} ${INPUT_HEIGHT} Z`;
};

/** Zero at the middle of the steering band, +1 at its top, −1 at its bottom. */
const toSteerY = (frame: LiveIncidentFrame): number =>
  STEER_ZERO_Y - (clampSteering(frame.steering) * STEER_HEIGHT) / 2;

/**
 * The largest input the driver actually made, stated as a number.
 *
 * A fixed axis is the right call for comparing two cars, but it means a small
 * input draws small — so the magnitude is also written out, where a steward
 * reading "peak 0.23" cannot mistake a shallow trace for a missing one.
 */
const steeringSummary = (frames: LiveIncidentFrame[]): string => {
  const peak = frames.reduce(
    (most, frame) => Math.max(most, Math.abs(clampSteering(frame.steering))),
    0,
  );

  return `peak steering ${peak.toFixed(2)}`;
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
    INPUT_HEIGHT - (frame.speed / speedMax) * INPUT_HEIGHT;

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
        <Typography variant="caption" sx={{ color: theme.palette.info.main }}>
          steering
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
            <Typography variant="caption" color="text.secondary">
              {steeringSummary(trace.frames)}
            </Typography>
          </Stack>

          <Box
            component="svg"
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            sx={{
              width: '100%',
              height: VIEW_HEIGHT,
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

            {/*
              The steering band. Its full height is full lock either way, drawn
              whether or not the driver used it — a band that resized itself to
              the input would make every trace look like the same swerve.
            */}
            <rect
              x={0}
              y={STEER_TOP}
              width={VIEW_WIDTH}
              height={STEER_HEIGHT}
              fill="none"
              stroke={theme.palette.divider}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {/*
              Straight ahead. Faint and dotted so a car that never turned reads
              as a solid trace resting on a reference, not as a missing channel.
            */}
            <line
              x1={0}
              x2={VIEW_WIDTH}
              y1={STEER_ZERO_Y}
              y2={STEER_ZERO_Y}
              stroke={theme.palette.divider}
              strokeWidth={1}
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
            <path
              data-testid="trace-steering"
              d={buildPath(trace.frames, toX, toSteerY)}
              fill="none"
              stroke={theme.palette.info.main}
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />

            {/* Last, so the contact instant reads across both bands. */}
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

      <Typography variant="caption" color="text.secondary" display="block">
        {caption}
      </Typography>
      {/*
        Stated rather than implied. The steering band is the one axis here a
        reader could reasonably assume was fitted to the data, and if they
        assumed that they would read every trace as a bigger input than it was.
      */}
      <Typography variant="caption" color="text.secondary" display="block">
        The lower band is steering, drawn full-scale from −1 to +1 lock with
        straight ahead through the middle, so inputs stay comparable between
        cars and between incidents. Which side is which is not recorded.
      </Typography>
    </Box>
  );
};
