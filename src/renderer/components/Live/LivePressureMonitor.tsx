import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import PushPinIcon from '@mui/icons-material/PushPin';
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

/**
 * What a car is called for the purpose of remembering a pin.
 *
 * Slot first, steam id second, matching `resolve` below — and for the same
 * reason: every AI entry reports steam id 0, so a field of them would collapse
 * onto one key.
 */
const carKey = (standing: LiveStanding): string =>
  standing.slotId !== undefined
    ? `slot-${standing.slotId}`
    : `steam-${standing.steamId}`;

/**
 * A pin identifies the two cars, not the battle.
 *
 * Sorted, so it survives the overtake. `battle.id` is
 * `battle-{behind}-{ahead}` and flips the moment the pass completes — pinning
 * on it would drop the fight at exactly the moment a steward is watching it
 * hardest.
 */
const pinKeyFor = (behind: LiveStanding, ahead: LiveStanding): string =>
  [carKey(behind), carKey(ahead)].sort().join('~');

/**
 * A pinned pairing.
 *
 * The two cars are stored alongside the key because the key is sorted and so
 * cannot say which of them is chasing. A pairing the feed has dropped has no
 * battle left to read that off, and it still has to be drawn the right way
 * round.
 */
interface PinnedPair {
  key: string;
  behind: string;
  ahead: string;
}

/**
 * A row on the panel.
 *
 * `battle` is absent for a pinned pairing the feed is no longer carrying —
 * the cars are known, the measurements are not.
 */
