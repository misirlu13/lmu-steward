import { Stack, Typography } from '@mui/material';
import React from 'react';

interface UserSettingsAutosaveStatusProps {
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  autosaveError: string;
}

export const UserSettingsAutosaveStatus: React.FC<
  UserSettingsAutosaveStatusProps
> = ({ autosaveStatus, autosaveError }) => {
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <Typography variant="caption" color="text.secondary">
        Some changes will save automatically
      </Typography>
      {autosaveStatus === 'saving' ? (
        <Typography variant="caption" color="text.secondary">
          Saving…
        </Typography>
      ) : null}
      {autosaveStatus === 'saved' ? (
        <Typography variant="caption" color="success.main">
          Auto save complete
        </Typography>
      ) : null}
      {autosaveStatus === 'failed' ? (
        <Typography variant="caption" color="error.main">
          {autosaveError || 'Unable to auto-save settings.'}
        </Typography>
      ) : null}
    </Stack>
  );
};
