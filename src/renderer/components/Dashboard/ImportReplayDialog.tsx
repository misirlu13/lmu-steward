import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import {
  ImportFileSelection,
  ImportPairValidationState,
} from '../../providers/ApiContext';

interface ImportReplayDialogProps {
  open: boolean;
  replayFile: ImportFileSelection | null;
  logFile: ImportFileSelection | null;
  validation: ImportPairValidationState | null;
  isImporting: boolean;
  errorMessage: string;
  onChooseReplay: () => void;
  onChooseLog: () => void;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}

const formatDriverCount = (count: number | undefined): string =>
  count === undefined ? '' : `${count} ${count === 1 ? 'driver' : 'drivers'}`;

interface FilePickerRowProps {
  label: string;
  hint: string;
  selection: ImportFileSelection | null;
  buttonLabel: string;
  onChoose: () => void;
  disabled: boolean;
}

const FilePickerRow: React.FC<FilePickerRowProps> = ({
  label,
  hint,
  selection,
  buttonLabel,
  onChoose,
  disabled,
}) => (
  <Box
    sx={{
      border: '1px solid',
      borderColor: 'divider',
      borderRadius: 1,
      p: 2,
    }}
  >
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      spacing={2}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          {label}
        </Typography>
        {selection ? (
          <>
            <Typography
              variant="body2"
              sx={{ wordBreak: 'break-all' }}
              title={selection.filePath}
            >
              {selection.fileName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {[
                selection.session,
                selection.trackVenue ?? selection.trackFolder,
                formatDriverCount(selection.driverCount),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </Box>
      <Button
        onClick={onChoose}
        variant="outlined"
        size="small"
        disabled={disabled}
        startIcon={<InsertDriveFileOutlinedIcon />}
        sx={{ flexShrink: 0 }}
      >
        {selection ? 'Change' : buttonLabel}
      </Button>
    </Stack>
  </Box>
);

/**
 * Both files are chosen by the user, so nothing is proposed here — but the
 * pairing is still checked. A hand-off routinely holds several logs from one
 * track on one evening, and the neighbouring event's log is the easiest wrong
 * pick there is; taking it would attach every incident and lap from a different
 * race to this replay.
 *
 * Warnings are shown and overridable. Errors are not: a session-type mismatch
 * or a log with no date cannot produce a correct import at all.
 */
export const ImportReplayDialog: React.FC<ImportReplayDialogProps> = ({
  open,
  replayFile,
  logFile,
  validation,
  isImporting,
  errorMessage,
  onChooseReplay,
  onChooseLog,
  onCancel,
  onConfirm,
}) => {
  const [note, setNote] = useState('');
  const hasBothFiles = Boolean(replayFile && logFile);
  const canImport = hasBothFiles && validation?.canImport !== false;

  // Cleared when the dialog closes, so the next import does not inherit the
  // last one's note.
  useEffect(() => {
    if (!open) {
      setNote('');
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Import a Replay</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Both files are required. LMU stores a replay&apos;s date on the file
          itself, which is lost when it is copied from another PC — the result
          log is what tells LMU Steward when the session actually happened.
        </DialogContentText>

        <Stack spacing={1.5}>
          <FilePickerRow
            label="Replay file"
            hint="The .Vcr file recorded on the other PC."
            selection={replayFile}
            buttonLabel="Choose .Vcr"
            onChoose={onChooseReplay}
            disabled={isImporting}
          />
          <FilePickerRow
            label="Result log"
            hint="The .xml result log for the same session."
            selection={logFile}
            buttonLabel="Choose .xml"
            onChoose={onChooseLog}
            disabled={isImporting}
          />
        </Stack>

        <Box sx={{ mt: 2 }}>
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Protest 12 — sent by Team Foxtrot, contact on lap 7"
            helperText="Where this came from and why you have it. Shown on the replay in the Imported view."
            multiline
            minRows={2}
            fullWidth
            size="small"
            disabled={isImporting}
            slotProps={{ htmlInput: { 'aria-label': 'Import note' } }}
          />
        </Box>

        {errorMessage ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {errorMessage}
          </Alert>
        ) : null}

        {validation?.issues.map((issue) => (
          <Alert
            key={issue.code}
            severity={issue.severity === 'error' ? 'error' : 'warning'}
            sx={{ mt: 2 }}
          >
            {issue.message}
          </Alert>
        ))}

        {hasBothFiles &&
        validation &&
        validation.issues.length === 0 &&
        validation.rosterOverlap ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            {validation.rosterOverlap.intersection} of{' '}
            {validation.rosterOverlap.vcrCount} drivers in this replay appear in
            the log.
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isImporting}>
          Cancel
        </Button>
        <Button
          onClick={() => onConfirm(note)}
          variant="contained"
          disabled={!canImport || isImporting}
        >
          {isImporting ? 'Importing…' : 'Import Replay'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