interface PressureRow {
  battle?: LivePressureBattle;
  ahead: LiveStanding;
  behind: LiveStanding;
  key: string;
  isPinned: boolean;
}

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
            onClick={(clickEvent) => {
              /*
                The card behind this is clickable too, and it would pin the
                pairing and swing the camera to the other car. This button is
                the precise version of the same act — watch *this* one — so it
                has to stop where it is.
              */
              clickEvent.stopPropagation();
              onFocusCar(standing.slotId);
            }}
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

  /*
    Every fight the steward has parked at the top, oldest pin first.

    An array rather than a set because the order is the point: a pinned card
    that reshuffled when another was added would defeat the reason for pinning
    it. Held here rather than in the provider because it is a property of this
    panel — it survives the list being rebuilt every second, which is what it is
    for, and there is nowhere else in the app a pinned pairing would mean
    anything.

    The orientation is stored with the key so a pairing can still be drawn once
    it has left the feed, where there is no battle left to read it off.
  */
  const [pinned, setPinned] = useState<PinnedPair[]>([]);

  /** A pinned pairing's cars, for redrawing one the feed has dropped. */
  const byCarKey = useMemo(() => {
    const lookup = new Map<string, LiveStanding>();
    standings.forEach((standing) => lookup.set(carKey(standing), standing));
    return lookup;
  }, [standings]);

  const inFilter = useCallback(
    (behind: LiveStanding, ahead: LiveStanding) =>
      classFilter === 'ALL' ||
      behind.carClass === classFilter ||
      ahead.carClass === classFilter,
    [classFilter],
  );

  const rows = useMemo(() => {
    const pinnedOrder = new Map(pinned.map((pin, index) => [pin.key, index]));

    const live = battles.flatMap((battle) => {
      const ahead = resolve(battle.aheadSlotId, battle.aheadSteamId);
      const behind = resolve(battle.behindSlotId, battle.behindSteamId);
      if (!ahead || !behind || !inFilter(behind, ahead)) {
        return [];
      }

      const key = pinKeyFor(behind, ahead);
      return [
        { battle, ahead, behind, key, isPinned: pinnedOrder.has(key) },
      ] as PressureRow[];
    });

    /*
      Pinned pairings the feed is no longer carrying, rebuilt from the field.

      This is the whole reason a pin is worth having. A pairing enters the panel
      at two seconds and is dropped once it passes 2.6 — and it also vanishes
      the moment a third car slots between the two, or either of them pits, none
      of which mean the steward has finished watching. Dropping a pinned card
      for any of those is the panel deciding when to stop watching on the
      steward's behalf, which is exactly backwards.

      The measurements are *not* carried over. Gap, closing speed and the ETA
      are only computed for pairings the feed is carrying, and a card still
      showing the last numbers it had would be presenting a reading from some
      seconds ago as current. They read `—` until the pairing comes back, on the
      same rule the rest of this view follows: absent is absent, never a stale
      value and never a guess.
    */
    const held = pinned.flatMap((pin) => {
      if (live.some((row) => row.key === pin.key)) {
        return [];
      }

      const behind = byCarKey.get(pin.behind);
      const ahead = byCarKey.get(pin.ahead);
      if (!behind || !ahead || !inFilter(behind, ahead)) {
        return [];
      }

      return [
        { battle: undefined, ahead, behind, key: pin.key, isPinned: true },
      ] as PressureRow[];
    });

    /*
      Pinned rows first in the order they were pinned, then the rest exactly as
      `deriveLivePressureBattles` ordered them — it sorts on the slow-moving
      quantity precisely so rows do not swap places under a steward reading
      them.
    */
    const pinnedRows = [...live.filter((row) => row.isPinned), ...held].sort(
      (a, b) => (pinnedOrder.get(a.key) ?? 0) - (pinnedOrder.get(b.key) ?? 0),
    );

    return [...pinnedRows, ...live.filter((row) => !row.isPinned)];
  }, [battles, byCarKey, inFilter, pinned, resolve]);

  /*
    One click does both halves of "watch this": the camera goes to a car in the
    pairing, and the pairing parks at the top so it stays findable while the
    list churns underneath.

    Clicking again swaps to the other car rather than releasing the pin. An
    incident between two cars is worth seeing from both ends — who arrived and
    who was arrived at are different questions — and clicking the card the
    steward is already watching is the natural way to ask the second one.
    Unpinning is the pin button, which says so.

    The first click lands on the car doing the catching, because that is whose
    move it is.
  */
  const onSelectBattle = useCallback(
    (row: PressureRow) => {
      setPinned((previous) =>
        previous.some((pin) => pin.key === row.key)
          ? previous
          : [
              ...previous,
              {
                key: row.key,
                behind: carKey(row.behind),
                ahead: carKey(row.ahead),
              },
            ],
      );

      /*
        Which car to swap to is read off what the game is actually showing, not
        off a per-card toggle this panel would have to keep.

        That is what makes it behave under every other way the camera moves. The
        per-car buttons here, the driver cycle on the camera bar and the dossier
        all drive the same focus, so a remembered "last side" would disagree
        with the picture the moment any of them was used — and the steward would
        press the card expecting the other car and get the one already on
        screen.
      */
      const isWatchingBehind =
        row.behind.slotId !== undefined && row.behind.slotId === focusedSlotId;

      /*
        Falls through to the other car when the preferred one has no slot. A car
        without one cannot be addressed at all, and a click that did nothing
        would read as the card being broken rather than as that car being
        unreachable.
      */
      const next = [
        isWatchingBehind ? row.ahead : row.behind,
        isWatchingBehind ? row.behind : row.ahead,
      ].find((standing) => standing.slotId !== undefined);

      if (next?.slotId !== undefined) {
        onFocusCar(next.slotId);
      }
    },
    [focusedSlotId, onFocusCar],
  );

  const onUnpin = useCallback(
    (key: string) =>
      setPinned((previous) => previous.filter((pin) => pin.key !== key)),
    [],
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
        {/*
          One control for the whole shortlist, because there is no cap on it.
          Clearing eight pins one card at a time is eight decisions to make the
          same choice once.
        */}
        {pinned.length ? (
          <Tooltip title="Stop watching every pinned pairing">
            <Button
              size="small"
              onClick={() => setPinned([])}
              sx={{ minWidth: 0, py: 0, fontSize: 11 }}
            >
              Unpin all ({pinned.length})
            </Button>
          </Tooltip>
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
            {rows.map((row) => {
              const { battle, ahead, behind, key, isPinned } = row;
              const closing = battle?.closingSpeedKph;
              const trend =
                closing === undefined
                  ? ABSENT
                  : Math.abs(closing) < TREND_DEADBAND_KPH
                    ? ABSENT
                    : `${closing > 0 ? '▲' : '▼'} ${Math.abs(closing).toFixed(0)} kph`;
              /*
                Read off the two cars rather than off the battle, so a pinned
                pairing the feed has dropped still says which kind of fight it
                is. It is a property of the pair, not of the measurement.
              */
              const isTraffic = battle
                ? battle.isTraffic
                : behind.carClass !== ahead.carClass;

              return (
                <Paper
                  key={key}
                  variant="outlined"
                  /*
                    The battle's id while the feed is carrying it, the pairing's
                    own key once it is not — there is no battle left to name it
                    after, and the two cars are what the card is still about.
                  */
                  data-testid={`pressure-battle-${battle?.id ?? key}`}
                  /*
                    The whole card, not a hit area inside it. Picking a fight to
                    watch is the one thing a steward does on this panel, and
                    aiming at a 16-pixel camera glyph while the list reshuffles
                    underneath is the wrong size of target for it.
                  */
                  role="button"
                  tabIndex={0}
                  aria-pressed={isPinned}
                  aria-label={
                    battle
                      ? `Watch #${behind.carNumber} ${behind.displayName} catching #${ahead.carNumber} ${ahead.displayName}`
                      : `Watch #${behind.carNumber} ${behind.displayName} and #${ahead.carNumber} ${ahead.displayName}, no longer close`
                  }
                  onClick={() => onSelectBattle(row)}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                      keyEvent.preventDefault();
                      onSelectBattle(row);
                    }
                  }}
                  sx={{
                    borderColor: isPinned ? 'primary.main' : 'divider',
                    // The relationship is the first thing to read, so it is
                    // also carried by the edge of the card rather than only by
                    // a chip: traffic is a blue-flag problem, a same-class pair
                    // is a fight, and they want different reactions.
                    borderLeft: '3px solid',
                    borderLeftColor: isTraffic
                      ? 'warning.main'
                      : 'primary.main',
                    borderRadius: 1,
                    px: 1.25,
                    py: 1,
                    cursor: 'pointer',
                    // The pinned card is the one thing on the panel that is
                    // there because the steward put it there, so it is marked
                    // by more than its position — a list that has scrolled puts
                    // "first" out of sight.
                    ...(isPinned
                      ? {
                          backgroundColor: (theme) =>
                            `${theme.palette.primary.main}14`,
                          boxShadow: (theme) =>
                            `inset 0 0 0 1px ${theme.palette.primary.main}`,
                        }
                      : {}),
                    ':hover': { backgroundColor: 'background.alt' },
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
                      label={isTraffic ? 'TRAFFIC' : 'SAME CLASS'}
                      color={isTraffic ? 'warning' : 'default'}
                      variant="outlined"
                      sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                    />
                    {/*
                      Drawn only on the pinned cards. A pin control on all
                      twenty-five would be twenty-five buttons offering the
                      thing the card itself already does.
                    */}
                    {isPinned ? (
                      <Tooltip title="Stop watching this pairing">
                        <Chip
                          size="small"
                          icon={<PushPinIcon sx={{ fontSize: 12 }} />}
                          label="Pinned"
                          color="primary"
                          onDelete={(deleteEvent) => {
                            // The card underneath is a button too, and a click
                            // that unpinned and then re-pinned would do nothing
                            // at all.
                            deleteEvent.stopPropagation();
                            onUnpin(key);
                          }}
                          sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                        />
                      </Tooltip>
                    ) : null}
                    {/*
                      Says why the numbers below have gone, so a pinned card
                      holding a row of dashes reads as the fight having broken
                      up rather than as the panel having failed.
                    */}
                    {battle ? null : (
                      <Tooltip title="These two are no longer within two seconds of each other, or a car has come between them. The pairing stays until you unpin it.">
                        <Chip
                          size="small"
                          label="NOT CLOSE"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                        />
                      </Tooltip>
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }} />
                    <Typography
                      variant="h6"
                      sx={{
                        fontVariantNumeric: 'tabular-nums',
                        lineHeight: 1,
                        fontWeight: 700,
                      }}
                    >
                      {battle ? `${battle.gapSeconds.toFixed(2)}s` : ABSENT}
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
                          closing !== undefined && closing > TREND_DEADBAND_KPH
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
                        ETA {formatTimeToCatch(battle?.timeToCatchSeconds)}
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
                        {formatSpeed(battle?.behindSpeedKph)} /{' '}
                        {formatSpeed(battle?.aheadSpeedKph)} kph
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
