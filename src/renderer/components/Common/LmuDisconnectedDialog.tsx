import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Backdrop,
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import SensorsOffRoundedIcon from '@mui/icons-material/SensorsOffRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { CONSTANTS } from '@constants';
import { sendMessage } from '../../utils/postMessage';
import { useNavigate } from 'react-router-dom';

const LMU_LAUNCH_COOLDOWN_MS = 10_000;

interface ApiResponse {
  status?: 'success' | 'error';
  message?: string;
  data?: {
    canceled?: boolean;
  };
}

interface LmuDisconnectedDialogProps {
  open: boolean;
}

export const LmuDisconnectedDialog: React.FC<LmuDisconnectedDialogProps> = ({
  open,
}) => {
  const navigate = useNavigate();
  const [isLaunching, setIsLaunching] = useState(false);
  const [isLaunchCooldownActive, setIsLaunchCooldownActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'error' | 'info'>('info');
  const launchCooldownTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribeLaunch = window.electron?.ipcRenderer.on(
      CONSTANTS.API.POST_LAUNCH_LMU,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as ApiResponse;
        setIsLaunching(false);

        if (response?.status === 'success') {
          if (launchCooldownTimeoutRef.current) {
            window.clearTimeout(launchCooldownTimeoutRef.current);
          }

          setIsLaunchCooldownActive(true);
          launchCooldownTimeoutRef.current = window.setTimeout(() => {
            setIsLaunchCooldownActive(false);
          }, LMU_LAUNCH_COOLDOWN_MS);

          setStatusTone('info');
          setStatusMessage('Launch request sent. Waiting for LMU to become available…');
          return;
        }

        setStatusTone('error');
        setStatusMessage(
          response?.message ||
            'Unable to launch LMU. Verify the executable path in settings.',
        );
      },
    );

    return () => {
      unsubscribeLaunch?.();
    };
  }, []);

  useEffect(() => {
    if (!open) {
      if (launchCooldownTimeoutRef.current) {
        window.clearTimeout(launchCooldownTimeoutRef.current);
        launchCooldownTimeoutRef.current = null;
      }

      setIsLaunching(false);
      setIsLaunchCooldownActive(false);
      setStatusMessage('');
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (launchCooldownTimeoutRef.current) {
        window.clearTimeout(launchCooldownTimeoutRef.current);
        launchCooldownTimeoutRef.current = null;
      }
    };
  }, []);

  const statusColor = useMemo(() => {
    return statusTone === 'error' ? 'error.main' : 'text.secondary';
  }, [statusTone]);

  const handleLaunchLmu = () => {
    setIsLaunching(true);
    setStatusMessage('');
    sendMessage(CONSTANTS.API.POST_LAUNCH_LMU);
  };

  const handleOpenSettings = () => {
    navigate('/user-settings');
  };

  return (
    <Backdrop
      open={open}
      sx={{
        zIndex: (theme) => theme.zIndex.modal + 1,
        backgroundColor: 'rgba(11, 18, 24, 0.85)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 540,
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
        <Stack spacing={2.5} sx={{ px: 4, py: 3.5, textAlign: 'center' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Box
              sx={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                border: '1px solid',
                borderColor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'primary.main',
                position: 'relative',
              }}
            >
              {isLaunching && (
                <CircularProgress
                  size={68}
                  thickness={2}
                  sx={{
                    position: 'absolute',
                    color: 'primary.main',
                  }}
                />
              )}
              <SensorsOffRoundedIcon fontSize="small" />
            </Box>
          </Box>

          <Box>
            <Typography variant="h5" fontWeight={700}>
              Waiting to connect to LMU
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1.5 }}>
              Searching for Le Mans Ultimate local session data. Start LMU and
              we&apos;ll connect automatically as soon as the API is available.
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1.5 }}>
              If launching LMU from here doesn&apos;t work, add the correct LMU
              executable path in the settings page and try again.
            </Typography>
          </Box>

          <Button
            fullWidth
            variant="contained"
            onClick={handleLaunchLmu}
            disabled={isLaunching || isLaunchCooldownActive}
          >
            Launch LMU
          </Button>

          <Link
            component="button"
            type="button"
            underline="hover"
            color="text.secondary"
            onClick={handleOpenSettings}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              alignSelf: 'center',
            }}
          >
            <SettingsRoundedIcon sx={{ fontSize: 16 }} />
            Open Settings
          </Link>

          {statusMessage ? (
            <Typography variant="body2" color={statusColor}>
              {statusMessage}
            </Typography>
          ) : null}
        </Stack>
        <Box
          sx={{
            px: 3,
            py: 1,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            bgcolor: 'background.alt',
          }}
        >
          <Typography variant="caption" sx={{ letterSpacing: 1.2 }} color="text.secondary">
            SERVICE STATUS
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: 'error.main',
              }}
            />
            <Typography variant="caption" color="error.main" fontWeight={700}>
              DISCONNECTED
            </Typography>
          </Stack>
        </Box>
      </Paper>
    </Backdrop>
  );
};
