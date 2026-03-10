import Typography from '@mui/material/Typography';

export const DriverIncidentSeverityLabel = ({
  scorePerLap,
  totalIncidents,
}: {
  scorePerLap: number;
  totalIncidents: number;
}) => {
  if (scorePerLap < 0.5) {
     return(
      <Typography variant="body1" sx={{ fontWeight: '700', color: 'success.main' }}>
        Low ({totalIncidents})
      </Typography>
     );
  }
  if (scorePerLap < 1.5) {
    return (
      <Typography variant="body1" sx={{ fontWeight: '700', color: 'warning.main' }}>
        Med ({totalIncidents})
      </Typography>
    );
  }
  return (
    <Typography variant="body1" sx={{ fontWeight: '700', color: 'error.main' }}>
      High ({totalIncidents})
    </Typography>
  );
};
