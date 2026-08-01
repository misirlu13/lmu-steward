import { Box, Card, CardContent, Typography } from '@mui/material';
import { CareerAggregate } from '@types';
import {
  formatCount,
  formatDate,
  formatDistance,
  formatHours,
} from './careerFormat';

interface CareerHeadlineProps {
  aggregate: CareerAggregate;
}

const Tile = ({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) => (
  <Card sx={{ flex: '1 1 150px', minWidth: 150 }}>
    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: 'block',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
        {value}
      </Typography>
      {detail ? (
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      ) : null}
    </CardContent>
  </Card>
);

export const CareerHeadline = ({ aggregate }: CareerHeadlineProps) => {
  const { headline, results } = aggregate;

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {headline.firstSessionAt
          ? `Racing since ${formatDate(headline.firstSessionAt)}`
          : 'No sessions recorded yet'}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {/*
          Sessions and races are shown side by side rather than as one number.
          Practice is 60% of a typical library and contributes laps and pace but
          never a result, so collapsing them would make every average unreadable.
        */}
        <Tile
          label="Sessions"
          value={formatCount(headline.sessions)}
          detail={`${formatCount(headline.races)} races · ${formatCount(headline.practice)} practice`}
        />
        <Tile
          label="Wins"
          value={formatCount(results.wins)}
          detail={`${formatCount(results.winsMultiplayer)} online · ${formatCount(results.winsRaceWeekend)} offline`}
        />
        <Tile
          label="Podiums"
          value={formatCount(results.podiums)}
          detail={`${formatCount(results.podiumsMultiplayer)} online · ${formatCount(results.podiumsRaceWeekend)} offline`}
        />
        <Tile
          label="Laps"
          value={formatCount(headline.lapsCompleted)}
          detail={`${formatCount(results.lapsLed)} led`}
        />
        <Tile label="Distance" value={formatDistance(headline.distanceKm)} />
        <Tile
          label="Time on track"
          value={formatHours(headline.timeOnTrackSec)}
        />
        <Tile
          label="Tracks"
          value={formatCount(headline.tracks)}
          detail={`${formatCount(headline.layouts)} layouts`}
        />
        <Tile
          label="Cars"
          value={formatCount(headline.cars)}
          detail={`${formatCount(headline.classes)} classes`}
        />
      </Box>
    </Box>
  );
};
