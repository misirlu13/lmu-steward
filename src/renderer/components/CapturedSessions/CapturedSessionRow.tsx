import { useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LinkIcon from '@mui/icons-material/Link';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import { LiveSessionSummary } from '@types';

interface Props {
  session: LiveSessionSummary;
  isDeleting: boolean;
  onViewReplay: (replayHash: string) => void;
  onLinkReplay: (session: LiveSessionSummary) => void;
  onDelete: (session: LiveSessionSummary) => void;
}

/**
 * One captured session.
 *
 * Actions live behind an overflow menu rather than sitting on the row. There
 * are three of them now and more will follow as review moves onto this screen,
 * and a row of buttons competes with the counts for attention — which are the
 * thing a steward is actually scanning for.
 */
export const CapturedSessionRow: React.FC<Props> = ({
  session,
  isDeleting,
  onViewReplay,
  onLinkReplay,
  onDelete,
}) => {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = () => setMenuAnchor(null);

  const linkedReplayHash = session.link?.replayHash;
  const linkedReplayName = session.link?.replayName;
  const proposedReplayName = session.proposal?.replayName;

  return (
    <Paper
      variant="outlined"
      sx={{ borderColor: 'divider', borderRadius: 1, p: 2 }}
    >
      <Stack direction="row" alignItems="center" spacing={2}>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body1" noWrap>
            {session.trackName || 'Unknown track'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {session.sessionType ?? 'Session'} ·{' '}
            {new Date(session.startedAt).toLocaleString()} ·{' '}
            {session.driverCount} drivers
          </Typography>

          {/*
            The replay is named on the row rather than hidden in a tooltip. A
            weekend's replays differ only by their session suffix — "P1 7"
            against "P1 8" — so which one a capture belongs to is the whole
            question, and it should not need hovering to answer.
          */}
          {linkedReplayName || proposedReplayName ? (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              noWrap
            >
              {linkedReplayName
                ? `Linked to ${linkedReplayName}`
                : `Possible match: ${proposedReplayName}`}
            </Typography>
          ) : null}
        </Box>

        {/*
          Linked and proposed are worth a chip; unlinked is not. A replay is
          often simply not kept, so marking that state would flag something the
          user cannot fix and does not need to.
        */}
        {session.linkState === 'linked' ? (
          <Chip size="small" color="success" label="Linked" />
        ) : null}
        {session.linkState === 'proposed' ? (
          <Tooltip title="Confirm this before it is used">
            <Chip size="small" color="warning" label="Replay found" />
          </Tooltip>
        ) : null}

        <Tooltip title="Incidents captured">
          <Chip size="small" label={`${session.incidentCount} incidents`} />
        </Tooltip>
        {/*
          Called out separately because it is the only part a replay cannot
          rebuild: traces exist nowhere else once this is deleted.
        */}
        <Tooltip title="Incidents with a recorded trace">
          <Chip
            size="small"
            color={session.evidenceCount > 0 ? 'primary' : 'default'}
            label={`${session.evidenceCount} with evidence`}
          />
        </Tooltip>

        <IconButton
          aria-label={`Actions for ${session.trackName || 'this session'}`}
          size="small"
          disabled={isDeleting}
          onClick={(event) => setMenuAnchor(event.currentTarget)}
          sx={{ color: 'text.secondary' }}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
      >
        {/*
          Opening the replay from here is the only reliable way to reach the
          right one. Replay titles come from a track mapping and a session
          suffix, so a weekend's sessions look nearly identical in the replay
          list — the link knows exactly which file this capture belongs to.
        */}
        {linkedReplayHash ? (
          <MenuItem
            onClick={() => {
              closeMenu();
              onViewReplay(linkedReplayHash);
            }}
          >
            <ListItemIcon>
              <PlayCircleFilledIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>View Replay</ListItemText>
          </MenuItem>
        ) : null}

        <MenuItem
          onClick={() => {
            closeMenu();
            onLinkReplay(session);
          }}
        >
          <ListItemIcon>
            <LinkIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>
            {session.linkState === 'linked' ? 'Change Replay' : 'Link Replay'}
          </ListItemText>
        </MenuItem>

        <MenuItem
          onClick={() => {
            closeMenu();
            onDelete(session);
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>
            {isDeleting ? 'Deleting…' : 'Delete Session'}
          </ListItemText>
        </MenuItem>
      </Menu>
    </Paper>
  );
};
