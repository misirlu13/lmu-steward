import { Outlet, useNavigate } from 'react-router-dom';
import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { ViewHeader } from '../../components/Common/ViewHeader';
import { LiveNavRail } from '../../components/Live/LiveNavRail';
import {
  LiveSessionProvider,
  useLiveSession,
} from '../../providers/LiveSessionContext';
import { LiveSessionPhase } from '../../components/Live/liveFixtures';

const phaseLabel: Record<LiveSessionPhase, string> = {
  green: 'Green Flag',
  red: 'Red Flag',
  finished: 'Session Over',
};

const phaseColor: Record<LiveSessionPhase, string> = {
  green: 'success.main',
  red: 'error.main',
  finished: 'text.secondary',
};

const LiveShellBody: React.FC = () => {
  const navigate = useNavigate();
  const { session, liveIndicator, useFixtures, unreviewedCount, flaggedCount } =
    useLiveSession();
  const { phase } = session;

  return (
    <Box>
      <ViewHeader
        breadcrumb={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate('/')}
            >
              Driver
            </Typography>
            <Typography variant="caption" color="text.secondary">
              /
            </Typography>
            <Typography variant="caption" color="primary.main" fontWeight={700}>
              Live Session
            </Typography>
          </Stack>
        }
        title={
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5">{session.trackName}</Typography>
            <Box
              sx={{
                backgroundColor: phaseColor[phase],
                color: '#0B1218',
                borderRadius: '4px',
                padding: '4px',
                fontSize: '0.75rem',
                lineHeight: '0.75rem',
                fontWeight: 'bold',
              }}
            >
              {phaseLabel[phase]}
            </Box>
            {useFixtures ? (
              <Tooltip title="Dev mode: this view is rendering fixture data, not a live session.">
                <Chip
                  size="small"
                  icon={<ScienceOutlinedIcon />}
                  label="Fixture data"
                  variant="outlined"
                  sx={{ height: 22, fontSize: 10 }}
                />
              </Tooltip>
            ) : null}
          </Stack>
        }
        subtitle={
          <Typography variant="caption" color="text.secondary">
            {unreviewedCount} unreviewed · {flaggedCount} flagged for review
          </Typography>
        }
        onBack={() => navigate('/')}
      />

      {!useFixtures && liveIndicator.state !== 'live' ? (
        <Paper
          variant="outlined"
          sx={{ borderColor: 'divider', borderRadius: 2, p: 2, mb: 2 }}
        >
          <Typography variant="subtitle1" fontWeight={700}>
            No live session
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {liveIndicator.detail ?? liveIndicator.label} Live capture attaches
            automatically once Le Mans Ultimate loads a session with plugins
            enabled.
          </Typography>
        </Paper>
      ) : null}

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: '92px minmax(0, 1fr)' },
          alignItems: 'stretch',
          mb: 3,
        }}
      >
        <LiveNavRail />

        {/*
          The section owns its own internal layout; the shell only decides how
          much of the window it gets. Sections render at `height: 100%` inside
          this box on a wide screen and flow naturally on a narrow one.
        */}
        <Box
          sx={{
            minWidth: 0,
            boxSizing: 'border-box',
            height: { xs: 'auto', lg: 'calc(100vh - 300px)' },
            minHeight: { lg: 520 },
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
};

/**
 * The live shell: session header, section rail, and whichever section the
 * steward is on.
 *
 * The provider sits above the outlet on purpose. It holds the 1 Hz poll and
 * the steward's selection, so moving between sections neither restarts the
 * capture feed nor loses the incident being adjudicated.
 */
export const LiveShell: React.FC = () => (
  <LiveSessionProvider>
    <LiveShellBody />
  </LiveSessionProvider>
);
