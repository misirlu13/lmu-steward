import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { CarClassBadge } from '../../components/CarClassBadge/CarClassBadge';
import { AiBadge } from '../../components/Common/AiBadge';
import { StatDisplay } from '../../components/Common/StatDisplay';
import { LiveFieldState } from '../../components/Live/LiveFieldState';
import { useLiveSession } from '../../providers/LiveSessionContext';
import {
  LiveIncident,
  liveClassificationLabel,
} from '../../components/Live/liveFixtures';

/** Enough to see what the session is asking of you, not enough to work from. */
const ATTENTION_LIMIT = 6;

interface AttentionRowProps {
  incident: LiveIncident;
  onOpen: (incidentId: string) => void;
}

const AttentionRow: React.FC<AttentionRowProps> = ({ incident, onOpen }) => (
  <Box
    onClick={() => onOpen(incident.id)}
    sx={{
      px: 2,
      py: 1.25,
      cursor: 'pointer',
      borderBottom: '1px solid',
      borderColor: 'divider',
      '&:hover': { backgroundColor: 'action.hover' },
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
        variant="outlined"
        sx={{ height: 20, fontSize: 10 }}
      />
      <Box sx={{ flex: 1 }} />
      {incident.state === 'FLAGGED' ? (
        <Chip
          size="small"
          label="Flagged"
          color="warning"
          sx={{ height: 20, fontSize: 10, fontWeight: 700 }}
        />
      ) : null}
      {incident.contactMagnitude ? (
        <Typography variant="caption" color="text.secondary">
          {incident.contactMagnitude.toFixed(0)}
        </Typography>
      ) : null}
    </Stack>
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
  </Box>
);

/**
 * The glanceable landing screen for `/live`.
 *
 * Summary widgets, not the full panels — the work happens in the sections. The
 * call this makes deliberately: `/live` stays a stable destination that answers
 * "what is this session asking of me right now" on a second monitor, rather
 * than becoming whichever surface happened to be built first. Steps 7 and 9
 * add their own summaries here as the timing and pressure screens land.
 */
export const LiveOverview: React.FC = () => {
  const navigate = useNavigate();
  const {
    session,
    standings,
    battles,
    incidents,
    liveIndicator,
    unreviewedCount,
    flaggedCount,
    deferredCount,
    decidedCount,
    stewardPenaltiesByDriver,
    onSelectIncident,
    onFocusCar,
  } = useLiveSession();

  const needsAttention = useMemo(
    () =>
      incidents
        .filter(
          (incident) =>
            incident.state === 'NEW' || incident.state === 'FLAGGED',
        )
        // Same ordering as the triage queue, so the top of this list is the top
        // of that one.
        .sort((a, b) => {
          if (a.state !== b.state) {
            return a.state === 'NEW' ? -1 : 1;
          }
          return (b.contactMagnitude ?? 0) - (a.contactMagnitude ?? 0);
        })
        .slice(0, ATTENTION_LIMIT),
    [incidents],
  );

  const openIncident = (incidentId: string) => {
    onSelectIncident(incidentId);
    navigate('/live/incidents');
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' },
        gridAutoRows: { xs: 'minmax(320px, auto)', lg: 'minmax(0, 1fr)' },
        height: { xs: 'auto', lg: '100%' },
        boxSizing: 'border-box',
      }}
    >
      <Stack spacing={2} sx={{ minHeight: 0 }}>
        <Paper
          variant="outlined"
          sx={{ borderColor: 'divider', borderRadius: 2, py: 2 }}
        >
          <Stack direction="row" flexWrap="wrap" useFlexGap>
            <StatDisplay label="Unreviewed" minWidth={120}>
              <Typography
                variant="h5"
                color={unreviewedCount > 0 ? 'error.main' : 'text.primary'}
              >
                {unreviewedCount}
              </Typography>
            </StatDisplay>
            <StatDisplay label="Flagged" minWidth={120}>
              <Typography
                variant="h5"
                color={flaggedCount > 0 ? 'warning.main' : 'text.primary'}
              >
                {flaggedCount}
              </Typography>
            </StatDisplay>
            {/*
              Shown only once something has been deferred. Zero-by-default
              counters teach a steward to stop reading the row; this one earns
              its place by appearing when it has something to say.
            */}
            {deferredCount > 0 ? (
              <StatDisplay label="Deferred" minWidth={120}>
                <Typography variant="h5" color="info.main">
                  {deferredCount}
                </Typography>
              </StatDisplay>
            ) : null}
            <StatDisplay label="Decided" minWidth={120}>
              <Typography variant="h5">{decidedCount}</Typography>
            </StatDisplay>
            <StatDisplay label="Field" minWidth={120}>
              <Typography variant="h5">{standings.length}</Typography>
            </StatDisplay>
            <StatDisplay label="Session" minWidth={140}>
              <Typography variant="h5">{session.sessionType}</Typography>
            </StatDisplay>
          </Stack>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            borderColor: 'divider',
            borderRadius: 2,
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
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
              Needs Attention
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Button
              size="small"
              endIcon={<ChevronRightIcon />}
              onClick={() => navigate('/live/incidents')}
            >
              Incident queue
            </Button>
          </Stack>

          <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {needsAttention.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ px: 2, py: 3, textAlign: 'center' }}
              >
                Nothing waiting on the steward.
              </Typography>
            ) : null}

            {needsAttention.map((incident) => (
              <AttentionRow
                key={incident.id}
                incident={incident}
                onOpen={openIncident}
              />
            ))}
          </Box>
        </Paper>
      </Stack>

      <LiveFieldState
        session={session}
        standings={standings}
        battles={battles}
        captureLabel={liveIndicator.label}
        isCaptureLive={liveIndicator.state === 'live'}
        stewardPenaltiesByDriver={stewardPenaltiesByDriver}
        onFocusCar={onFocusCar}
      />
    </Box>
  );
};
