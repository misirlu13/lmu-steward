import { useMemo } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { LivePressureMonitor } from '../../components/Live/LivePressureMonitor';
import { LiveTimingTable } from '../../components/Live/LiveTimingTable';
import { LiveTrackMap } from '../../components/Live/LiveTrackMap';
import {
  mergeLiveCarPositions,
  useLiveCarPositions,
} from '../../hooks/useLiveCarPositions';
import { useLiveSession } from '../../providers/LiveSessionContext';

const ALL = 'ALL';

/**
 * `/live/timing` — the timing screen, the live track map, the pressure monitor,
 * and the class filter all three of them read.
 *
 * The filter sits above them, in the same place and the same idiom as the
 * incidents view's filter bar, and its state lives in `LiveSessionContext`
 * rather than here: the map, the camera bar and the pressure monitor all narrow
 * to the same class, and they have to agree about which cars the steward is
 * watching.
 *
 * **This view re-renders at 5 Hz**, because it owns the position feed the map
 * consumes. That is deliberately as far up as the fast feed goes — putting it in
 * `LiveSessionContext` would re-render the whole live shell five times a second
 * for a panel that is not even on screen most of the time, and nothing outside
 * the map reads a position. The table and the monitor are memoised and are
 * handed the *unmerged* standings, so a 5 Hz tick reaches neither.
 */
export const LiveTiming: React.FC = () => {
  const {
    session,
    standings,
    battles,
    classFilter,
    fieldByClass,
    trackMap,
    focusedSlotId,
    liveIndicator,
    useFixtures,
    onChangeClassFilter,
    onFocusCar,
  } = useLiveSession();

  /*
    Off in dev mode. The renderer runs on its own fixtures there, so there are
    no real slot ids for the feed's join to be checked against — and the check
    is the whole reason the join is safe. A fixture that satisfied it would be a
    fixture proving nothing.
  */
  const carPositions = useLiveCarPositions(
    !useFixtures && liveIndicator.state === 'live',
  );

  const visibleStandings = useMemo(
    () =>
      classFilter === ALL
        ? standings
        : standings.filter((standing) => standing.carClass === classFilter),
    [classFilter, standings],
  );

  // Only the map sees these. The 5 Hz positions are written over the 1 Hz rows
  // where — and only where — the REST row's driver name agrees with the
  // sidecar's for that slot.
  const positioned = useMemo(
    () => mergeLiveCarPositions(visibleStandings, carPositions),
    [carPositions, visibleStandings],
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateRows: { xs: 'auto', lg: 'auto minmax(0, 1fr)' },
        gridAutoRows: { xs: 'minmax(360px, auto)', lg: 'minmax(0, 1fr)' },
        height: { xs: 'auto', lg: '100%' },
        boxSizing: 'border-box',
      }}
    >
      <Paper
        variant="outlined"
        sx={{ borderColor: 'divider', borderRadius: 2, px: 2, py: 1.25 }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}
          >
            Class
          </Typography>

          <Stack
            direction="row"
            spacing={0.5}
            flexWrap="wrap"
            useFlexGap
            role="group"
            aria-label="Car class"
          >
            <Chip
              size="small"
              label="All"
              clickable
              aria-pressed={classFilter === ALL}
              variant={classFilter === ALL ? 'filled' : 'outlined'}
              color={classFilter === ALL ? 'primary' : 'default'}
              onClick={() => onChangeClassFilter(ALL)}
            />
            {fieldByClass.map((entry) => {
              const isActive = classFilter === entry.carClass;
              return (
                <Chip
                  key={entry.carClass}
                  size="small"
                  label={`${entry.carClass} ${entry.count}`}
                  clickable
                  aria-pressed={isActive}
                  variant={isActive ? 'filled' : 'outlined'}
                  color={isActive ? 'primary' : 'default'}
                  // A second click clears it, so getting back to the whole
                  // field never needs a separate control.
                  onClick={() =>
                    onChangeClassFilter(isActive ? ALL : entry.carClass)
                  }
                />
              );
            })}
          </Stack>

          <Box sx={{ flex: 1, minWidth: 0 }} />

          <Typography
            variant="caption"
            color={classFilter === ALL ? 'text.secondary' : 'primary.main'}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {classFilter === ALL
              ? `${standings.length} cars`
              : `${visibleStandings.length} of ${standings.length} cars`}
          </Typography>
        </Stack>
      </Paper>

      {/*
        Table on the left; monitor over map on the right. The right column is
        capped rather than proportional: the geometry is drawn into a square
        viewBox, so past a certain width the extra space is letterbox and the
        timing table wants it more.

        Monitor above map, following `timing_pressure_master_view`, because the
        two answer different questions — the monitor says *look here now* and
        the map says *where is everyone* — and only one of those is urgent.
      */}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            lg: 'minmax(0, 1fr) minmax(320px, 28%)',
          },
          minHeight: 0,
          gridAutoRows: { xs: 'minmax(360px, auto)', lg: 'minmax(0, 1fr)' },
        }}
      >
        <LiveTimingTable
          standings={standings}
          visibleStandings={visibleStandings}
          session={session}
          onFocusCar={onFocusCar}
        />

        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateRows: {
              xs: 'auto auto',
              lg: 'minmax(0, 1fr) minmax(0, 1fr)',
            },
            minHeight: 0,
          }}
        >
          <Box sx={{ minHeight: { xs: 220, lg: 0 } }}>
            <LivePressureMonitor
              battles={battles}
              standings={standings}
              classFilter={classFilter}
              focusedSlotId={focusedSlotId}
              onFocusCar={onFocusCar}
            />
          </Box>

          <Box sx={{ minHeight: { xs: 300, lg: 0 } }}>
            <LiveTrackMap
              points={trackMap.points}
              pitPoints={trackMap.pitPoints}
              state={trackMap.state}
              error={trackMap.error}
              visibleStandings={positioned.standings}
              classFilter={classFilter}
              focusedSlotId={focusedSlotId}
              positionsFromFastFeed={positioned.fromFastFeed}
              onFocusCar={onFocusCar}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
