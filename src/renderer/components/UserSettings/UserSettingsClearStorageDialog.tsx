import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import React from 'react';

interface UserSettingsClearStorageDialogProps {
  open: boolean;
  isClearingLocalStorage: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const UserSettingsClearStorageDialog: React.FC<
  UserSettingsClearStorageDialogProps
> = ({ open, isClearingLocalStorage, onClose, onConfirm }) => {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Clear Local Storage?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This removes LMU Steward data stored on this device and resets settings
          to their defaults. This action cannot be undone.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isClearingLocalStorage}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={onConfirm}
          disabled={isClearingLocalStorage}
        >
          {isClearingLocalStorage ? 'Clearing…' : 'Clear Local Storage'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
