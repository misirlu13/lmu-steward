import SearchIcon from '@mui/icons-material/Search';
import SensorsIcon from '@mui/icons-material/Sensors';
import TimelineIcon from '@mui/icons-material/Timeline';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import Divider from '@mui/material/Divider';
import {
  allIncidentSources,
  buildFilteredReplayTimelineEvents,
  ReplayIncidentSource,
} from './replayMasterTimelineFilters';
import { ReplayTimelineIncidentRow } from './ReplayTimelineIncidentRow';

import type {
  ReplayIncidentEvent,
  ReplayIncidentType,
} from './replayTimelineTypes';

export type {
  ReplayIncidentDriver,
  ReplayIncidentEvent,
  ReplayIncidentType,
} from './replayTimelineTypes';

interface ReplayMasterIncidentTimelineProps {
  events: ReplayIncidentEvent[];
  availableClasses: string[];
  selectedIncidentId?: string;
  /**
   * Opens the dossier for a row, without touching the game.
   *
   * Kept apart from jumping on purpose. Reading an incident and seeking the
   * footage to it are two different acts: loading a picture takes over Le Mans
   * Ultimate and costs seconds, and a steward working down a long list wants to
   * read the evidence on several before deciding which one is worth watching.
   * Tying the two together made every glance a seek.
   */
  onSelectIncident?: (event: ReplayIncidentEvent) => void;
  onJumpToIncident?: (event: ReplayIncidentEvent) => void;
  hideJumpButtons?: boolean;
  dataCoverageNote?: string;
}

const incidentTypeLabel: Record<ReplayIncidentType, string> = {
  'track-limit': 'Track Limit',
  collision: 'Incident',
  penalty: 'Penalty',
};

const incidentTypeColor: Record<
  ReplayIncidentType,
  'warning' | 'error' | 'secondary'
> = {
  'track-limit': 'warning',
  collision: 'error',
  penalty: 'secondary',
};

const allTypes: ReplayIncidentType[] = ['track-limit', 'collision', 'penalty'];

/**
 * Named for what the steward gets, not for where the row came from — every row
 * on this timeline comes from the log, and capture only ever adds to one.
 */
const incidentSourceLabel: Record<ReplayIncidentSource, string> = {
  captured: 'Live Capture',
  'log-only': 'Log Only',
};

export const ReplayMasterIncidentTimeline: React.FC<
  ReplayMasterIncidentTimelineProps
