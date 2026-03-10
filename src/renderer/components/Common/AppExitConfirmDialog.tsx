import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Stack,
} from '@mui/material';
import { CONSTANTS } from '@constants';
import { sendMessage } from '../../utils/postMessage';

interface ExitConfirmRequest {
  defaultCloseLmuWhenStewardExits?: boolean;
}

interface ExitConfirmReply {
  shouldExit: boolean;
  closeLmuWhenStewardExits: boolean;
  alwaysPerformAction: boolean;
}

export const AppExitConfirmDialog: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [defaultCloseLmuWhenStewardExits, setDefaultCloseLmuWhenStewardExits] =
    useState(false);
  const [alwaysPerformAction, setAlwaysPerformAction] = useState(false);

  const reply = (payload: ExitConfirmReply) => {
    sendMessage(CONSTANTS.API.REPLY_APP_EXIT_CONFIRM, payload);
  };

  const onCancel = () => {
    setOpen(false);
    reply({
      shouldExit: false,
      closeLmuWhenStewardExits: defaultCloseLmuWhenStewardExits,
      alwaysPerformAction: false,
    });
  };

  const onExitStewardOnly = () => {
    setOpen(false);
    reply({
      shouldExit: true,
      closeLmuWhenStewardExits: false,
      alwaysPerformAction,
    });
  };

  const onExitStewardAndLmu = () => {
    setOpen(false);
    reply({
      shouldExit: true,
      closeLmuWhenStewardExits: true,
      alwaysPerformAction,
    });
  };

  useEffect(() => {
    const unsubscribe = window.electron?.ipcRenderer.on(
      CONSTANTS.API.REQUEST_APP_EXIT_CONFIRM,
      (...args: unknown[]) => {
        const payload = (args[0] ?? {}) as ExitConfirmRequest;
        setDefaultCloseLmuWhenStewardExits(
          Boolean(payload?.defaultCloseLmuWhenStewardExits),
        );
        setAlwaysPerformAction(false);
        setOpen(true);
      },
    );

    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Exit LMU Steward</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Do you want to exit Le Mans Ultimate as well?
        </DialogContentText>
        <FormControlLabel
          sx={{ mt: 1 }}
          control={(
            <Checkbox
              checked={alwaysPerformAction}
              onChange={(_, checked) => setAlwaysPerformAction(checked)}
            />
          )}
          label="Always perform this action"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Stack direction="row" spacing={1}>
          <Button
            variant={defaultCloseLmuWhenStewardExits ? 'outlined' : 'contained'}
            onClick={onExitStewardOnly}
          >
            Exit Steward Only
          </Button>
          <Button
            variant={defaultCloseLmuWhenStewardExits ? 'contained' : 'outlined'}
            onClick={onExitStewardAndLmu}
          >
            Exit Steward + LMU
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};
