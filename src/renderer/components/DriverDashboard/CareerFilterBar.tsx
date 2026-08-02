import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from '@mui/material';
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

      {/*
        Each control carries a label saying what it filters, so the bar reads as
        four named filters rather than four values whose meaning has to be
        inferred from whichever option happens to be selected.
      */}
      <FormControl size="small" sx={{ minWidth: 160 }}>
        <InputLabel id="career-game-type-label">Sessions</InputLabel>
        <Select
          labelId="career-game-type-label"
          id="career-game-type"
          label="Sessions"
          value={filters.gameType ?? ANY}
          onChange={(event) =>
            onChange({
              ...filters,
              gameType:
                (event.target.value as CareerFilters['gameType']) || null,
            })
          }
        >
          <MenuItem value={ANY}>All sessions</MenuItem>
          <MenuItem value="multiplayer">Multiplayer</MenuItem>
          <MenuItem value="race-weekend">Race weekend</MenuItem>
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="career-car-class-label">Car class</InputLabel>
        <Select
          labelId="career-car-class-label"
          id="career-car-class"
          label="Car class"
          value={filters.carClass ?? ANY}
          onChange={(event) =>
            onChange({ ...filters, carClass: event.target.value || null })
          }
        >
          <MenuItem value={ANY}>All classes</MenuItem>
          {options.carClasses.map((carClass) => (
            <MenuItem key={carClass} value={carClass}>
              {carClass}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 210 }}>
        <InputLabel id="career-track-label">Track</InputLabel>
        <Select
          labelId="career-track-label"
          id="career-track"
          label="Track"
          value={filters.trackFolder ?? ANY}
          onChange={(event) =>
            onChange({ ...filters, trackFolder: event.target.value || null })
          }
        >
          <MenuItem value={ANY}>All tracks</MenuItem>
          {options.tracks.map((track) => (
            <MenuItem key={track.trackFolder} value={track.trackFolder}>
              {track.trackVenue}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel id="career-season-label">Season</InputLabel>
        <Select
          labelId="career-season-label"
          id="career-season"
          label="Season"
          value={selectedYear === null ? ANY : String(selectedYear)}
          onChange={(event) =>
            setYear(
              event.target.value === ANY ? null : Number(event.target.value),
            )
          }
        >
          <MenuItem value={ANY}>All time</MenuItem>
          {years.map((year) => (
            <MenuItem key={year} value={String(year)}>
              {year}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

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
