import { Outlet, useNavigate } from 'react-router-dom';
import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SensorsOffIcon from '@mui/icons-material/SensorsOff';
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
import {
  LiveSessionPhase,
  liveSegmentLabel,
} from '../../components/Live/liveFixtures';

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
    liveUnreviewedCount,
    flaggedCount,
    deferredCount,
    isReviewingRecord,
    selectedSegment,
    onCycleFocus,
    /*
      Resolved in the provider, not here. The same condition decides whether the
      bar exists, whether the poll that keeps it honest runs, and how much room
      the shell leaves at the bottom — three things that must never disagree.
    */
    canDriveCamera,
    isReplayActive,
    gameCamera,
    onReturnToLive,
  } = useLiveSession();
  const { phase } = session;

  /*
    Nothing is running and this is not dev mode, so there is no session for any
    of it to be about.

    Everything below — the track name, the phase badge, the class counts, the
    timing table, the map — falls back to the layout fixture when capture is
    detached, which is why this screen greeted a steward with "Bahrain
    International Circuit" and a full field on a machine with the game closed.
    The empty state replaces the view rather than sitting above it: a fixture
    rendered underneath an explanation that there is no session is still a
    screen full of numbers that are not true.

    Nothing is lost by standing the rest down. The segment picker, the track map
    and the poll behind them are all gated on the same condition in the
    provider, so with no session there is no record to read here either.
  */
  if (!useFixtures && liveIndicator.state !== 'live') {
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
              <Typography
                variant="caption"
                color="primary.main"
                fontWeight={700}
              >
                Live Session
              </Typography>
            </Stack>
          }
          title={<Typography variant="h5">No Live Session</Typography>}
          onBack={() => navigate('/')}
        />

        <Paper
          variant="outlined"
          component="section"
          aria-label="No live session"
          sx={{
            borderColor: 'divider',
            borderRadius: 2,
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 1,
            textAlign: 'center',
          }}
        >
          <SensorsOffIcon sx={{ fontSize: 40, color: 'text.secondary' }} />
          <Typography variant="subtitle1" fontWeight={700}>
            No live session
          </Typography>
          {/*
            The indicator's own words. It already distinguishes "the game is not
            running" from "the game is running and between sessions", and those
            two send a steward to different places.
          */}
          <Typography variant="body2" color="text.secondary">
            {liveIndicator.detail ?? liveIndicator.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Live capture attaches automatically once Le Mans Ultimate loads a
            session with plugins enabled.
          </Typography>
        </Paper>
      </Box>
    );
  }

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
            {/*
              Named only when the counts are not the running session's. The
              subtitle and the rail badge deliberately disagree while a record is
              open — the badge keeps counting the live session — and this is what
              says which of the two numbers is which.
            */}
            {isReviewingRecord && selectedSegment
              ? `${liveSegmentLabel(selectedSegment.session)} (record) · `
              : ''}
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

          The *running* session's count, not the selected segment's. It is the
          app's only persistent "there is work waiting" signal, and a steward who
          opened practice must not have it go quiet while the race fills up
          behind them.
        */}
        <LiveNavRail badges={{ '/live/incidents': liveUnreviewedCount }} />

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
          isReplayActive={isReplayActive}
          gameCamera={gameCamera}
          onReturnToLive={onReturnToLive}
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
