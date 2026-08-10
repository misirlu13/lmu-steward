import React, { useMemo } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { LivePressureBattle, LiveStanding } from './liveFixtures';

/** Nothing to show. Never a zero. */
const ABSENT = '—';

/**
 * Past this, "time to catch" stops being a prediction and starts being an
 * extrapolation of noise. A minute of racing at a tenth of a second per lap of
 * closing is not a battle a steward needs a countdown for.
 */
const TIME_TO_CATCH_HORIZON_SECONDS = 60;

/**
 * How small a closing speed is drawn as holding station rather than as a trend.
 *
 * Cosmetic only — the ETA has its own threshold in `live-pressure.ts`. This just
 * stops an arrow flickering between up and down while two cars sit at the same
 * speed.
 */
const TREND_DEADBAND_KPH = 0.5;

const formatTimeToCatch = (seconds?: number): string => {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return ABSENT;
  }
  return seconds > TIME_TO_CATCH_HORIZON_SECONDS
    ? `> ${TIME_TO_CATCH_HORIZON_SECONDS}s`
    : `${seconds.toFixed(1)}s`;
};

const formatSpeed = (kph?: number): string =>
  kph === undefined || !Number.isFinite(kph) ? ABSENT : `${Math.round(kph)}`;

interface LivePressureMonitorProps {
  battles: LivePressureBattle[];
  /** The whole field, for resolving a battle's two cars to rows on screen. */
  standings: LiveStanding[];
  classFilter: string;
  focusedSlotId?: number;
  onFocusCar: (slotId: number | undefined) => void;
}

/**
 * A camera button, and the car it points at.
 *
 * The slot is what LMU's focus endpoint addresses, so a car without one cannot
 * be watched — the button is disabled rather than absent, because a row missing
 * a control the row above it has reads as a rendering fault.
 */
const PressureCarCell: React.FC<{
  standing: LiveStanding;
  isFocused: boolean;
  onFocusCar: (slotId: number | undefined) => void;
}> = ({ standing, isFocused, onFocusCar }) => {
  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.5}
      sx={{ minWidth: 0 }}
    >
      <Tooltip
        title={
          standing.slotId === undefined
            ? 'No slot reported for this car'
            : `Watch #${standing.carNumber} ${standing.displayName}`
        }
      >
        {/* A disabled button fires no events, so the tooltip needs a live
            wrapper to hang off. */}
        <span>
          <IconButton
            size="small"
            color={isFocused ? 'primary' : 'default'}
            disabled={standing.slotId === undefined}
            aria-label={`Watch #${standing.carNumber} ${standing.displayName}`}
            onClick={() => onFocusCar(standing.slotId)}
            sx={{ p: 0.25 }}
          >
            <VideocamOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </span>
      </Tooltip>
      <Typography
        variant="body2"
        fontWeight={700}
        sx={{ fontVariantNumeric: 'tabular-nums' }}
      >
        #{standing.carNumber}
      </Typography>
      <CarClassBadge carClass={standing.carClass} />
    </Stack>
  );
};

/**
 * Who is about to be on top of whom.
 *
 * Ordered by gap and never re-sorted here — see `deriveLivePressureBattles`,
 * which sorts on the slow-moving quantity precisely so rows do not swap places
 * under a steward reading them.
 *
 * **The class filter matches either car, not both.** Filtering a pair the way a
 * single-car list is filtered would hide every cross-class pairing, which is
 * backwards: a steward watching GT3 wants to see the Hypercar arriving behind
 * them most of all. That is what the traffic flag exists to mark.
 */
