import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ViewHeader } from '../components/Common/ViewHeader';
import { CareerDataHealth } from '../components/DriverDashboard/CareerDataHealth';
import { CareerDisciplineCard } from '../components/DriverDashboard/CareerDisciplineCard';
import { CareerHeadline } from '../components/DriverDashboard/CareerHeadline';
import { CareerResultsCard } from '../components/DriverDashboard/CareerResultsCard';
import { CareerTrackTable } from '../components/DriverDashboard/CareerTrackTable';
import { useCareerSummary } from '../hooks/useCareerSummary';

export const DriverDashboardView = () => {
  const navigate = useNavigate();
  const { aggregate, loading, scanning, error, rescan, claimIdentity } =
    useCareerSummary();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const isEmpty = !aggregate || aggregate.headline.sessions === 0;

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

      {isEmpty ? (
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
      ) : (
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
            <Box sx={{ flex: '1 1 340px', minWidth: 320 }}>
              <CareerResultsCard aggregate={aggregate} />
            </Box>
            <Box sx={{ flex: '1 1 340px', minWidth: 320 }}>
              <CareerDisciplineCard aggregate={aggregate} />
            </Box>
          </Box>

          <CareerTrackTable tracks={aggregate.tracks} />

          <CareerDataHealth
            aggregate={aggregate}
            scanning={scanning}
            onRescan={rescan}
            onClaimIdentity={claimIdentity}
          />
        </>
      )}
    </Box>
  );
};
