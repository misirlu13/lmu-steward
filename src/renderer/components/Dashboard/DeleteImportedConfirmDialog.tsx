import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import { LMUReplay } from '@types';

interface DeleteImportedConfirmDialogProps {
  open: boolean;
  targetLabel: string;
  replays: LMUReplay[];
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Gated harder than archive, because it is the one action in the app that
 * removes files. The exact file names are named rather than summarised — a
 * steward about to lose a race recording somebody sent them should be able to
 * see which one.
 */
export const DeleteImportedConfirmDialog: React.FC<
  DeleteImportedConfirmDialogProps
> = ({ open, targetLabel, replays, onCancel, onConfirm }) => (
  <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
    <DialogTitle>Delete {targetLabel} from disk?</DialogTitle>
    <DialogContent>
      <DialogContentText sx={{ mb: 2 }}>
        {replays.length === 1
          ? 'This permanently removes this replay and its result log'
          : `This permanently removes these ${replays.length} replays and their result logs`}{' '}
        from your Le Mans Ultimate installation. It cannot be undone.
      </DialogContentText>

      <List dense disablePadding>
        {replays.map((replay) => (
          <ListItem key={replay.hash} disableGutters>
            <ListItemText
              primary={replay.importVcrFileName ?? replay.replayName}
              secondary={replay.importLogFileName}
              slotProps={{
                primary: { variant: 'body2' },
                secondary: { variant: 'caption' },
              }}
            />
          </ListItem>
        ))}
      </List>

      <Alert severity="info" sx={{ mt: 2 }}>
        Only files LMU Steward imported are removed. A result log shared with
        another imported session is kept.
      </Alert>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button onClick={onConfirm} color="error" variant="contained">
        Delete from disk
      </Button>
    </DialogActions>
  </Dialog>
);
