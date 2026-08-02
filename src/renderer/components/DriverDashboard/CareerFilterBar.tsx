import { Box, Button, Chip, MenuItem, Select, Typography } from '@mui/material';
import { CareerFilterOptions, CareerFilters } from '@types';

interface CareerFilterBarProps {
  filters: CareerFilters;
  options: CareerFilterOptions;
  onChange: (filters: CareerFilters) => void;
}

const ANY = '';

/**
 * Scopes the whole page.
 *
 * Every figure behind it is recomputed from the filtered sessions, so this is
 * what turns one career into "my 2026 GT3 multiplayer season". The choices come
 * from every session rather than the filtered ones, so narrowing the view never
 * removes the way back out of it.
 */
export const CareerFilterBar = ({
  filters,
  options,
  onChange,
}: CareerFilterBarProps) => {
  const active =
    Boolean(filters.gameType) ||
    Boolean(filters.carClass) ||
    Boolean(filters.trackFolder) ||
    Boolean(filters.from) ||
    Boolean(filters.to);

  const years = (() => {
    if (!options.earliestAt || !options.latestAt) {
      return [];
    }
    const first = new Date(options.earliestAt * 1000).getFullYear();
    const last = new Date(options.latestAt * 1000).getFullYear();
    return Array.from({ length: last - first + 1 }, (_unused, i) => first + i);
  })();

  const selectedYear = filters.from
    ? new Date(filters.from * 1000).getFullYear()
    : null;

  const setYear = (year: number | null) => {
    if (year === null) {
      onChange({ ...filters, from: null, to: null });
      return;
    }
    onChange({
      ...filters,
      from: Math.floor(new Date(year, 0, 1).getTime() / 1000),
      to: Math.floor(new Date(year, 11, 31, 23, 59, 59).getTime() / 1000),
    });
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        alignItems: 'center',
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        Showing
      </Typography>

      <Select
        size="small"
        value={filters.gameType ?? ANY}
        onChange={(event) =>
          onChange({
            ...filters,
            gameType: (event.target.value as CareerFilters['gameType']) || null,
          })
        }
        sx={{ minWidth: 150 }}
      >
        <MenuItem value={ANY}>All sessions</MenuItem>
        <MenuItem value="multiplayer">Multiplayer</MenuItem>
        <MenuItem value="race-weekend">Race weekend</MenuItem>
      </Select>

      <Select
        size="small"
        value={filters.carClass ?? ANY}
        onChange={(event) =>
          onChange({ ...filters, carClass: event.target.value || null })
        }
        sx={{ minWidth: 130 }}
      >
        <MenuItem value={ANY}>All classes</MenuItem>
        {options.carClasses.map((carClass) => (
          <MenuItem key={carClass} value={carClass}>
            {carClass}
          </MenuItem>
        ))}
      </Select>

      <Select
        size="small"
        value={filters.trackFolder ?? ANY}
        onChange={(event) =>
          onChange({ ...filters, trackFolder: event.target.value || null })
        }
        sx={{ minWidth: 200 }}
      >
        <MenuItem value={ANY}>All tracks</MenuItem>
        {options.tracks.map((track) => (
          <MenuItem key={track.trackFolder} value={track.trackFolder}>
            {track.trackVenue}
          </MenuItem>
        ))}
      </Select>

      <Select
        size="small"
        value={selectedYear === null ? ANY : String(selectedYear)}
        onChange={(event) =>
          setYear(
            event.target.value === ANY ? null : Number(event.target.value),
          )
        }
        sx={{ minWidth: 110 }}
      >
        <MenuItem value={ANY}>All time</MenuItem>
        {years.map((year) => (
          <MenuItem key={year} value={String(year)}>
            {year}
          </MenuItem>
        ))}
      </Select>

      {active ? (
        <Button size="small" color="inherit" onClick={() => onChange({})}>
          Clear
        </Button>
      ) : (
        <Chip size="small" variant="outlined" label="Whole career" />
      )}
    </Box>
  );
};
