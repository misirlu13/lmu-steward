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
        The dashed line is the reported contact
        {anchorErrorSeconds !== undefined
          ? `, located to within ${anchorErrorSeconds.toFixed(2)}s`
          : ''}
        .
      </Typography>
    </Box>
  );
};
