import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material';
import { LiveSessionSummary } from '@types';

interface Props {
  session: LiveSessionSummary | null;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Gated because this is unrecoverable in a way the replay lists are not.
 *
 * Incidents and standings can be rebuilt from a session's XML, but derived
 * evidence and the trace windows exist nowhere else — deleting them destroys
 * the only record of what a car was doing in the seconds before a contact. The
 * counts are named rather than summarised so the size of that is visible before
 * the click, not after.
 */
export const DeleteCapturedSessionDialog: React.FC<Props> = ({
  session,
  onCancel,
  onConfirm,
}) => (
  <Dialog open={Boolean(session)} onClose={onCancel} maxWidth="sm" fullWidth>
    <DialogTitle>Delete this captured session?</DialogTitle>
    <DialogContent>
      <DialogContentText sx={{ mb: 2 }}>
        {session?.trackName || 'Unknown track'} —{' '}
        {session?.sessionType ?? 'Session'},{' '}
        {session ? new Date(session.startedAt).toLocaleString() : ''}
      </DialogContentText>

      <DialogContentText sx={{ mb: 2 }}>
        This permanently removes {session?.incidentCount ?? 0} captured incident
        {session?.incidentCount === 1 ? '' : 's'}
        {session?.evidenceCount
          ? `, including ${session.evidenceCount} with recorded traces`
          : ''}
        . It cannot be undone.
      </DialogContentText>

      {session?.evidenceCount ? (
        <Alert severity="warning">
          Traces cannot be rebuilt from a replay. Deleting them loses the only
          record of what these cars were doing before each contact.
        </Alert>
      ) : null}

      <Alert severity="info" sx={{ mt: 2 }}>
        Steward decisions are never deleted, and any made against this session
        are kept.
      </Alert>
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button color="error" variant="contained" onClick={onConfirm}>
        Delete Session
      </Button>
    </DialogActions>
  </Dialog>
);
