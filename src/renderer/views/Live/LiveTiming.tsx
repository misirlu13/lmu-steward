import { useMemo } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { LiveTimingTable } from '../../components/Live/LiveTimingTable';
import { useLiveSession } from '../../providers/LiveSessionContext';

const ALL = 'ALL';

/**
 * `/live/timing` — the timing screen and its class filter.
 *
 * The filter sits above the table, in the same place and the same idiom as the
 * incidents view's filter bar, and its state lives in `LiveSessionContext`
 * rather than here: the track map and the pressure monitor land on this route
 * next and all three have to agree about which cars the steward is watching.
 */
export const LiveTiming: React.FC = () => {
  const {
    session,
    standings,
    classFilter,
    fieldByClass,
    onChangeClassFilter,
    onFocusCar,
  } = useLiveSession();

  const visibleStandings = useMemo(
    () =>
      classFilter === ALL
        ? standings
        : standings.filter((standing) => standing.carClass === classFilter),
    [classFilter, standings],
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

      <LiveTimingTable
        standings={standings}
        visibleStandings={visibleStandings}
        session={session}
        onFocusCar={onFocusCar}
      />
    </Box>
  );
};
