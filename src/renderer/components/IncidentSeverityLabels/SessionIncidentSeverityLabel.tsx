import Typography from '@mui/material/Typography';
import { TypographyProps } from '@mui/material/Typography';

export const SessionIncidentSeverityLabel = ({
  scorePerDriver,
  totalIncidents,
  size = 'body1',
}: {
  scorePerDriver: number;
  totalIncidents: number;
  size?: TypographyProps['variant'];
}) => {
  if (scorePerDriver < 2) {
    return (
      <Typography
        variant={size}
        sx={{ fontWeight: '700', color: 'success.main' }}
      >
        Low ({totalIncidents})
      </Typography>
    );
  }
  if (scorePerDriver < 5) {
    return (
      <Typography
        variant={size}
        sx={{ fontWeight: '700', color: 'warning.main' }}
      >
        Med ({totalIncidents})
      </Typography>
    );
  }
  return (
    <Typography variant={size} sx={{ fontWeight: '700', color: 'error.main' }}>
      High ({totalIncidents})
    </Typography>
  );
};
