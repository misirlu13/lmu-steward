import {
  Box,
  Card,
  CardContent,
  Divider,
  Tooltip,
  Typography,
} from '@mui/material';
import { CareerAggregate, CareerTrackSummary } from '@types';
import { formatDecimal, formatLapTime, formatPercent } from './careerFormat';

interface CareerPaceCardProps {
  aggregate: CareerAggregate;
}

const Row = ({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) => {
  const content = (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        py: 0.5,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );

  return hint ? (
    <Tooltip title={hint} placement="left">
      {content}
    </Tooltip>
  ) : (
    content
  );
};

const LayoutPace = ({
  title,
  layouts,
  hint,
}: {
  title: string;
  layouts: CareerTrackSummary[];
  hint: string;
}) => {
  if (!layouts.length) {
    return null;
  }

  return (
    <Box sx={{ mt: 1.5 }}>
      <Tooltip title={hint} placement="top-start">
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
      </Tooltip>
      {layouts.map((layout) => (
        <Box
          key={`${layout.trackFolder}|${layout.trackLayout}`}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            py: 0.25,
          }}
        >
          <Typography variant="body2" noWrap sx={{ pr: 1 }}>
            {layout.trackVenue || layout.trackFolder}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatPercent(layout.averageGapToSessionBest, 1)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

export const CareerPaceCard = ({ aggregate }: CareerPaceCardProps) => {
  const { pace } = aggregate;
  const trend =
    pace.averageGapToSessionBest !== null &&
    pace.recentGapToSessionBest !== null
      ? pace.recentGapToSessionBest - pace.averageGapToSessionBest
      : null;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Pace
        </Typography>

        {/*
          The headline pace figure, and deliberately not a personal best. A PB
          says how quick the car and track are; this says how close to the pace
          the driver was, and survives a change of both.
        */}
        <Row
          label="Gap to session best"
          value={formatPercent(pace.averageGapToSessionBest, 2)}
          hint="Your best lap against the quickest lap anyone set in the same session, averaged"
        />
        <Row
          label="Recent form"
          value={formatPercent(pace.recentGapToSessionBest, 2)}
          hint="The same figure over your last 25 sessions"
        />
        <Row
          label="Trend"
          value={
            trend === null
              ? '—'
              : `${trend <= 0 ? '' : '+'}${(trend * 100).toFixed(2)}pp`
          }
          hint="Recent form against your career average. Negative is closer to the pace."
        />

        <Divider sx={{ my: 1 }} />

        <Row
          label="Qualifying consistency"
          value={
            pace.averageConsistencySec === null
              ? '—'
              : `±${formatDecimal(pace.averageConsistencySec, 2)}s`
          }
          hint="Spread of your lap times in qualifying. Race laps carry pit stops and safety cars, so they measure the session rather than the driver."
        />
        <Row
          label="Top speed"
          value={
            pace.topSpeedKph === null
              ? '—'
              : `${formatDecimal(pace.topSpeedKph, 1)} kph`
          }
        />

        <LayoutPace
          title="Closest to the pace"
          layouts={pace.strongestLayouts}
          hint="Layouts where your best lap sits nearest the session's quickest. Needs three timed sessions."
        />
        <LayoutPace
          title="Furthest off the pace"
          layouts={pace.weakestLayouts}
          hint="Where the most time is on the table"
        />

        {aggregate.tracks.some((track) => track.theoreticalBestSec) ? (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Best lap vs. theoretical
            </Typography>
            {aggregate.tracks
              .filter((track) => track.bestLapSec && track.theoreticalBestSec)
              .slice(0, 4)
              .map((track) => (
                <Box
                  key={`${track.trackFolder}|${track.trackLayout}`}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    py: 0.25,
                  }}
                >
                  <Typography variant="caption" noWrap sx={{ pr: 1 }}>
                    {track.trackVenue || track.trackFolder}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {formatLapTime(track.bestLapSec)}
                    <Typography
                      component="span"
                      variant="caption"
                      color="text.secondary"
                    >
                      {' '}
                      / {formatLapTime(track.theoreticalBestSec)}
                    </Typography>
                  </Typography>
                </Box>
              ))}
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
};
