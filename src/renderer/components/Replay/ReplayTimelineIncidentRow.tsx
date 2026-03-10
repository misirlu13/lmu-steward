import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import { Button, Chip, Stack, Typography } from '@mui/material';
import { forwardRef } from 'react';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import { ReplayIncidentEvent, ReplayIncidentType } from './ReplayMasterIncidentTimeline';

interface ReplayTimelineIncidentRowProps {
  event: ReplayIncidentEvent;
  isActiveIncident: boolean;
  hideJumpButtons: boolean;
  incidentTypeLabel: Record<ReplayIncidentType, string>;
  incidentTypeColor: Record<ReplayIncidentType, 'warning' | 'error' | 'secondary'>;
  onJumpToIncident?: (event: ReplayIncidentEvent) => void;
}

export const ReplayTimelineIncidentRow = forwardRef<
  HTMLDivElement,
  ReplayTimelineIncidentRowProps
>(({ event, isActiveIncident, hideJumpButtons, incidentTypeLabel, incidentTypeColor, onJumpToIncident }, ref) => {
  return (
    <Stack
      ref={ref}
      direction="row"
      alignItems="flex-start"
      spacing={1.5}
      sx={{
        px: 2,
        py: 1.25,
        backgroundColor: isActiveIncident ? 'action.selected' : 'transparent',
        borderLeft: isActiveIncident ? '2px solid' : '2px solid transparent',
        borderLeftColor: isActiveIncident ? 'divider' : 'transparent',
        '&:hover': {
          backgroundColor: isActiveIncident ? 'action.selected' : 'action.hover',
        },
      }}
    >
      <Stack spacing={0} sx={{ minWidth: 72 }}>
        <Typography variant="caption" color="text.secondary">
          {event.timestampLabel}
        </Typography>
        {event.timestampEstimated ? (
          <Typography variant="caption" color="text.secondary">
            (estimated)
          </Typography>
        ) : null}
      </Stack>
      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 56 }}>
        {event.lapLabel}
      </Typography>
      <Chip
        size="small"
        label={incidentTypeLabel[event.type]}
        color={incidentTypeColor[event.type]}
        variant="outlined"
        sx={{ minWidth: 92 }}
      />

      <Stack spacing={0.25} sx={{ flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          {event.drivers.map((driver, driverIndex) => (
            <Stack key={`${event.id}-${driver.carNumber}-${driverIndex}`} direction="row" spacing={0.5} alignItems="center">
              <Typography variant="body2">{driver.displayName}</Typography>
              {driver.isAiDriver ? <AiBadge /> : null}
              {driver.carNumber ? (
                <Typography variant="body2" color="text.secondary">
                  #{driver.carNumber}
                </Typography>
              ) : null}
              <CarClassBadge carClass={driver.carClass} />
              {driver.hasLapData === false ? (
                <Chip
                  size="small"
                  label="Limited Data"
                  variant="outlined"
                  sx={{ height: 18, fontSize: 10 }}
                />
              ) : null}
            </Stack>
          ))}
        </Stack>
        {event.description ? (
          <Typography variant="caption" color="text.secondary">
            {event.description}
          </Typography>
        ) : null}
      </Stack>

      {!hideJumpButtons ? (
        <Button
          size="small"
          variant={isActiveIncident ? 'outlined' : 'contained'}
          startIcon={<PlayCircleFilledIcon />}
          onClick={() => onJumpToIncident?.(event)}
        >
          Jump
        </Button>
      ) : null}
    </Stack>
  );
});

ReplayTimelineIncidentRow.displayName = 'ReplayTimelineIncidentRow';
