import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import React from 'react';

interface UserSettingsReplaySyncDefaultsDialogProps {
  open: boolean;
  willResetReplayCache: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const UserSettingsReplaySyncDefaultsDialog: React.FC<
  UserSettingsReplaySyncDefaultsDialogProps
> = ({ open, willResetReplayCache, onClose, onConfirm }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Return Replay Sync Settings to Defaults?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This will restore the Replay Sync settings to their default values.
        </DialogContentText>
        <Stack spacing={0.5} sx={{ mt: 1.5 }}>
          <Typography variant="body2">Automatic Sync: Enabled</Typography>
          <Typography variant="body2">Sync on App Launch: Enabled</Typography>
          <Typography variant="body2">Quick View Mode: Disabled</Typography>
          <Typography variant="body2">Sync Interval: 5 minutes</Typography>
          <Typography variant="body2">Log Match Window: 2 minutes</Typography>
        </Stack>
        {willResetReplayCache ? (
          <DialogContentText sx={{ mt: 1.5 }} color="warning.main">
            Because the Log Match Window will change, replay cache reset will be
            scheduled for the next replay sync.
          </DialogContentText>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onConfirm}>
          Return to Defaults
        </Button>
      </DialogActions>
    </Dialog>
  );
};
