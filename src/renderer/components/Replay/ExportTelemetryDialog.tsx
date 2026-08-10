import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
} from '@mui/material';
import React from 'react';

interface Props {
  open: boolean;
  /** How many incidents in the linked capture carry a trace. */
  traceCount: number;
  includeTelemetry: boolean;
  onIncludeTelemetryChange: (includeTelemetry: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Asks whether captured telemetry travels with an export.
 *
 * A session export already carries driver names and Steam IDs. Trace windows go
 * further: they are per-driver throttle, brake and steering inputs, which is
 * telemetry a driver may not expect a third party to redistribute. So the
 * choice is visible and opt-in rather than a silent default, and the archive
 * records which way it went.
 *
 * Derived evidence — closing speeds, off-track, blue-flag duration — always
 * travels. It is a summary rather than a recording, and it is most of what
 * makes an incident adjudicable on the receiving side.
 */
export const ExportTelemetryDialog: React.FC<Props> = ({
  open,
  traceCount,
  includeTelemetry,
  onIncludeTelemetryChange,
  onCancel,
  onConfirm,
}) => (
  <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
    <DialogTitle>Include captured telemetry?</DialogTitle>
    <DialogContent>
      <DialogContentText>
        This replay has a captured session with {traceCount} recorded{' '}
        {traceCount === 1 ? 'trace' : 'traces'}. Closing speeds, off-track
        findings and the other derived evidence travel with the export either
        way.
      </DialogContentText>

      <FormControlLabel
        sx={{ mt: 2 }}
        control={
          <Checkbox
            checked={includeTelemetry}
            onChange={(_, checked) => onIncludeTelemetryChange(checked)}
          />
        }
        label={
          includeTelemetry
            ? 'Include the recorded traces'
            : 'Leave the recorded traces out'
        }
      />

      {includeTelemetry ? (
        <Alert severity="warning" sx={{ mt: 2 }}>
          Traces are each driver&apos;s throttle, brake and steering inputs
          through the incident. Only share them with someone entitled to see
          them — a league steward reviewing a protest, not a public archive.
        </Alert>
      ) : null}
    </DialogContent>
    <DialogActions>
      <Button onClick={onCancel}>Cancel</Button>
      <Button variant="contained" onClick={onConfirm}>
        Export
      </Button>
    </DialogActions>
  </Dialog>
);
