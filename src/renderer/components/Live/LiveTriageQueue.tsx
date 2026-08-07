import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import {
  LiveIncident,
  LiveIncidentClassification,
  LiveIncidentFilters,
  LiveIncidentState,
  hasActiveLiveIncidentFilters,
  liveClassificationLabel,
  matchesLiveIncidentFilters,
} from './liveFixtures';

const classificationColor: Record<
  LiveIncidentClassification,
  'error' | 'warning' | 'secondary' | 'default'
> = {
  contact: 'error',
  'track-limits': 'warning',
  'blue-flag': 'secondary',
  'unsafe-rejoin': 'error',
  'loss-of-control': 'default',
};

/**
 * Also the sort order of the list. Deferred sits below flagged and above
 * decided: it is off the steward's plate for the session but not settled, and
 * burying it under every decided incident would hide the post-session workload.
 */
const stateOrder: LiveIncidentState[] = [
  'NEW',
  'FLAGGED',
  'DEFERRED',
  'DECIDED',
];

const stateLabel: Record<LiveIncidentState, string> = {
  NEW: 'New',
  FLAGGED: 'Flagged',
  DEFERRED: 'Deferred',
  DECIDED: 'Decided',
};

const stateColor: Record<
  LiveIncidentState,
  'error' | 'warning' | 'info' | 'success'
> = {
  NEW: 'error',
  FLAGGED: 'warning',
  DEFERRED: 'info',
  DECIDED: 'success',
};

const emptyStateCounts = (): Record<LiveIncidentState, number> => ({
  NEW: 0,
  FLAGGED: 0,
  DEFERRED: 0,
  DECIDED: 0,
});

const severityOf = (incident: LiveIncident): number =>
  incident.contactMagnitude ?? 0;

const severityTone = (incident: LiveIncident): string => {
  const magnitude = severityOf(incident);
  if (magnitude >= 2000) {
    return 'error.main';
  }
  if (magnitude >= 800) {
    return 'warning.main';
  }
  return 'text.secondary';
};

/**
 * Rows rendered before the steward has scrolled, and how many more each time
 * they reach the bottom.
 *
 * A long race passes four hundred incidents and every one of them is a Paper
 * row carrying several MUI components; mounting the lot costs the best part of
 * a second. Growing on scroll keeps that off the first paint without the
 * friction of a page number that has to be re-navigated every time a new
 * incident arrives.
 */
const PAGE_SIZE = 60;

interface LiveTriageRowProps {
  incident: LiveIncident;
  isSelected: boolean;
  onSelect: (incidentId: string) => void;
}

/**
 * Memoised, and the reason the whole chain above it bothers to keep incident
 * identities stable.
 *
 * The live view re-renders once a second because the standings underneath it
 * genuinely change. Without this boundary that re-rendered every row in the
 * queue every second — four hundred rows a second, none of which had changed —
 * which is what made the view unusable at scale. `onSelect` must stay
 * referentially stable at the call site or this buys nothing.
 */
