import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import {
  LIVE_MAGNITUDE_THRESHOLDS,
  LiveIncidentClassification,
  LiveIncidentFilterOptions,
  LiveIncidentFilters as LiveIncidentFilterState,
  hasActiveLiveIncidentFilters,
  liveClassificationLabel,
} from './liveFixtures';

const ALL = 'ALL';

interface LiveIncidentFiltersProps {
  filters: LiveIncidentFilterState;
  options: LiveIncidentFilterOptions;
  /** How many of the session's incidents survive the current filters. */
  matchCount: number;
  totalCount: number;
  onChange: (patch: Partial<LiveIncidentFilterState>) => void;
  onReset: () => void;
}

/**
 * Narrows the triage queue without changing what the session contains.
 *
 * It sits above both columns rather than inside the queue for a reason worth
 * stating: at four hundred incidents, finding the one contact a driver has
 * complained about is the actual task, and a filter row squeezed into a 420px
 * column would have to be a menu. The counts the queue shows are all relative
 * to what survives here, which is why the total is spelled out — a steward
 * looking at "12 incidents" needs to know whether that is the session or the
 * filter.
 *
 * Filter state lives in `LiveSessionContext`, so a narrowing set here survives
 * navigating to another live section and back.
 */
export const LiveIncidentFilters: React.FC<LiveIncidentFiltersProps> = ({
  filters,
  options,
  matchCount,
  totalCount,
  onChange,
  onReset,
}) => {
  const active = hasActiveLiveIncidentFilters(filters);

  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: 'divider',
        borderRadius: 2,
        px: 2,
        py: 1.25,
      }}
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
          Type
        </Typography>

        {/*
          A chip row rather than a select: classification is the filter a
          steward reaches for most, and it is worth the horizontal space to
          make it one click. Only the kinds this session has actually produced
          are offered — an empty bucket is a dead control.
        */}
        <Stack
          direction="row"
          spacing={0.5}
          flexWrap="wrap"
          useFlexGap
          role="group"
          aria-label="Incident type"
        >
          <Chip
            size="small"
            label="All"
            clickable
            aria-pressed={filters.classification === ALL}
            variant={filters.classification === ALL ? 'filled' : 'outlined'}
            color={filters.classification === ALL ? 'primary' : 'default'}
            onClick={() => onChange({ classification: ALL })}
          />
          {options.classifications.map((classification) => {
            const isActive = filters.classification === classification;
            return (
              <Chip
                key={classification}
                size="small"
                label={liveClassificationLabel[classification]}
                clickable
                aria-pressed={isActive}
                variant={isActive ? 'filled' : 'outlined'}
                color={isActive ? 'primary' : 'default'}
                onClick={() =>
                  onChange({
                    // A second click on the active chip clears it, so getting
                    // back to everything never needs the reset button.
                    classification: isActive
                      ? ALL
                      : (classification as LiveIncidentClassification),
                  })
                }
              />
            );
          })}
        </Stack>

        <Box sx={{ flex: 1, minWidth: 0 }} />

        <FormControl size="small" sx={{ minWidth: 128 }}>
          <InputLabel id="live-incident-class-label">Car class</InputLabel>
          <Select
            labelId="live-incident-class-label"
            id="live-incident-class"
            label="Car class"
            value={filters.carClass}
            onChange={(event) => onChange({ carClass: event.target.value })}
          >
            <MenuItem value={ALL}>All classes</MenuItem>
            {options.carClasses.map((carClass) => (
              <MenuItem key={carClass} value={carClass}>
                {carClass}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 190 }}>
          <InputLabel id="live-incident-driver-label">Driver</InputLabel>
          <Select
            labelId="live-incident-driver-label"
            id="live-incident-driver"
            label="Driver"
            value={filters.driverSteamId}
            onChange={(event) =>
              onChange({ driverSteamId: event.target.value })
            }
          >
            <MenuItem value={ALL}>All drivers</MenuItem>
            {options.drivers.map((driver) => (
              <MenuItem key={driver.steamId} value={driver.steamId}>
                {driver.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="live-incident-magnitude-label">Magnitude</InputLabel>
          <Select
            labelId="live-incident-magnitude-label"
            id="live-incident-magnitude"
            label="Magnitude"
            value={String(filters.minMagnitude)}
            onChange={(event) =>
              onChange({ minMagnitude: Number(event.target.value) })
            }
          >
            {LIVE_MAGNITUDE_THRESHOLDS.map((threshold) => (
              <MenuItem key={threshold} value={String(threshold)}>
                {threshold === 0 ? 'Any magnitude' : `${threshold}+`}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/*
          Spelled out rather than left to the queue's own chip: once a
          threshold is set the queue is showing contacts only, and a steward who
          has forgotten that reads a filtered list as the whole session.
        */}
        <Typography
          variant="caption"
          color={active ? 'primary.main' : 'text.secondary'}
          sx={{ whiteSpace: 'nowrap' }}
        >
          {active
            ? `${matchCount} of ${totalCount}`
            : `${totalCount} incidents`}
        </Typography>

        {active ? (
          <Button size="small" color="inherit" onClick={onReset}>
            Clear
          </Button>
        ) : null}
      </Stack>
    </Paper>
  );
};
