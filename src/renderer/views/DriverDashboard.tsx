import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ViewHeader } from '../components/Common/ViewHeader';
import { CareerActivityCard } from '../components/DriverDashboard/CareerActivityCard';
import { CareerCarsCard } from '../components/DriverDashboard/CareerCarsCard';
import { CareerDataHealth } from '../components/DriverDashboard/CareerDataHealth';
import { CareerDisciplineCard } from '../components/DriverDashboard/CareerDisciplineCard';
import { CareerFilterBar } from '../components/DriverDashboard/CareerFilterBar';
import { CareerHeadline } from '../components/DriverDashboard/CareerHeadline';
import { CareerMilestones } from '../components/DriverDashboard/CareerMilestones';
import { CareerPaceCard } from '../components/DriverDashboard/CareerPaceCard';
import { CareerRecentSessions } from '../components/DriverDashboard/CareerRecentSessions';
import { CareerResultsCard } from '../components/DriverDashboard/CareerResultsCard';
import { CareerRivalsCard } from '../components/DriverDashboard/CareerRivalsCard';
import { CareerTrackTable } from '../components/DriverDashboard/CareerTrackTable';
import { useCareerSummary } from '../hooks/useCareerSummary';

export const DriverDashboardView = () => {
  const navigate = useNavigate();
  const {
    aggregate,
    filters,
    loading,
    scanning,
    error,
    setFilters,
    rescan,
    claimIdentity,
    setSessionExcluded,
  } = useCareerSummary();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const hasCareer = Boolean(aggregate) && aggregate!.headline.sessions > 0;
  /*
   * A filter that matches nothing is not an empty career, and must not offer to
   * scan as though it were — the sessions are there, just outside the view.
   */
  const filteredToNothing =
    !hasCareer && Boolean(aggregate?.filterOptions.tracks.length);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <ViewHeader
        title={aggregate?.identity.primary || 'Driver'}
        subtitle="Career"
        actions={
          <Button size="small" onClick={() => navigate('/replays')}>
            Replays
          </Button>
        }
      />

      {error ? <Alert severity="error">{error}</Alert> : null}

      {aggregate && (hasCareer || filteredToNothing) ? (
        <CareerFilterBar
          filters={filters}
          options={aggregate.filterOptions}
          onChange={setFilters}
        />
      ) : null}

      {!aggregate || (!hasCareer && !filteredToNothing) ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            No sessions recorded yet
          </Typography>
          {/*
            Deliberately explicit about where the data comes from. A driver whose
            career looks empty needs to know it is built from result logs rather
            than replays, because the two are kept in different places and pruned
            for different reasons.
          */}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Your career is built from the result logs LMU writes after every
            session. Run a scan to read them.
          </Typography>
          <Button
            variant="contained"
            onClick={() => rescan()}
            disabled={scanning}
          >
            {scanning ? 'Scanning…' : 'Scan result logs'}
          </Button>
          {aggregate ? (
            <Box sx={{ mt: 3, textAlign: 'left' }}>
              <CareerDataHealth
                aggregate={aggregate}
                scanning={scanning}
                onRescan={rescan}
                onClaimIdentity={claimIdentity}
              />
            </Box>
          ) : null}
        </Box>
      ) : null}

      {aggregate && filteredToNothing ? (
        <Alert severity="info">
          No sessions match this filter. Your career is still here — widen the
          view to see it.
        </Alert>
      ) : null}

      {aggregate && hasCareer ? (
        <>
          <CareerHeadline aggregate={aggregate} />

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'stretch',
            }}
          >
            <Box sx={{ flex: '1 1 320px', minWidth: 300 }}>
              <CareerResultsCard aggregate={aggregate} />
            </Box>
            <Box sx={{ flex: '1 1 320px', minWidth: 300 }}>
              <CareerPaceCard aggregate={aggregate} />
            </Box>
            <Box sx={{ flex: '1 1 320px', minWidth: 300 }}>
              <CareerDisciplineCard aggregate={aggregate} />
            </Box>
          </Box>

          <CareerTrackTable tracks={aggregate.tracks} />
          <CareerCarsCard aggregate={aggregate} />

          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'stretch',
            }}
          >
            <Box sx={{ flex: '1 1 320px', minWidth: 300 }}>
              <CareerRivalsCard aggregate={aggregate} />
            </Box>
            <Box sx={{ flex: '2 1 480px', minWidth: 320 }}>
              <CareerActivityCard aggregate={aggregate} />
            </Box>
          </Box>

          <CareerMilestones aggregate={aggregate} />

          <CareerRecentSessions
            sessions={aggregate.recentSessions}
            onToggleExcluded={setSessionExcluded}
          />

          <CareerDataHealth
            aggregate={aggregate}
            scanning={scanning}
            onRescan={rescan}
            onClaimIdentity={claimIdentity}
          />
        </>
      ) : null}
    </Box>
  );
};
