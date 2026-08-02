import { Box, Card, CardContent, Typography } from '@mui/material';
import { CareerAggregate } from '@types';
import { formatDate } from './careerFormat';

interface CareerMilestonesProps {
  aggregate: CareerAggregate;
}

export const CareerMilestones = ({ aggregate }: CareerMilestonesProps) => {
  const { milestones } = aggregate;

  if (!milestones.length) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Milestones
        </Typography>

        <Box sx={{ position: 'relative', pl: 2 }}>
          {/* The spine of the timeline. */}
          <Box
            sx={{
              position: 'absolute',
              left: 4,
              top: 6,
              bottom: 6,
              width: '2px',
              backgroundColor: 'divider',
            }}
          />
          {milestones.map((milestone) => (
            <Box
              key={milestone.key}
              sx={{ position: 'relative', py: 0.75, pl: 1.5 }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  left: -4,
                  top: 14,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: 'primary.main',
                }}
              />
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  flexWrap: 'wrap',
                  gap: 0.5,
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {milestone.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(milestone.achievedAt)}
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {milestone.detail}
              </Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};
