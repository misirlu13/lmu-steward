import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import React from 'react';

interface UserSettingsReplayThresholdDialogProps {
  open: boolean;
  nextThresholdMinutes: number;
  onClose: () => void;
  onConfirm: () => void;
}

export const UserSettingsReplayThresholdDialog: React.FC<
  UserSettingsReplayThresholdDialogProps
> = ({ open, nextThresholdMinutes, onClose, onConfirm }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Reprocess Replay Data?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Changing the replay log match threshold to {nextThresholdMinutes} minute
          {nextThresholdMinutes === 1 ? '' : 's'} will clear the cached replay mappings
          and trigger a full replay re-sync. This can take a while depending on how
          many replays you have.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="warning" onClick={onConfirm}>
          Reprocess Replays
        </Button>
      </DialogActions>
    </Dialog>
  );
};
