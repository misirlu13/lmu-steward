import {
  Box,
  Card,
  CardContent,
  Divider,
  Tooltip,
  Typography,
} from '@mui/material';
import { CareerAggregate } from '@types';
import { formatCount, formatDecimal } from './careerFormat';

interface CareerDisciplineCardProps {
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

export const CareerDisciplineCard = ({
  aggregate,
}: CareerDisciplineCardProps) => {
  const { discipline } = aggregate;
  const topReasons = discipline.penaltiesByReason.slice(0, 5);
  const peak = topReasons.length
    ? Math.max(...topReasons.map((entry) => entry.count))
    : 0;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Discipline
        </Typography>

        {/*
          Per 100 km rather than per race. A ten-lap sprint and a six-hour stint
          are not comparable, and a raw count only says who drives the most.
        */}
        <Row
          label="Incidents per 100 km"
          value={formatDecimal(discipline.incidentsPer100Km, 2)}
          hint="The fair denominator — a raw count only measures how much you drive"
        />
        <Row
          label="Incidents"
          value={formatCount(discipline.incidentsCaused)}
          hint={`${discipline.contactWithVehicle} with cars · ${discipline.contactWithScenery} with scenery`}
        />
        <Row
          label="Worst impact"
          value={formatDecimal(discipline.worstImpactForce, 0)}
        />

        <Divider sx={{ my: 1 }} />

        <Row label="Penalties" value={formatCount(discipline.penalties)} />
        <Row
          label="Track limit warnings"
          value={formatCount(discipline.trackLimitWarnings)}
          hint="Everything the stewards acted on — not counting no further action"
        />
        <Row
          label="Invalidated laps"
          value={formatCount(discipline.trackLimitInvalidLaps)}
        />
        <Row
          label="Longest clean streak"
          value={`${formatCount(discipline.longestCleanStreak)} sessions`}
          hint="Consecutive sessions with no incident and no penalty"
        />

        {topReasons.length ? (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Penalties by reason
            </Typography>
            {topReasons.map((entry) => (
              <Box key={entry.reason} sx={{ mt: 0.75 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" noWrap sx={{ pr: 1 }}>
                    {entry.reason}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {entry.count}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    height: 4,
                    mt: 0.25,
                    borderRadius: 2,
                    backgroundColor: 'background.alt',
                  }}
                >
                  <Box
                    sx={{
                      height: '100%',
                      width: `${peak ? (entry.count / peak) * 100 : 0}%`,
                      borderRadius: 2,
                      backgroundColor: 'warning.main',
                    }}
                  />
                </Box>
              </Box>
            ))}
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
};
