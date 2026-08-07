import { useMemo } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { alpha, Theme, useTheme } from '@mui/material/styles';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import { TrackMap } from '../TrackMap';
import { getCarClassBadgeColor } from '../CarClassBadge/CarClassBadge';
import {
  getTrackMapBounds,
  normalizeTrackWorldPointToSvg,
  TrackPoints,
} from '../../utils/trackMapToSVG';
import { LiveTrackMapState } from '../../hooks/useLiveTrackMap';
import { LiveStanding } from './liveFixtures';

/**
 * The overlay and the outline have to agree about all three of these, or the
 * cars sit beside the track instead of on it. `trackMapToSVG` defaults its
 * padding to the stroke width; passing both explicitly is what keeps the two
 * transforms identical rather than coincidentally equal.
 */
const VIEW_BOX = 1000;
const TRACK_STROKE_WIDTH = 14;

const MARKER_RADIUS = 16;
const FOCUS_RING_RADIUS = 24;

/**
 * Wider than the stroke, so a marker on the outermost point of the track is
 * drawn whole. `normalizeTrackWorldPointToSvg` clamps a car's centre to the
 * padding, which is only enough room if the padding clears the largest thing
 * drawn around that centre — the focus ring.
 */
const TRACK_PADDING = FOCUS_RING_RADIUS + 4;

/** The inset both layers share. One constant, so they cannot drift apart. */
const CANVAS_INSET = 12;

/**
 * How far apart two consecutive pit-lane points may be before the path is
 * broken rather than joined.
 *
 * LMU's pit geometry is not one continuous run: at Laguna Seca the 402 points
 * arrive as three pieces, with steps of 253 and 497 units between them against
 * a median step of 5.3. Joining those would draw two long lines straight across
 * the circuit. The same threshold `trackMapToSVG` uses for the racing line.
 */
const PIT_PATH_MAX_GAP = 40;

/**
 * `getCarClassBadgeColor` answers in theme palette paths (`success.alt`), which
 * `sx` understands and an SVG `fill` does not. Resolving them here is what lets
 * the map use the same class colours as every badge in the app rather than a
 * second palette that drifts.
 */
const resolvePaletteColor = (theme: Theme, token: string): string => {
  if (!token.includes('.')) {
    return token;
  }

  const resolved = token
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      theme.palette,
    );

  return typeof resolved === 'string' ? resolved : token;
};

interface PlacedCar {
  standing: LiveStanding;
  x: number;
  y: number;
}

interface LiveTrackMapProps {
  points: TrackPoints[];
  /** The pit lane, so a car stopped in a garage stall has something to sit on. */
  pitPoints: TrackPoints[];
  state: LiveTrackMapState;
  error?: string;
  /** The rows to place, once the shared class filter has been applied. */
  visibleStandings: LiveStanding[];
  classFilter: string;
  focusedSlotId?: number;
  onFocusCar: (slotId: number | undefined) => void;
}

/**
 * Every car in the session, where it actually is.
 *
 * Two things it deliberately does not do.
 *
 * **It does not interpolate between poll ticks.** Positions arrive at 1 Hz and
 * the markers step, visibly. Smoothing them would mean drawing the app's guess
 * at where a car was rather than where the game said it was — and this is a
 * screen a steward looks at to decide whether a car was where a driver claims.
 * Stepping is honest; a smooth lie is not.
 *
 * **It does not place a car it has no position for.** `posX`/`posZ` come from
 * the sidecar, which is a local build artifact that is not committed, so a
 * machine that has not rebuilt it sends neither for anyone. Missing is not zero:
 * those cars are left off and counted underneath, rather than being drawn in a
 * heap at the corner of the world where the origin happens to fall.
 */
