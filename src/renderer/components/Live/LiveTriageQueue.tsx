import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import {
  LiveIncident,
  LiveIncidentClassification,
  LiveIncidentState,
} from './liveFixtures';

const classificationLabel: Record<LiveIncidentClassification, string> = {
  contact: 'Contact',
  'track-limits': 'Track Limits',
  'blue-flag': 'Blue Flag',
  'unsafe-rejoin': 'Unsafe Rejoin',
  'loss-of-control': 'Loss of Control',
};

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

const stateOrder: LiveIncidentState[] = ['NEW', 'FLAGGED', 'DECIDED'];

const stateLabel: Record<LiveIncidentState, string> = {
  NEW: 'New',
  FLAGGED: 'Flagged',
  DECIDED: 'Decided',
};

const stateColor: Record<LiveIncidentState, 'error' | 'warning' | 'success'> = {
  NEW: 'error',
  FLAGGED: 'warning',
  DECIDED: 'success',
};

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
          label={classificationLabel[incident.classification]}
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
  onSelectIncident: (incidentId: string) => void;
  onChangeStateFilter: (next: LiveIncidentState | 'ALL') => void;
}

export const LiveTriageQueue: React.FC<LiveTriageQueueProps> = ({
  incidents,
  selectedIncidentId,
  stateFilter,
  onSelectIncident,
  onChangeStateFilter,
}) => {
  const counts = useMemo(
    () =>
      stateOrder.reduce<Record<LiveIncidentState, number>>(
        (acc, state) => {
          acc[state] = incidents.filter((i) => i.state === state).length;
          return acc;
        },
        { NEW: 0, FLAGGED: 0, DECIDED: 0 },
      ),
    [incidents],
  );

  const visible = useMemo(
    () =>
      incidents
        .filter((i) => (stateFilter === 'ALL' ? true : i.state === stateFilter))
        .sort((a, b) => {
          const stateDelta =
            stateOrder.indexOf(a.state) - stateOrder.indexOf(b.state);
          if (stateDelta !== 0) {
            return stateDelta;
          }
          return severityOf(b) - severityOf(a);
        }),
    [incidents, stateFilter],
  );

  const [limit, setLimit] = useState(PAGE_SIZE);

  // A different bucket is a different list; showing it already scrolled deep
  // would be disorienting.
  useEffect(() => setLimit(PAGE_SIZE), [stateFilter]);

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
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Triage Queue
        </Typography>
        <Badge
          badgeContent={counts.NEW}
          color="error"
          sx={{ '& .MuiBadge-badge': { position: 'static', transform: 'none' } }}
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
          label={`All ${incidents.length}`}
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
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 2, py: 3, textAlign: 'center' }}
          >
            Nothing in this bucket.
          </Typography>
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
