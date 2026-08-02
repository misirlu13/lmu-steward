import {
  Box,
  Card,
  CardContent,
  Divider,
  Tooltip,
  Typography,
} from '@mui/material';
import { CareerAggregate, CareerRival } from '@types';
import { formatDecimal, formatPercent } from './careerFormat';

interface CareerRivalsCardProps {
  aggregate: CareerAggregate;
}

const RivalList = ({
  title,
  rivals,
  metric,
  hint,
}: {
  title: string;
  rivals: CareerRival[];
  metric: (rival: CareerRival) => string;
  hint: string;
}) => {
  if (!rivals.length) {
    return null;
  }

  return (
    <Box sx={{ mt: 1 }}>
      <Tooltip title={hint} placement="top-start">
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
      </Tooltip>
      {rivals.slice(0, 5).map((rival) => (
        <Box
          key={rival.name}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            py: 0.25,
          }}
        >
          <Typography variant="body2" noWrap sx={{ pr: 1 }}>
            {rival.name}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {metric(rival)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
};

export const CareerRivalsCard = ({ aggregate }: CareerRivalsCardProps) => {
  const { rivals } = aggregate;

  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Field &amp; rivals
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            Average field
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatDecimal(rivals.averageFieldSize, 1)} cars
          </Typography>
        </Box>
        {/*
          Human share comes from ControlAndAids rather than isPlayer, which is
          what makes it meaningful — it is the difference between beating a grid
          of people and beating a grid of AI.
        */}
        <Tooltip
          title="Share of the grid that was human, read from each car's control mode"
          placement="left"
        >
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}
          >
            <Typography variant="body2" color="text.secondary">
              Human opposition
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatPercent(rivals.humanShare, 0)}
            </Typography>
          </Box>
        </Tooltip>

        <Divider sx={{ my: 1 }} />

        <RivalList
          title="Raced against most"
          rivals={rivals.mostRaced}
          metric={(rival) => `${rival.sessions}`}
          hint="Human drivers who have shared a session with you most often"
        />
        <RivalList
          title="Most contact with"
          rivals={rivals.nemeses}
          metric={(rival) => `${rival.contacts}`}
          hint="Who you have actually hit, from the incident reports naming you both"
        />

        {aggregate.events.byTitle.length ? (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary">
              Official events
            </Typography>
            {aggregate.events.byTitle.slice(0, 4).map((entry) => (
              <Box
                key={entry.title}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  py: 0.25,
                }}
              >
                <Typography variant="body2" noWrap sx={{ pr: 1 }}>
                  {entry.title}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {entry.sessions}
                </Typography>
              </Box>
            ))}
            {aggregate.events.averageSplit !== null ? (
              <Typography variant="caption" color="text.secondary">
                Average split {formatDecimal(aggregate.events.averageSplit, 1)}
              </Typography>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
};
