import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { BlockQuote } from '../Common/BlockQuote';

interface ArchiveConfirmDialogProps {
  open: boolean;
  /** How many replays the action covers. Drives the title and button copy. */
  replayCount: number;
  /** Optional label for a single target, such as "Race" or "this weekend". */
  targetLabel?: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}

const NOTE_HELP_TEXT =
  'A note to yourself about why this was archived — for example "reviewed, no action needed". ' +
  'It is shown on the replay in the Archived view and can be edited or removed later.';

export const ArchiveConfirmDialog: React.FC<ArchiveConfirmDialogProps> = ({
  open,
  replayCount,
  targetLabel,
  onCancel,
  onConfirm,
}) => {
  const [note, setNote] = useState('');

  // Each dialog opening starts from a clean note rather than inheriting the
  // text from whatever was archived last.
  useEffect(() => {
    if (open) {
      setNote('');
    }
  }, [open]);

  const title = targetLabel
    ? `Archive ${targetLabel}?`
    : `Archive ${replayCount} ${replayCount === 1 ? 'session' : 'sessions'}?`;

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {replayCount === 1 ? 'This session' : `These ${replayCount} sessions`}{' '}
          will be removed from your dashboard. You can restore
          {replayCount === 1 ? ' it ' : ' them '}
          at any time from the Archived view.
        </Typography>
        <BlockQuote type="info">
          <Typography variant="body2">
            The replay and log files on your PC are not touched. LMU Steward
            never deletes anything from your Le Mans Ultimate installation.
          </Typography>
        </BlockQuote>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            mt: 3,
            mb: 1,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Note (optional)
          </Typography>
          <Tooltip title={NOTE_HELP_TEXT}>
            <InfoOutlinedIcon
              aria-label="About archive notes"
              sx={{ width: '16px', height: '16px', color: 'text.secondary' }}
            />
          </Tooltip>
        </Box>
        <TextField
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Reviewed, no action needed"
          multiline
          minRows={2}
          fullWidth
          size="small"
          slotProps={{ htmlInput: { 'aria-label': 'Archive note' } }}
        />
        {replayCount > 1 ? (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            This note will be added to all {replayCount} sessions.
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          Cancel
        </Button>
        <Button onClick={() => onConfirm(note)} variant="contained">
          Archive
        </Button>
      </DialogActions>
    </Dialog>
  );
};
