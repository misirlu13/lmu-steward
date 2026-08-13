import {
  Box,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { CareerAggregate } from '@types';
import {
  formatDistance,
  formatFieldPercentile,
  formatLapTime,
} from './careerFormat';

interface CareerCarsCardProps {
  aggregate: CareerAggregate;
}

/** A car needs this many races before its finish percentile is worth ranking. */
const MIN_RACES_FOR_CAR_RANKING = 3;

export const CareerCarsCard = ({ aggregate }: CareerCarsCardProps) => {
  const { cars } = aggregate;
  const ranked = cars.filter(
    (car) =>
      car.races >= MIN_RACES_FOR_CAR_RANKING &&
      car.averageFinishPercentile !== null,
  );
  const best = ranked.length
    ? ranked.reduce((winner, car) =>
        (car.averageFinishPercentile ?? 1) <
        (winner.averageFinishPercentile ?? 1)
          ? car
          : winner,
      )
    : null;
  const mostDriven = cars[0] ?? null;

  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            mb: 1,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Cars &amp; classes
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {mostDriven ? (
              <Chip
                size="small"
                variant="outlined"
                label={`Most driven: ${mostDriven.carType}`}
              />
            ) : null}
            {best ? (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`Best results: ${best.carType}`}
              />
            ) : null}
          </Box>
        </Box>

        {cars.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No cars recorded yet.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Car</TableCell>
                  <TableCell>Class</TableCell>
                  <TableCell align="right">Sessions</TableCell>
                  <TableCell align="right">Races</TableCell>
                  <TableCell align="right">Wins</TableCell>
                  <TableCell align="right">Podiums</TableCell>
                  <TableCell align="right">Distance</TableCell>
                  <TableCell align="right">PB lap</TableCell>
                  <Tooltip
                    title="Average finish as a share of the class field. Needs three races."
                    placement="top"
                  >
                    <TableCell align="right">Field position</TableCell>
                  </Tooltip>
                </TableRow>
              </TableHead>
              <TableBody>
                {cars.map((car) => (
                  <TableRow key={`${car.carType}|${car.carClass}`} hover>
                    <TableCell>{car.carType}</TableCell>
                    <TableCell>{car.carClass}</TableCell>
                    <TableCell align="right">{car.sessions}</TableCell>
                    <TableCell align="right">{car.races}</TableCell>
                    <TableCell align="right">{car.wins}</TableCell>
                    <TableCell align="right">{car.podiums}</TableCell>
                    <TableCell align="right">
                      {formatDistance(car.distanceKm)}
                    </TableCell>
                    <TableCell align="right">
                      {formatLapTime(car.bestLapSec)}
                    </TableCell>
                    <TableCell align="right">
                      {car.races >= MIN_RACES_FOR_CAR_RANKING
                        ? formatFieldPercentile(car.averageFinishPercentile)
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