const LivePressureMonitorComponent: React.FC<LivePressureMonitorProps> = ({
  battles,
  standings,
  classFilter,
  focusedSlotId,
  onFocusCar,
}) => {
  /*
    Resolved preferring slot over steam id. Steam id is 0 for every AI entry and
    every offline session, so a field of AI cars would otherwise collapse onto
    one driver; the steam-id branch is what keeps the layout fixtures, which
    carry no slots, renderable.
  */
  const resolve = useMemo(() => {
    const bySlot = new Map<number, LiveStanding>();
    const bySteam = new Map<string, LiveStanding>();
    standings.forEach((standing) => {
      if (standing.slotId !== undefined) {
        bySlot.set(standing.slotId, standing);
      }
      if (standing.steamId && standing.steamId !== '0') {
        bySteam.set(standing.steamId, standing);
      }
    });

    return (slotId: number | undefined, steamId: string | undefined) =>
      (slotId !== undefined ? bySlot.get(slotId) : undefined) ??
      (steamId ? bySteam.get(steamId) : undefined);
  }, [standings]);

  const rows = useMemo(
    () =>
      battles.flatMap((battle) => {
        const ahead = resolve(battle.aheadSlotId, battle.aheadSteamId);
        const behind = resolve(battle.behindSlotId, battle.behindSteamId);
        if (!ahead || !behind) {
          return [];
        }

        if (
          classFilter !== 'ALL' &&
          ahead.carClass !== classFilter &&
          behind.carClass !== classFilter
        ) {
          return [];
        }

        return [{ battle, ahead, behind }];
      }),
    [battles, classFilter, resolve],
  );

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Pressure monitor"
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
        <BoltIcon color="primary" fontSize="small" />
        <Typography variant="subtitle2" fontWeight={700}>
          Pressure Monitor
        </Typography>
        <Box sx={{ flex: 1 }} />
        {classFilter !== 'ALL' ? (
          <Typography variant="caption" color="primary.main">
            {classFilter} only
          </Typography>
        ) : null}
        <Typography variant="caption" color="text.secondary">
          {rows.length} {rows.length === 1 ? 'pairing' : 'pairings'}
        </Typography>
      </Stack>

      {/*
        The panel keeps its height and the list scrolls inside it, so going from
        two pairings to twenty-five does not move the map underneath.
      */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.25 }}>
        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            No cars within two seconds of each other.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {rows.map(({ battle, ahead, behind }) => {
              const closing = battle.closingSpeedKph;
              const trend =
                Math.abs(closing) < TREND_DEADBAND_KPH
                  ? ABSENT
                  : `${closing > 0 ? '▲' : '▼'} ${Math.abs(closing).toFixed(0)} kph`;

              return (
                <Paper
                  key={battle.id}
                  variant="outlined"
                  data-testid={`pressure-battle-${battle.id}`}
                  sx={{
                    borderColor: 'divider',
                    // The relationship is the first thing to read, so it is
                    // also carried by the edge of the card rather than only by
                    // a chip: traffic is a blue-flag problem, a same-class pair
                    // is a fight, and they want different reactions.
                    borderLeft: '3px solid',
                    borderLeftColor: battle.isTraffic
                      ? 'warning.main'
                      : 'primary.main',
                    borderRadius: 1,
                    px: 1.25,
                    py: 1,
                  }}
                >
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={1}
                    sx={{ mb: 0.75 }}
                  >
                    <Chip
                      size="small"
                      label={battle.isTraffic ? 'TRAFFIC' : 'SAME CLASS'}
                      color={battle.isTraffic ? 'warning' : 'default'}
                      variant="outlined"
                      sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                    />
                    <Box sx={{ flex: 1, minWidth: 0 }} />
                    <Typography
                      variant="h6"
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        lineHeight: 1,
                        fontWeight: 700,
                      }}
                    >
                      {battle.gapSeconds.toFixed(2)}s
                    </Typography>
                  </Stack>

                  {/* Behind first, then the glyph, then ahead — the order the
                      two cars are in on track, read left to right. */}
                  <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.75}
                    flexWrap="wrap"
                    useFlexGap
                  >
                    <PressureCarCell
                      standing={behind}
                      isFocused={
                        behind.slotId !== undefined &&
                        behind.slotId === focusedSlotId
                      }
                      onFocusCar={onFocusCar}
                    />
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.secondary"
                      aria-label="is catching"
                    >
                      »
                    </Typography>
                    <PressureCarCell
                      standing={ahead}
                      isFocused={
                        ahead.slotId !== undefined &&
                        ahead.slotId === focusedSlotId
                      }
                      onFocusCar={onFocusCar}
                    />
                  </Stack>

                  <Stack
                    direction="row"
                    alignItems="baseline"
                    spacing={1.5}
                    flexWrap="wrap"
                    useFlexGap
                    sx={{ mt: 0.5 }}
                  >
                    <Tooltip title="Closing speed, smoothed over a few seconds">
                      <Typography
                        variant="caption"
                        color={
                          closing > TREND_DEADBAND_KPH
                            ? 'error.main'
                            : 'text.secondary'
                        }
                        sx={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {trend}
                      </Typography>
                    </Tooltip>
                    <Tooltip title="Time to close the gap at the current rate">
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        ETA {formatTimeToCatch(battle.timeToCatchSeconds)}
                      </Typography>
                    </Tooltip>
                    <Box sx={{ flex: 1, minWidth: 0 }} />
                    <Tooltip
                      title={`${behind.displayName} / ${ahead.displayName}`}
                    >
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {formatSpeed(battle.behindSpeedKph)} /{' '}
                        {formatSpeed(battle.aheadSpeedKph)} kph
                      </Typography>
                    </Tooltip>
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}
      </Box>
    </Paper>
  );
};

/**
 * Memoised because it shares a parent with the 5 Hz position feed.
 *
 * `LiveTiming` re-renders five times a second so the map's markers can move;
 * everything this panel reads changes at 1 Hz, and re-deriving twenty-five
 * battle cards four times for nothing is the cost that buys.
 */
export const LivePressureMonitor = React.memo(LivePressureMonitorComponent);
