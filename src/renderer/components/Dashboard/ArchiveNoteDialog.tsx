import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

interface ArchiveNoteDialogProps {
  open: boolean;
  /** Existing note, if the replay already has one. */
  initialNote: string;
  /**
   * Which list the note will show up in. Imported replays keep their note on
   * the imported record rather than in the archive store, so naming the wrong
   * view here would send the user looking in the wrong place.
   */
  viewLabel?: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}

export const ArchiveNoteDialog: React.FC<ArchiveNoteDialogProps> = ({
  open,
  initialNote,
  viewLabel = 'Archived',
  onCancel,
  onSave,
}) => {
  const [note, setNote] = useState(initialNote);

  useEffect(() => {
    if (open) {
      setNote(initialNote);
    }
  }, [open, initialNote]);

  const hasExistingNote = initialNote.trim().length > 0;

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>{hasExistingNote ? 'Edit note' : 'Add note'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Shown on this replay in the {viewLabel} view. Saving an empty note
          removes it.
        </Typography>
        <TextField
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Reviewed, no action needed"
          multiline
          minRows={3}
          fullWidth
          autoFocus
          size="small"
          slotProps={{ htmlInput: { 'aria-label': 'Replay note' } }}
        />
      </DialogContent>
      <DialogActions>
        {hasExistingNote ? (
          <Button onClick={() => onSave('')} color="inherit">
            Clear note
          </Button>
        ) : null}
        <Button onClick={onCancel} color="inherit">
          Cancel
        </Button>
        <Button onClick={() => onSave(note)} variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
