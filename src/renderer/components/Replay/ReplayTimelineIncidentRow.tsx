import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import SensorsIcon from '@mui/icons-material/Sensors';
import { Button, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { forwardRef } from 'react';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import { ReplayIncidentEvent, ReplayIncidentType } from './replayTimelineTypes';

interface ReplayTimelineIncidentRowProps {
  event: ReplayIncidentEvent;
  isActiveIncident: boolean;
  hideJumpButtons: boolean;
  incidentTypeLabel: Record<ReplayIncidentType, string>;
  incidentTypeColor: Record<
    ReplayIncidentType,
    'warning' | 'error' | 'secondary'
  >;
  /** Opens the dossier for this incident. Deliberately does not seek. */
  onSelectIncident?: (event: ReplayIncidentEvent) => void;
  onJumpToIncident?: (event: ReplayIncidentEvent) => void;
}

export const ReplayTimelineIncidentRow = forwardRef<
  HTMLDivElement,
  ReplayTimelineIncidentRowProps
>(
  (
    {
      event,
      isActiveIncident,
      hideJumpButtons,
      incidentTypeLabel,
      incidentTypeColor,
      onSelectIncident,
      onJumpToIncident,
    },
    ref,
  ) => {
    const selectIncident = () => onSelectIncident?.(event);

    return (
      <Stack
        ref={ref}
        direction="row"
        alignItems="flex-start"
        spacing={1.5}
        /*
          The whole row opens the dossier. Until now nothing but the jump button
          selected an incident, so reading the evidence for one meant taking
          over the game to seek to it — and a steward working down a long list
          paid a load for every row they merely wanted to look at.
        */
        role={onSelectIncident ? 'button' : undefined}
        tabIndex={onSelectIncident ? 0 : undefined}
        aria-current={onSelectIncident && isActiveIncident ? 'true' : undefined}
        aria-label={
          onSelectIncident
            ? `Review the ${incidentTypeLabel[
                event.type
              ].toLowerCase()} at ${event.timestampLabel}`
            : undefined
        }
        onClick={selectIncident}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
            keyEvent.preventDefault();
            selectIncident();
          }
        }}
        sx={{
          px: 2,
          py: 1.25,
          cursor: onSelectIncident ? 'pointer' : 'default',
          backgroundColor: isActiveIncident ? 'action.selected' : 'transparent',
          borderLeft: isActiveIncident ? '2px solid' : '2px solid transparent',
          borderLeftColor: isActiveIncident ? 'divider' : 'transparent',
          '&:hover': {
            backgroundColor: isActiveIncident
              ? 'action.selected'
              : 'action.hover',
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

        {/*
          Marks the incidents that can be examined properly. A steward scanning
          a race's incident list needs to see at a glance which ones hold
          closing speeds and throttle and brake traces, because those are the
          ones a call can actually be defended on.
        */}
        {event.hasLiveContext ? (
          <Tooltip title="Captured live — telemetry recorded for this incident">
            <SensorsIcon fontSize="small" color="primary" />
          </Tooltip>
        ) : null}

        <Stack spacing={0.25} sx={{ flex: 1 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            {event.drivers.map((driver, driverIndex) => (
              <Stack
                // Replay events are immutable, and the index only disambiguates
                // repeated car numbers within a single event.
                // eslint-disable-next-line react/no-array-index-key
                key={`${event.id}-${driver.carNumber}-${driverIndex}`}
                direction="row"
                spacing={0.5}
                alignItems="center"
              >
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

        {/*
          No tooltip on this one, deliberately: MUI labels a tooltipped button
          with the tooltip's sentence, and "Jump" beside a play icon is already
          the clearer accessible name.
        */}
        {!hideJumpButtons ? (
          <Button
            size="small"
            variant={isActiveIncident ? 'outlined' : 'contained'}
            startIcon={<PlayCircleFilledIcon />}
            onClick={(clickEvent) => {
              /*
                The row underneath opens the dossier on its own. Letting the
                click through would run both handlers for one press, which is
                harmless today only because jumping happens to select too — and
                would stop being harmless the moment either changes.
              */
              clickEvent.stopPropagation();
              onJumpToIncident?.(event);
            }}
          >
            Jump
          </Button>
        ) : null}
      </Stack>
    );
  },
);

ReplayTimelineIncidentRow.displayName = 'ReplayTimelineIncidentRow';
