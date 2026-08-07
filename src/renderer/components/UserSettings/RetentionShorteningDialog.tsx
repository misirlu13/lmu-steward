import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import React from 'react';
import { LiveRetentionPreview } from '@types';

interface Props {
  open: boolean;
  /** The window being moved to, in days. */
  retentionDays: number | null;
  preview: LiveRetentionPreview | null;
  isLoading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const formatDate = (value: number | null): string =>
  value ? new Date(value).toLocaleDateString() : '';

const windowLabel = (days: number | null): string =>
  days === null ? 'never delete' : `${days} days`;

/**
 * Confirms a retention change that destroys data.
 *
 * Changing 90 days to 7 can remove months of evidence on the next write, and a
 * settings dropdown is not where anyone expects to destroy anything. So the
 * summary names what will go — how many sessions, over what dates, at which
 * tracks — rather than relying on a generic "cannot be undone" that a user
 * cannot evaluate.
 *
 * Lengthening the window never reaches this: it takes nothing away.
 */
export const RetentionShorteningDialog: React.FC<Props> = ({
  open,
  retentionDays,
  preview,
  isLoading,
  onCancel,
  onConfirm,
}) => {
  const sessionCount = preview?.sessionCount ?? 0;

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Delete captured sessions older than this?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Keeping captured live sessions for {windowLabel(retentionDays)} takes
          effect immediately.
        </DialogContentText>

        {isLoading ? (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ mt: 2 }}
          >
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Working out what would be removed…
            </Typography>
          </Stack>
        ) : null}

        {!isLoading && sessionCount > 0 ? (
          <>
            <Alert severity="warning" sx={{ mt: 2 }}>
              This removes {sessionCount} captured{' '}
              {sessionCount === 1 ? 'session' : 'sessions'}
              {preview?.incidentCount
                ? ` and ${preview.incidentCount} recorded incidents`
                : ''}
              {preview?.oldestAt && preview?.newestAt
                ? `, from ${formatDate(preview.oldestAt)} to ${formatDate(
                    preview.newestAt,
                  )}`
                : ''}
              .
            </Alert>

            {preview?.trackNames.length ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mt: 1 }}
              >
                Tracks: {preview.trackNames.join(', ')}
              </Typography>
            ) : null}

            {/*
              The traces are the part that cannot come back. Incidents and
              standings can be rebuilt from a session's XML; closing speeds and
              the seconds before a contact cannot.
            */}
            <Alert severity="info" sx={{ mt: 2 }}>
              Recorded telemetry cannot be rebuilt from a replay. Steward
              decisions are never deleted and will be kept.
            </Alert>
          </>
        ) : null}

        {!isLoading && sessionCount === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Nothing captured so far is old enough to be removed by this setting.
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          color={sessionCount > 0 ? 'error' : 'primary'}
          variant="contained"
          onClick={onConfirm}
          disabled={isLoading}
        >
          {sessionCount > 0
            ? `Delete ${sessionCount} ${sessionCount === 1 ? 'Session' : 'Sessions'}`
            : 'Save Setting'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