export const LiveTrackMap: React.FC<LiveTrackMapProps> = ({
  points,
  pitPoints,
  state,
  error,
  visibleStandings,
  classFilter,
  focusedSlotId,
  onFocusCar,
}) => {
  const theme = useTheme();

  /*
    Memoised on the geometry alone, so the outline is built once per session
    while the markers move every second. The path is ~1,200 points and the
    markers are the only thing a poll tick changes.
  */
  const outline = useMemo(
    () => (
      <TrackMap
        points={points}
        svgOptions={{
          stroke: alpha(theme.palette.primary.main, 0.45),
          strokeWidth: TRACK_STROKE_WIDTH,
          viewBoxSize: VIEW_BOX,
          padding: TRACK_PADDING,
        }}
      />
    ),
    [points, theme.palette.primary.main],
  );

  /*
    Bounds over the same points the outline is drawn from. `extractTrackMapPoints`
    has already dropped everything that is not the racing line, which is the
    set `trackMapToSVG` narrows to internally — so both transforms see the
    same extent.

    Everything positioned on this map goes through this one value, which is what
    makes the pit path and the cars agree with the outline by construction
    rather than by two implementations happening to match.
  */
  const bounds = useMemo(() => getTrackMapBounds(points), [points]);

  /**
   * The pit lane as an SVG path, in the racing line's coordinate space.
   *
   * Drawn here rather than through `trackMapToSVG` — which filters to the
   * racing line and would recompute bounds from the pit points alone — so it
   * cannot drift from where the cars are drawn.
   */
  const pitPath = useMemo(() => {
    if (!bounds || pitPoints.length < 2) {
      return '';
    }

    let path = '';
    let previous: { x: number; y: number } | null = null;

    pitPoints.forEach((point) => {
      const next = normalizeTrackWorldPointToSvg(
        point,
        bounds,
        VIEW_BOX,
        TRACK_PADDING,
      );
      if (!next) {
        return;
      }

      const broken =
        previous === null ||
        Math.hypot(next.x - previous.x, next.y - previous.y) > PIT_PATH_MAX_GAP;

      path += `${broken ? 'M' : 'L'} ${next.x.toFixed(1)} ${next.y.toFixed(1)} `;
      previous = next;
    });

    return path.trim();
  }, [bounds, pitPoints]);

  const placed = useMemo<PlacedCar[]>(() => {
    if (!bounds) {
      return [];
    }

    return visibleStandings.reduce<PlacedCar[]>((cars, standing) => {
      if (standing.posX === undefined || standing.posZ === undefined) {
        return cars;
      }

      const normalized = normalizeTrackWorldPointToSvg(
        { x: standing.posX, z: standing.posZ },
        bounds,
        VIEW_BOX,
        TRACK_PADDING,
      );

      if (!normalized) {
        return cars;
      }

      cars.push({ standing, x: normalized.x, y: normalized.y });
      return cars;
    }, []);
  }, [bounds, visibleStandings]);

  const unplaced = visibleStandings.length - placed.length;

  const emptyMessage = (): string | undefined => {
    if (state === 'idle') {
      return 'No live session.';
    }
    if (state === 'error') {
      return error ?? 'The game did not return a track map.';
    }
    if (state === 'waiting') {
      /*
        Never "this track has no map". The endpoint was only ever confirmed
        against a session that was already running, so an empty answer during
        load is expected and the fetch keeps retrying behind this.
      */
      return 'Waiting for the game to publish the track geometry…';
    }
    return undefined;
  };

  const message = emptyMessage();

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Track map"
      sx={{
        borderColor: 'divider',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: 2,
          py: 1.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <MapOutlinedIcon color="primary" fontSize="small" />
        <Typography variant="subtitle2" fontWeight={700}>
          Track Map
        </Typography>
        <Box sx={{ flex: 1 }} />
        {classFilter !== 'ALL' ? (
          <Typography variant="caption" color="primary.main">
            {classFilter} only
          </Typography>
        ) : null}
        <Typography variant="caption" color="text.secondary">
          {placed.length} placed
        </Typography>
      </Stack>

      <Box
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 240,
          backgroundColor: 'background.default',
        }}
      >
        {message ? (
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{ height: '100%', px: 3 }}
          >
            <Typography
              variant="body2"
              color="text.secondary"
              textAlign="center"
            >
              {message}
            </Typography>
          </Stack>
        ) : (
          <Box sx={{ position: 'absolute', inset: `${CANVAS_INSET}px` }}>
            {outline}

            {/*
              A second square viewBox over the first, filling the same box. Both
              letterbox the same way inside whatever shape the panel ends up,
              which is what keeps a marker on the track when the container is not
              square.
            */}
            <svg
              viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
              }}
            >
              {/*
                Under the cars and fainter than the racing line: it is context
                for a stopped car, not somewhere anyone is racing.
              */}
              {pitPath ? (
                <path
                  d={pitPath}
                  data-testid="track-map-pit-lane"
                  fill="none"
                  stroke={alpha(theme.palette.text.secondary, 0.35)}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}

              {placed.map(({ standing, x, y }) => {
                const isFocused =
                  standing.slotId !== undefined &&
                  standing.slotId === focusedSlotId;
                const fill = resolvePaletteColor(
                  theme,
                  getCarClassBadgeColor(standing.carClass),
                );

                return (
                  <g
                    key={standing.steamId}
                    data-testid={`track-map-car-${standing.steamId}`}
                    role="button"
                    aria-label={`Watch #${standing.carNumber} ${standing.displayName}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onFocusCar(standing.slotId)}
                  >
                    {/* Hover gives the name; the label is the car number,
                        because a name at 54 cars is unreadable. */}
                    <title>
                      {`#${standing.carNumber} ${standing.displayName} · ${standing.carClass} · P${standing.position}`}
                    </title>
                    {isFocused ? (
                      <circle
                        cx={x}
                        cy={y}
                        r={FOCUS_RING_RADIUS}
                        fill="none"
                        stroke={theme.palette.primary.main}
                        strokeWidth={5}
                      />
                    ) : null}
                    <circle
                      cx={x}
                      cy={y}
                      r={MARKER_RADIUS}
                      fill={fill}
                      stroke={theme.palette.background.paper}
                      strokeWidth={3}
                      // A car in the pits is still in the session and still
                      // worth seeing; it is just not racing anyone.
                      fillOpacity={standing.pitStatus === 'TRK' ? 1 : 0.45}
                    />
                    <text
                      x={x}
                      y={y}
                      fill="#fff"
                      fontSize={16}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="central"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {standing.carNumber}
                    </text>
                  </g>
                );
              })}
            </svg>
          </Box>
        )}
      </Box>

      {/*
        Said out loud rather than left as a shorter list. A steward counting
        cars on the map against the timing table needs to know the difference is
        missing data and not a car that has vanished.
      */}
      {!message && unplaced > 0 ? (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            px: 2,
            py: 0.75,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          {unplaced} of {visibleStandings.length} cars report no position — the
          sidecar sending it may not have been rebuilt.
        </Typography>
      ) : null}
    </Paper>
  );
};
