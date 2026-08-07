import { Outlet, useNavigate } from 'react-router-dom';
import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { ViewHeader } from '../../components/Common/ViewHeader';
import { LiveNavRail } from '../../components/Live/LiveNavRail';
import { LiveSessionHeader } from '../../components/Live/LiveSessionHeader';
import {
  LIVE_CAMERA_BAR_HEIGHT,
  LiveCameraControls,
} from '../../components/Live/LiveCameraControls';
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
  const {
    session,
    standings,
    fieldByClass,
    classFilter,
    focusedSlotId,
    liveIndicator,
    useFixtures,
    unreviewedCount,
    flaggedCount,
    deferredCount,
    onCycleFocus,
  } = useLiveSession();
  const { phase } = session;

  /*
    No bar when there is nothing to drive. A camera control that cannot move a
    camera is worse than no camera control: the steward presses it, nothing
    happens, and they learn to distrust the row. The shell already explains the
    absent session directly above.
  */
  const canDriveCamera = useFixtures || liveIndicator.state === 'live';

  return (
    <Box sx={{ pb: canDriveCamera ? `${LIVE_CAMERA_BAR_HEIGHT}px` : 0 }}>
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
            {/*
              Only once there are any. A steward who has deferred nothing does
              not need the word explaining itself in the header.
            */}
            {deferredCount > 0 ? ` · ${deferredCount} deferred` : ''}
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

      {/*
        Above the rail, not inside a route: this is the session's general
        information, and it answers the same questions whether the steward is
        adjudicating an incident or reading the timing screen.
      */}
      <LiveSessionHeader
        session={session}
        fieldByClass={fieldByClass}
        driverCount={standings.length}
      />

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', lg: '92px minmax(0, 1fr)' },
          alignItems: 'stretch',
          mb: 3,
        }}
      >
        {/*
          The badge counts incidents with no decision record at all. Flagged,
          deferred and decided ones are all things the steward has already
          touched; a badge that kept counting them would never clear, and a
          badge that never clears is one nobody looks at.
        */}
        <LiveNavRail badges={{ '/live/incidents': unreviewedCount }} />

        {/*
          The section owns its own internal layout; the shell only decides how
          much of the window it gets. Sections render at `height: 100%` inside
          this box on a wide screen and flow naturally on a narrow one.
        */}
        <Box
          sx={{
            minWidth: 0,
            boxSizing: 'border-box',
            // The subtraction accounts for the app bar, the view header and
            // the session strip above; the camera bar is fixed to the bottom
            // of the window, so it comes off the same total.
            height: {
              xs: 'auto',
              lg: `calc(100vh - ${372 + (canDriveCamera ? LIVE_CAMERA_BAR_HEIGHT : 0)}px)`,
            },
            minHeight: { lg: 460 },
          }}
        >
          <Outlet />
        </Box>
      </Box>

      {canDriveCamera ? (
        <LiveCameraControls
          standings={standings}
          classFilter={classFilter}
          focusedSlotId={focusedSlotId}
          onCycleFocus={onCycleFocus}
        />
      ) : null}
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
