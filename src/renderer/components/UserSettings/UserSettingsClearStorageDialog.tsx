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
import { LocalDataSummary } from '@types';
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
  localDataSummary: LocalDataSummary | null;
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
  localDataSummary,
}) => {
  const hasImports = importedReplayCount > 0;
  const decisionCount = localDataSummary?.stewardDecisionCount ?? 0;
  const liveSessionCount = localDataSummary?.liveSessionCount ?? 0;
  const traceCount = localDataSummary?.liveTraceCount ?? 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Clear Local Storage?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This removes LMU Steward data stored on this device and resets
          settings to their defaults. This action cannot be undone.
        </DialogContentText>

        {/*
          🛑 Decisions are the one thing clearing destroys that exists nowhere
          else and leaves nothing behind. An imported replay's files remain on
          disk; a deleted decision is simply gone, with its reasoning and its
          revision history. Retention deliberately never touches them, which
          makes it all the more important that the one action which does says so
          — by name, and with a count.

          It cannot offer to export them first: decisions travel inside a
          per-replay session export and there is no bulk one, so a user with
          calls spread across forty replays has no practical escape hatch. The
          warning is the only safeguard, so it is blunt rather than reassuring.
        */}
        {decisionCount > 0 ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            This permanently deletes {decisionCount} steward{' '}
            {decisionCount === 1 ? 'decision' : 'decisions'}, including the
            reasoning and revision history behind{' '}
            {decisionCount === 1 ? 'it' : 'them'}. They exist nowhere else and
            cannot be exported first.
          </Alert>
        ) : null}

        {liveSessionCount > 0 ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            It also removes {liveSessionCount} captured live{' '}
            {liveSessionCount === 1 ? 'session' : 'sessions'}
            {traceCount
              ? `, including ${traceCount} recorded telemetry ${
                  traceCount === 1 ? 'trace' : 'traces'
                } that a replay cannot rebuild`
              : ''}
            .
          </Alert>
        ) : null}

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
