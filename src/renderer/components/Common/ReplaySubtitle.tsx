import { Box, Typography } from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';

export const ReplaySubtitle: React.FC<{
  timestamp: number | string | undefined;
  location?: string;
}> = ({ timestamp, location }) => {
  const _ts = Number(timestamp);
  const _date = new Date(isNaN(_ts) ? 0 : _ts < 1e12 ? _ts * 1000 : _ts);
  const localizedDate = _date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          flexDirection: 'row',
          gap: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <LocationOnIcon
            sx={{
              width: '16px',
              height: '16px',
              color: 'text.secondary',
            }}
          />
          <Typography color="text.secondary" variant="body2">
            {location}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <CalendarMonthIcon
            sx={{
              width: '16px',
              height: '16px',
              color: 'text.secondary',
            }}
          />
          <Typography color="text.secondary" variant="body2">
            {localizedDate}
          </Typography>
        </Box>
      </Box>
    </>
  );
};
