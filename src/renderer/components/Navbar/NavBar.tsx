import React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import Container from '@mui/material/Container';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { CONSTANTS } from '@constants';
import { sendMessage } from '../../utils/postMessage';
import { getProfileInitials } from '../../utils/profileInitials';
import navLogoIcon from '../../../../assets/icons/48x48.png';
import { useNavbar } from '@/renderer/providers/NavbarContext';

export const NavBar = () => {
  const navigate = useNavigate();
  const [profileName, setProfileName] = useState('');
  const { isViewHeaderAttached } = useNavbar();

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
      sx={{ borderBottom: 1, borderColor: isViewHeaderAttached ? 'transparent' : 'divider', height: '64px' }}
    >
      <Container maxWidth={false}>
        <Toolbar disableGutters sx={{ minHeight: '64px !important', height: '64px' }}>
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
          <Box sx={{ flexGrow: 1 }} />
          <Box
            sx={{ display: 'flex', flexGrow: 0, alignItems: 'center', gap: 1 }}
          >
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
