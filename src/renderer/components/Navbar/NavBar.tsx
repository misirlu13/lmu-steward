import React, { useEffect, useState } from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Avatar from '@mui/material/Avatar';
<<<<<<< HEAD
import Badge from '@mui/material/Badge';
import Tooltip from '@mui/material/Tooltip';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
=======
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { useLocation, useNavigate } from 'react-router-dom';
>>>>>>> feature/v1.5.0-update
import { CONSTANTS } from '@constants';
import { useNavbar } from '@/renderer/providers/NavbarContext';
import { sendMessage } from '../../utils/postMessage';
import { getProfileInitials } from '../../utils/profileInitials';
import navLogoIcon from '../../../../assets/icons/48x48.png';
<<<<<<< HEAD
import { useNavbar } from '@/renderer/providers/NavbarContext';
import { useApi } from '../../providers/ApiContext';
import { deriveLiveIndicator } from '../../hooks/useLiveIndicator';
=======
>>>>>>> feature/v1.5.0-update

export const NavBar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [profileName, setProfileName] = useState('');
  const { isViewHeaderAttached } = useNavbar();
  const { isConnected, hasApiStatusResponse, liveSessionStatus } = useApi();
  const liveIndicator = deriveLiveIndicator({
    isConnected,
    hasApiStatusResponse,
    liveSessionStatus,
  });

  useEffect(() => {
    const unsubscribeProfileInfo = window.electron?.ipcRenderer.on(
      CONSTANTS.API.GET_PROFILE_INFO,
      (...args: unknown[]) => {
        const response = (args[0] ?? {}) as {
          status?: string;
          data?: {
            profileInfo?: {
              name?: string;
            };
          };
        };

        if (response?.status !== 'success') {
          return;
        }

        const nextName = String(response?.data?.profileInfo?.name ?? '').trim();
        if (nextName) {
          setProfileName(nextName);
        }
      },
    );

    sendMessage(CONSTANTS.API.GET_PROFILE_INFO);

    return () => {
      unsubscribeProfileInfo?.();
    };
  }, []);

  return (
    <AppBar
      position="fixed"
      sx={{
        borderBottom: 1,
        borderColor: isViewHeaderAttached ? 'transparent' : 'divider',
        height: '64px',
      }}
    >
      <Container maxWidth={false}>
        <Toolbar
          disableGutters
          sx={{ minHeight: '64px !important', height: '64px' }}
        >
          <Box
            component="img"
            src={navLogoIcon}
            alt="LMU Steward logo"
            onClick={() => navigate('/')}
            sx={{
              display: 'flex',
              mr: 1,
              width: 48,
              height: 48,
              cursor: 'pointer',
            }}
          />
          <Typography
            variant="h6"
            noWrap
            component="button"
            onClick={() => navigate('/')}
            sx={{
              mr: 2,
              display: { md: 'flex' },
              background: 'transparent',
              border: 'none',
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '0',
              color: 'inherit',
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            LMU STEWARD
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
            <Button
              color="inherit"
              size="small"
              onClick={() => navigate('/')}
              sx={{ fontWeight: pathname === '/' ? 700 : 400 }}
            >
              Driver
            </Button>
            <Button
              color="inherit"
              size="small"
              onClick={() => navigate('/replays')}
              sx={{
                fontWeight: pathname.startsWith('/replay') ? 700 : 400,
              }}
            >
              Replays
            </Button>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            sx={{ display: 'flex', flexGrow: 0, alignItems: 'center', gap: 1 }}
          >
            <Tooltip
              title={
                liveIndicator.detail
                  ? `${liveIndicator.label} — ${liveIndicator.detail}`
                  : liveIndicator.label
              }
            >
              <IconButton
                color="inherit"
                onClick={() => navigate('/live')}
                aria-label={`Open live session (${liveIndicator.label})`}
                sx={{
                  color:
                    liveIndicator.state === 'live' ? 'success.main' : 'inherit',
                  opacity: liveIndicator.state === 'unavailable' ? 0.4 : 1,
                  transition: 'color 200ms ease, opacity 200ms ease',
                  ...(liveIndicator.state === 'live'
                    ? {
                        animation: 'lmu-live-pulse 1.8s ease-in-out infinite',
                        '@keyframes lmu-live-pulse': {
                          '0%, 100%': { opacity: 1 },
                          '50%': { opacity: 0.45 },
                        },
                      }
                    : {}),
                }}
              >
                <Badge
                  variant="dot"
                  color="success"
                  invisible={liveIndicator.state !== 'live'}
                  overlap="circular"
                >
                  <SensorsRoundedIcon />
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title="User Settings">
              <IconButton
                color="inherit"
                onClick={() => navigate('/user-settings')}
                aria-label="Open user settings"
              >
                <SettingsRoundedIcon />
              </IconButton>
            </Tooltip>
            <Avatar sx={{ width: 32, height: 32, fontSize: '1rem' }}>
              {getProfileInitials(profileName)}
            </Avatar>
          </Box>
        </Toolbar>
      </Container>
    </AppBar>
  );
};