const LiveTriageRow: React.FC<LiveTriageRowProps> = memo(
  ({ incident, isSelected, onSelect }) => (
    <Box
      onClick={() => onSelect(incident.id)}
      sx={{
        px: 2,
        py: 1.25,
        cursor: 'pointer',
        borderLeft: '3px solid',
        borderLeftColor: isSelected ? 'primary.main' : 'transparent',
        backgroundColor: isSelected ? 'action.selected' : 'transparent',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <Typography variant="caption" color="text.secondary">
          {incident.timestampLabel}
        </Typography>
        <Typography variant="caption" fontWeight={700}>
          {incident.lapLabel}
        </Typography>
        <Chip
          size="small"
          label={liveClassificationLabel[incident.classification]}
          color={classificationColor[incident.classification]}
          variant="outlined"
          sx={{ height: 20, fontSize: 10 }}
        />
        <Box sx={{ flex: 1 }} />
        {incident.state === 'FLAGGED' ? (
          <Chip
            size="small"
            label="Flagged"
            color="warning"
            variant="filled"
            sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
          />
        ) : null}
        {incident.state === 'DEFERRED' ? (
          <Chip
            size="small"
            label="Deferred"
            color="info"
            variant="outlined"
            sx={{ height: 20, fontSize: 10 }}
          />
        ) : null}
        {incident.state === 'DECIDED' ? (
          <Chip
            size="small"
            label="Decided"
            color="success"
            variant="outlined"
            sx={{ height: 20, fontSize: 10 }}
          />
        ) : null}
      </Stack>

      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        {incident.drivers.map((driver) => (
          <Stack
            key={`${incident.id}-${driver.steamId}`}
            direction="row"
            spacing={0.5}
            alignItems="center"
          >
            <Typography variant="body2">{driver.displayName}</Typography>
            {driver.isAiDriver ? <AiBadge /> : null}
            <Typography variant="body2" color="text.secondary">
              #{driver.carNumber}
            </Typography>
            <CarClassBadge carClass={driver.carClass} />
          </Stack>
        ))}
      </Stack>

      {incident.contactMagnitude ? (
        <Typography
          variant="caption"
          sx={{ color: severityTone(incident), fontWeight: 700 }}
        >
          {incident.contactMagnitude.toFixed(0)} magnitude
        </Typography>
      ) : null}
    </Box>
  ),
);

LiveTriageRow.displayName = 'LiveTriageRow';

interface LiveTriageQueueProps {
  incidents: LiveIncident[];
  selectedIncidentId?: string;
  stateFilter: LiveIncidentState | 'ALL';
  /**
   * The rest of the quick filters, applied here rather than upstream so they
   * land before the scroll window — filtering after it would search only the
   * sixty rows that happen to be mounted.
   */
  filters: LiveIncidentFilters;
  onSelectIncident: (incidentId: string) => void;
  onChangeStateFilter: (next: LiveIncidentState | 'ALL') => void;
  /** Offered when the filters have emptied the list, so it is one click out. */
  onClearFilters?: () => void;
}

export const LiveTriageQueue: React.FC<LiveTriageQueueProps> = ({
  incidents,
  selectedIncidentId,
  stateFilter,
  filters,
  onSelectIncident,
  onChangeStateFilter,
  onClearFilters,
}) => {
  const matching = useMemo(
    () =>
      incidents.filter((incident) =>
        matchesLiveIncidentFilters(incident, filters),
      ),
    [filters, incidents],
  );

  /*
    Counted over the filtered set rather than the whole session, so the buckets
    answer the question actually being asked: "of the contacts I am looking at,
    how many are still new".
  */
  const counts = useMemo(
    () =>
      matching.reduce<Record<LiveIncidentState, number>>((acc, incident) => {
        acc[incident.state] += 1;
        return acc;
      }, emptyStateCounts()),
    [matching],
  );

  const visible = useMemo(
    () =>
      matching
        .filter((i) => (stateFilter === 'ALL' ? true : i.state === stateFilter))
        .sort((a, b) => {
          const stateDelta =
            stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state);
          if (stateDelta !== 0) {
            return stateDelta;
          }
          return severityOf(b) - severityOf(a);
        }),
    [matching, stateFilter],
  );

  const filtersActive = hasActiveLiveIncidentFilters(filters);

  const [limit, setLimit] = useState(PAGE_SIZE);

  // A different bucket is a different list; showing it already scrolled deep
  // would be disorienting. The same goes for any of the other filters moving.
  useEffect(() => setLimit(PAGE_SIZE), [stateFilter, filters]);

  const total = visible.length;
  const onScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
        // Capped, so a steward resting at the bottom of the list does not walk
        // the limit up forever on every scroll event.
        setLimit((current) =>
          current >= total ? current : current + PAGE_SIZE,
        );
      }
    },
    [total],
  );

  const rendered = visible.slice(0, limit);
  const remaining = visible.length - rendered.length;

  return (
    <Paper
      variant="outlined"
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
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Triage Queue
        </Typography>
        <Badge
          badgeContent={counts.NEW}
          color="error"
          sx={{
            '& .MuiBadge-badge': { position: 'static', transform: 'none' },
          }}
        />
        <Box sx={{ flex: 1 }} />
      </Stack>

      <Stack
        direction="row"
        spacing={0.5}
        sx={{ px: 1.5, py: 1, flexWrap: 'wrap' }}
        useFlexGap
      >
        <Chip
          size="small"
          label={`All ${matching.length}`}
          clickable
          aria-pressed={stateFilter === 'ALL'}
          variant={stateFilter === 'ALL' ? 'filled' : 'outlined'}
          color={stateFilter === 'ALL' ? 'primary' : 'default'}
          onClick={() => onChangeStateFilter('ALL')}
        />
        {stateOrder.map((state) => {
          const isActive = stateFilter === state;
          return (
            <Chip
              key={state}
              size="small"
              label={`${stateLabel[state]} ${counts[state]}`}
              clickable
              aria-pressed={isActive}
              variant={isActive ? 'filled' : 'outlined'}
              color={stateColor[state]}
              onClick={() => onChangeStateFilter(state)}
              sx={{
                fontWeight: isActive ? 700 : 400,
                ...(isActive
                  ? {}
                  : {
                      '&:hover': {
                        backgroundColor: (theme) =>
                          alpha(theme.palette[stateColor[state]].main, 0.12),
                      },
                    }),
              }}
            />
          );
        })}
      </Stack>

      <Box
        sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}
        onScroll={onScroll}
      >
        {visible.length === 0 ? (
          <Stack spacing={1} alignItems="center" sx={{ px: 2, py: 3 }}>
            <Typography
              variant="body2"
              color="text.secondary"
              textAlign="center"
            >
              {/*
                An empty list has two very different causes, and a steward who
                cannot tell them apart will read a filtered-out queue as a quiet
                session.
              */}
              {filtersActive
                ? `No incident matches these filters${
                    incidents.length ? ` — ${incidents.length} hidden` : ''
                  }.`
                : 'Nothing in this bucket.'}
            </Typography>
            {filtersActive && onClearFilters ? (
              <Button size="small" onClick={onClearFilters}>
                Clear filters
              </Button>
            ) : null}
          </Stack>
        ) : null}

        {rendered.map((incident) => (
          <LiveTriageRow
            key={incident.id}
            incident={incident}
            isSelected={incident.id === selectedIncidentId}
            onSelect={onSelectIncident}
          />
        ))}

        {remaining > 0 ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', px: 2, py: 2, textAlign: 'center' }}
          >
            {remaining} more · keep scrolling
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
};
