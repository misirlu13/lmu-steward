import { useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, Paper, Stack, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import MovieOutlinedIcon from '@mui/icons-material/MovieOutlined';
import { CONSTANTS } from '@constants';
import { resolveReplayHeaderMetadata } from '../../utils/replayMetadata';
import { sendMessage } from '../../utils/postMessage';
import { useApi } from '../../providers/ApiContext';

/**
 * The way back to a replay the steward has walked away from.
 *
 * Loading a replay takes over Le Mans Ultimate, and the game keeps showing it
 * whatever screen this app is on. Leaving the replay view for the driver
 * dashboard, the captured sessions or settings therefore used to strand the
 * steward: the replay was still running, the app had no route back to it, and
 * loading a different one from the list would not fire in the game because one
 * was already loaded. The only way out was to go to the replay list, which
 * closes the replay as a side effect of its back button.
 *
 * So the state is made visible instead of being left to be discovered. Both
 * ways out are on the bar — go back to it, or close it — because the steward
 * who stepped away to check a setting and the steward who is finished with the
 * replay want opposite things and the app cannot tell which is which.
 *
 * Hidden on the replay routes themselves, where the replay is not somewhere
 * else: `/replay/:hash` is the view this points at, and the driver analysis
 * beneath it is part of the same visit.
 */
export const LoadedReplayBar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentReplay, isReplayActive } = useApi();

  /*
    Both conditions, not either. `currentReplay` is what the game was last told
    to watch and `isReplayActive` is what the game says it is doing — a bar
    drawn on the first alone would outlive the steward pressing LMU's own stop,
    and one drawn on the second alone would appear for a live session that has
    merely been rewound, with no replay to go back to.
  */
  if (
    !currentReplay ||
    isReplayActive !== true ||
    location.pathname.startsWith('/replay/')
  ) {
    return null;
  }

  const { title } = resolveReplayHeaderMetadata({
    replay: currentReplay,
    trackMetaData: CONSTANTS.TRACK_META_DATA,
  });

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Replay still loaded"
      sx={{
        borderColor: 'primary.main',
        borderRadius: 2,
        px: 2,
        py: 1,
        mb: 2,
        backgroundColor: (theme) => `${theme.palette.primary.main}14`,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <MovieOutlinedIcon fontSize="small" color="primary" />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" fontWeight={700} noWrap>
            {title || currentReplay.replayName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Still loaded in Le Mans Ultimate
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }} />

        <Button
          size="small"
          variant="contained"
          onClick={() => navigate(`/replay/${currentReplay.hash}`)}
        >
          Back to replay
        </Button>
        {/*
          Spelled out, because "close" is ambiguous next to a bar that could
          just as well be dismissed. This one acts on the game.
        */}
        <Tooltip title="Close the replay in Le Mans Ultimate. Another replay will not load until this one is closed.">
          <Button
            size="small"
            startIcon={<CloseIcon />}
            onClick={() => sendMessage(CONSTANTS.API.POST_CLOSE_REPLAY)}
          >
            Close replay
          </Button>
        </Tooltip>
      </Stack>
    </Paper>
  );
};
