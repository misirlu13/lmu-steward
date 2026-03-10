import { Backdrop, Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';

interface ReplayProcessingSplashProps {
  open: boolean;
}

export const ReplayProcessingSplash: React.FC<ReplayProcessingSplashProps> = ({
  open,
}) => {
  return (
    <Backdrop
      open={open}
      sx={{
        zIndex: (theme) => theme.zIndex.modal + 2,
        backgroundColor: 'rgba(11, 18, 24, 0.82)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <Paper
        variant="outlined"
        sx={{
          width: '100%',
          maxWidth: 520,
          borderColor: 'divider',
          borderRadius: 2,
          px: 4,
          py: 3,
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={22} thickness={5} />
            <Typography variant="h6" fontWeight={700}>
              Processing replays, this may take a minute
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            LMU Steward is syncing and analyzing replay data. Please keep this window open.
          </Typography>
        </Stack>
      </Paper>
    </Backdrop>
  );
};