> = ({
  events,
  availableClasses,
  selectedIncidentId,
  onSelectIncident,
  onJumpToIncident,
  hideJumpButtons = false,
  dataCoverageNote,
}) => {
  const [selectedTypes, setSelectedTypes] =
    useState<ReplayIncidentType[]>(allTypes);
  const [selectedSources, setSelectedSources] =
    useState<ReplayIncidentSource[]>(allIncidentSources);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [hideLimitedData, setHideLimitedData] = useState(false);
  const hasLimitedDataRecords = useMemo(
    () =>
      events.some((event) =>
        event.drivers.some((driver) => driver.hasLapData === false),
      ),
    [events],
  );

  /*
    Drawn only where the distinction exists. A replay with no captured session
    behind it — the ordinary case — would otherwise carry two pills, one of
    which hides everything and the other of which does nothing.
  */
  const hasCapturedRecords = useMemo(
    () => events.some((event) => Boolean(event.liveIncidentId)),
    [events],
  );

  useEffect(() => {
    if (!hasLimitedDataRecords && hideLimitedData) {
      setHideLimitedData(false);
    }
  }, [hasLimitedDataRecords, hideLimitedData]);
  const timelineScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const incidentRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleType = (type: ReplayIncidentType) => {
    setSelectedTypes((prev) => {
      if (prev.includes(type)) {
        const next = prev.filter((entry) => entry !== type);
        return next.length ? next : prev;
      }
      return [...prev, type];
    });
  };

  // Turning the last one off is refused rather than allowed to empty the list,
  // matching the type pills — a filter that can hide everything reads as broken.
  const toggleSource = (source: ReplayIncidentSource) => {
    setSelectedSources((prev) => {
      if (prev.includes(source)) {
        const next = prev.filter((entry) => entry !== source);
        return next.length ? next : prev;
      }
      return [...prev, source];
    });
  };

  const filteredEvents = useMemo(() => {
    return buildFilteredReplayTimelineEvents({
      events,
      hideLimitedData,
      selectedTypes,
      selectedSources,
      selectedClass,
      searchQuery,
    });
  }, [
    events,
    hideLimitedData,
    searchQuery,
    selectedClass,
    selectedSources,
    selectedTypes,
  ]);

  useEffect(() => {
    if (!selectedIncidentId) {
      return;
    }

    const selectedIndex = filteredEvents.findIndex(
      (event) => event.id === selectedIncidentId,
    );
    if (selectedIndex < 0) {
      return;
    }

    const container = timelineScrollContainerRef.current;
    const activeRow = incidentRowRefs.current[selectedIncidentId];
    if (!container || !activeRow) {
      return;
    }

    const isLastFilteredIncident = selectedIndex >= filteredEvents.length - 1;
    const nextIncident = filteredEvents[selectedIndex + 1];
    const nextRow = nextIncident
      ? incidentRowRefs.current[nextIncident.id]
      : null;
    const containerRect = container.getBoundingClientRect();
    const activeRowRect = activeRow.getBoundingClientRect();

    const desiredBottomBuffer = isLastFilteredIncident
      ? 0
      : (nextRow?.offsetHeight ?? activeRow.offsetHeight);
    const activeRowTopWithinContainer =
      activeRowRect.top - containerRect.top + container.scrollTop;

    const targetScrollTop =
      activeRowTopWithinContainer -
      (container.clientHeight - activeRow.offsetHeight - desiredBottomBuffer);

    const maxScrollTop = Math.max(
      0,
      container.scrollHeight - container.clientHeight,
    );
    const clampedScrollTop = Math.max(
      0,
      Math.min(targetScrollTop, maxScrollTop),
    );

    container.scrollTo({ top: clampedScrollTop, behavior: 'smooth' });
  }, [filteredEvents, selectedIncidentId]);

  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} alignItems="center">
            <TimelineIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={700}>
              Master Incident Timeline
            </Typography>
            <Chip
              label={`${events.length} Events Total`}
              size="small"
              variant="outlined"
              sx={{ height: 20, fontSize: 10 }}
            />
          </Stack>
          {dataCoverageNote ? (
            <Typography variant="caption" color="text.secondary">
              {dataCoverageNote}
            </Typography>
          ) : null}
        </Stack>
      </Stack>

      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', lg: 'center' }}
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {allTypes.map((type) => {
            const selected = selectedTypes.includes(type);
            return (
              <Chip
                key={type}
                label={incidentTypeLabel[type]}
                color={incidentTypeColor[type]}
                variant={selected ? 'filled' : 'outlined'}
                size="small"
                onClick={() => toggleType(type)}
              />
            );
          })}
        </Stack>

        {/*
          Beside the type pills and separated from them, because they narrow the
          same list on a different axis: what kind of incident it was, against
          what evidence there is for it.
        */}
        {hasCapturedRecords ? (
          <>
            <Divider orientation="vertical" flexItem />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {allIncidentSources.map((source) => {
                const selected = selectedSources.includes(source);
                return (
                  <Chip
                    key={source}
                    icon={
                      source === 'captured' ? (
                        <SensorsIcon sx={{ fontSize: 14 }} />
                      ) : undefined
                    }
                    label={incidentSourceLabel[source]}
                    color={source === 'captured' ? 'primary' : 'default'}
                    variant={selected ? 'filled' : 'outlined'}
                    size="small"
                    onClick={() => toggleSource(source)}
                  />
                );
              })}
            </Stack>
          </>
        ) : null}

        <Divider orientation="vertical" flexItem />
        <TextField
          size="small"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search driver / car #"
          sx={{ minWidth: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="replay-timeline-class-label">Class</InputLabel>
          <Select
            labelId="replay-timeline-class-label"
            label="Class"
            value={selectedClass}
            onChange={(event) => setSelectedClass(event.target.value)}
          >
            <MenuItem value="all">All Classes</MenuItem>
            {availableClasses.map((carClass) => (
              <MenuItem key={carClass} value={carClass}>
                {carClass}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {hasLimitedDataRecords ? (
          <Chip
            size="small"
            label="Hide Limited Data"
            variant={hideLimitedData ? 'filled' : 'outlined'}
            color={hideLimitedData ? 'primary' : 'default'}
            onClick={() => setHideLimitedData((previous) => !previous)}
          />
        ) : null}

        <Button
          sx={{ ml: 'auto !important' }}
          size="small"
          onClick={() => {
            setSelectedTypes(allTypes);
            setSelectedSources(allIncidentSources);
            setSearchQuery('');
            setSelectedClass('all');
            setHideLimitedData(false);
          }}
        >
          Reset Filters
        </Button>
      </Stack>

      <Box
        ref={timelineScrollContainerRef}
        sx={{ maxHeight: 280, overflowY: 'auto' }}
      >
        <Stack
          divider={
            <Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />
          }
        >
          {filteredEvents.map((event) => {
            const isActiveIncident = selectedIncidentId === event.id;

            return (
              <ReplayTimelineIncidentRow
                ref={(node) => {
                  incidentRowRefs.current[event.id] = node;
                }}
                key={event.id}
                event={event}
                isActiveIncident={isActiveIncident}
                hideJumpButtons={hideJumpButtons}
                incidentTypeLabel={incidentTypeLabel}
                incidentTypeColor={incidentTypeColor}
                onSelectIncident={onSelectIncident}
                onJumpToIncident={onJumpToIncident}
              />
            );
          })}

          {!filteredEvents.length && (
            <Box sx={{ px: 2, py: 3 }}>
              <Typography variant="body2" color="text.secondary">
                No incidents match the active filters.
              </Typography>
            </Box>
          )}
        </Stack>
      </Box>
    </Paper>
  );
};
