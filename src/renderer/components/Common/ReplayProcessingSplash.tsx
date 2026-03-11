import {
  Backdrop,
  Box,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

interface ReplayProcessingSplashProps {
  open: boolean;
  progressPercentage: number;
  processedCount: number;
  totalCount: number;
}

export const ReplayProcessingSplash: React.FC<ReplayProcessingSplashProps> = ({
  open,
  progressPercentage,
  processedCount,
  totalCount,
}) => {
  const normalizedPercentage = Math.max(0, Math.min(1, progressPercentage || 0));
  const progressPercentLabel = Math.round(normalizedPercentage * 100);

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
          <Stack spacing={0.75}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {totalCount > 0
                  ? `${Math.min(processedCount, totalCount)} / ${totalCount} replays`
                  : 'Preparing replay sync'}
              </Typography>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                {`${progressPercentLabel}%`}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progressPercentLabel}
              sx={{
                height: 8,
                borderRadius: 999,
              }}
            />
          </Stack>
        </Stack>
      </Paper>
    </Backdrop>
  );
};
