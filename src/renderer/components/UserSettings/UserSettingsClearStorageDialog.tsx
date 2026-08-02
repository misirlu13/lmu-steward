import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import React from 'react';
import { formatFileSize } from '../../utils/importedReplays';

interface UserSettingsClearStorageDialogProps {
  open: boolean;
  isClearingLocalStorage: boolean;
  importedReplayCount: number;
  importedReplayBytes: number;
  deleteImportedFiles: boolean;
  onDeleteImportedFilesChange: (deleteImportedFiles: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export const UserSettingsClearStorageDialog: React.FC<
  UserSettingsClearStorageDialogProps
> = ({
  open,
  isClearingLocalStorage,
  importedReplayCount,
  importedReplayBytes,
  deleteImportedFiles,
  onDeleteImportedFilesChange,
  onClose,
  onConfirm,
}) => {
  const hasImports = importedReplayCount > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Clear Local Storage?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This removes LMU Steward data stored on this device and resets
          settings to their defaults. This action cannot be undone.
        </DialogContentText>

        {/*
          Clearing storage drops the records of what was imported, so the files
          themselves would be left behind with nothing able to find them. The
          user has to be told, and given the chance to remove them first.
        */}
        {hasImports ? (
          <>
            <Alert severity="warning" sx={{ mt: 2 }}>
              You have {importedReplayCount} imported{' '}
              {importedReplayCount === 1 ? 'replay' : 'replays'} taking up about{' '}
              {formatFileSize(importedReplayBytes)} in your Le Mans Ultimate
              installation. Clearing storage forgets them.
            </Alert>
            <FormControlLabel
              sx={{ mt: 1 }}
              control={
                <Checkbox
                  checked={deleteImportedFiles}
                  onChange={(_, checked) =>
                    onDeleteImportedFilesChange(checked)
                  }
                  disabled={isClearingLocalStorage}
                />
              }
              label={
                deleteImportedFiles
                  ? 'Delete the imported replay and log files too'
                  : 'Keep the files — you will need to remove them by hand'
              }
            />
          </>
        ) : null}
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
