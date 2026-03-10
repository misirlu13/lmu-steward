import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import FastForwardIcon from '@mui/icons-material/FastForward';
import FastRewindIcon from '@mui/icons-material/FastRewind';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import {
  Button,
  Box,
  IconButton,
  Paper,
  Slider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ReplayIncidentEvent } from './ReplayMasterIncidentTimeline';
import {
  CameraMode,
  cameraModeConfig,
  useReplayCameraControls,
} from './hooks/useReplayCameraControls';
import { useReplayPlaybackControls } from './hooks/useReplayPlaybackControls';

interface ReplayJumpBarProps {
  incidents: ReplayIncidentEvent[];
  selectedIncidentId?: string;
  onJumpToIncident?: (incident: ReplayIncidentEvent) => void;
}

export const ReplayJumpBar = ({
  incidents,
  selectedIncidentId,
  onJumpToIncident,
}: ReplayJumpBarProps) => {
  const INCIDENT_JUMP_DEBOUNCE_MS = 300;
  const CAMERA_COMMAND_DEBOUNCE_MS = 300;
  const INCIDENT_TOOLTIP_HIDE_MS = 1800;
  const { isPlaying, speed, onForwardBySpeed, onPlayPause, onReverseBySpeed, onSpeedChange } =
    useReplayPlaybackControls();
  const { cameraMode, onCameraModeChange, onCycleCamera } =
    useReplayCameraControls(CAMERA_COMMAND_DEBOUNCE_MS);
  const [incidentSliderIndex, setIncidentSliderIndex] = useState(0);
  const [isIncidentTooltipVisible, setIsIncidentTooltipVisible] = useState(false);
  const incidentJumpDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incidentTooltipHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasIncidents = incidents.length > 0;
  const selectedIncidentIndexFromId = useMemo(() => {
    if (!selectedIncidentId) {
      return -1;
    }

    return incidents.findIndex((incident) => incident.id === selectedIncidentId);
  }, [incidents, selectedIncidentId]);

  const activeIncidentIndex =
    selectedIncidentIndexFromId >= 0 ? selectedIncidentIndexFromId : incidentSliderIndex;
  const safeIncidentIndex = hasIncidents
    ? Math.min(Math.max(activeIncidentIndex, 0), incidents.length - 1)
    : 0;
  const activeIncident = hasIncidents ? incidents[safeIncidentIndex] : null;
  const incidentTypeTooltipColorMap: Record<
    ReplayIncidentEvent['type'],
    string
  > = {
    'track-limit': 'warning.main',
    collision: 'error.main',
    penalty: 'secondary.main',
  };
  const activeIncidentTooltipColor = activeIncident
    ? incidentTypeTooltipColorMap[activeIncident.type]
    : 'grey.700';

  useEffect(() => {
    if (selectedIncidentIndexFromId < 0) {
      return;
    }

    setIncidentSliderIndex(selectedIncidentIndexFromId);
  }, [selectedIncidentIndexFromId]);

  useEffect(() => {
    return () => {
      if (incidentJumpDebounceTimeoutRef.current) {
        clearTimeout(incidentJumpDebounceTimeoutRef.current);
      }

      if (incidentTooltipHideTimeoutRef.current) {
        clearTimeout(incidentTooltipHideTimeoutRef.current);
      }
    };
  }, []);

  const showIncidentTooltipTemporarily = () => {
    setIsIncidentTooltipVisible(true);

    if (incidentTooltipHideTimeoutRef.current) {
      clearTimeout(incidentTooltipHideTimeoutRef.current);
    }

    incidentTooltipHideTimeoutRef.current = setTimeout(() => {
      setIsIncidentTooltipVisible(false);
      incidentTooltipHideTimeoutRef.current = null;
    }, INCIDENT_TOOLTIP_HIDE_MS);
  };

  const jumpToIncidentAtIndex = (index: number) => {
    if (!hasIncidents) {
      return;
    }

    const clampedIndex = Math.min(Math.max(Math.floor(index), 0), incidents.length - 1);
    setIncidentSliderIndex(clampedIndex);
    showIncidentTooltipTemporarily();

    if (incidentJumpDebounceTimeoutRef.current) {
      clearTimeout(incidentJumpDebounceTimeoutRef.current);
    }

    incidentJumpDebounceTimeoutRef.current = setTimeout(() => {
      onJumpToIncident?.(incidents[clampedIndex]);
      incidentJumpDebounceTimeoutRef.current = null;
    }, INCIDENT_JUMP_DEBOUNCE_MS);
  };

  const scheduleJumpToIncidentAtIndex = (index: number) => {
    if (!hasIncidents) {
      return;
    }

    const clampedIndex = Math.min(Math.max(Math.floor(index), 0), incidents.length - 1);
    setIncidentSliderIndex(clampedIndex);
    showIncidentTooltipTemporarily();

    if (incidentJumpDebounceTimeoutRef.current) {
      clearTimeout(incidentJumpDebounceTimeoutRef.current);
    }

    incidentJumpDebounceTimeoutRef.current = setTimeout(() => {
      onJumpToIncident?.(incidents[clampedIndex]);
      incidentJumpDebounceTimeoutRef.current = null;
    }, INCIDENT_JUMP_DEBOUNCE_MS);
  };

  const onIncidentSliderCommitted = (value: number | number[]) => {
    const nextIndex = Array.isArray(value) ? value[0] : value;
    jumpToIncidentAtIndex(nextIndex);
  };

  const getWrappedIncidentIndex = (nextIndex: number): number => {
    if (!hasIncidents) {
      return 0;
    }

    if (nextIndex < 0) {
      return incidents.length - 1;
    }

    if (nextIndex >= incidents.length) {
      return 0;
    }

    return nextIndex;
  };

  const getPreviousIncidentButtonIndex = (): number => {
    if (!hasIncidents) {
      return 0;
    }

    if (selectedIncidentIndexFromId < 0) {
      return incidents.length - 1;
    }

    return getWrappedIncidentIndex(safeIncidentIndex - 1);
  };

  const getNextIncidentButtonIndex = (): number => {
    if (!hasIncidents) {
      return 0;
    }

    if (selectedIncidentIndexFromId < 0) {
      return 0;
    }

    return getWrappedIncidentIndex(safeIncidentIndex + 1);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: 'divider',
        borderRadius: 0,
        p: 2,
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        boxShadow: (theme) => `0 -2px 8px ${theme.palette.primary.main}33`,
      }}
    >
      <Box sx={{ px: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
          Incident Jump Navigator
        </Typography>
        {hasIncidents ? (
          <>
            <Slider
              value={safeIncidentIndex}
              onChange={(_, value) => scheduleJumpToIncidentAtIndex(value as number)}
              onChangeCommitted={(_, value) => onIncidentSliderCommitted(value)}
              size="small"
              min={0}
              max={Math.max(incidents.length - 1, 0)}
              step={1}
              disabled={!hasIncidents}
              valueLabelDisplay={isIncidentTooltipVisible ? 'on' : 'off'}
              valueLabelFormat={(value) => {
                const incident = incidents[Math.floor(Number(value))];
                if (!incident) {
                  return '--:--:--';
                }

                return `${incident.timestampLabel}${incident.timestampEstimated ? ' (estimated)' : ''}`;
              }}
              sx={{
                '& .MuiSlider-valueLabel': {
                  backgroundColor: activeIncidentTooltipColor,
                },
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {activeIncident
                ? `Slide to preview and jump incidents • Incident ${safeIncidentIndex + 1} of ${incidents.length} • ${activeIncident.lapLabel} • ${activeIncident.timestampLabel}${activeIncident.timestampEstimated ? ' (estimated)' : ''}${activeIncident.description ? ` • ${activeIncident.description}` : ''}`
                : 'No incidents available. Incident jump controls are disabled.'}
            </Typography>
          </>
        ) : (
          <Typography variant="caption" color="text.secondary">
            No incidents available. Incident jump controls are hidden.
          </Typography>
        )}
      </Box>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ xs: 'stretch', md: 'center' }}
        spacing={2}
        justifyContent={{ xs: 'space-between', md: 'space-between' }}
        sx={{ mt: 1 }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          alignItems="center"
        >
          <IconButton
            onClick={onReverseBySpeed}
            size="small"
          >
            <FastRewindIcon />
          </IconButton>
          <IconButton
            onClick={onPlayPause}
            sx={{
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': { backgroundColor: 'primary.dark' },
            }}
          >
            {isPlaying ? <PauseIcon /> : <PlayArrowIcon />}
          </IconButton>
          <IconButton
            onClick={onForwardBySpeed}
            size="small"
          >
            <FastForwardIcon />
          </IconButton>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={speed}
            onChange={(_, value: 0.5 | 1 | 2 | null) => {
              if (value) {
                onSpeedChange(value);
              }
            }}
          >
            <ToggleButton value={0.5}>x0.5</ToggleButton>
            <ToggleButton value={1}>x1.0</ToggleButton>
            <ToggleButton value={2}>x2.0</ToggleButton>
          </ToggleButtonGroup>

          {hasIncidents ? (
            <Box
              sx={{
                ml: 0.5,
                pl: 1,
                borderLeft: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Button
                size="small"
                variant="outlined"
                onClick={() => jumpToIncidentAtIndex(getPreviousIncidentButtonIndex())}
                disabled={!hasIncidents}
              >
                Previous Incident
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => jumpToIncidentAtIndex(getNextIncidentButtonIndex())}
                disabled={!hasIncidents}
              >
                Next Incident
              </Button>
            </Box>
          ) : null}
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ ml: 'auto' }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: 'uppercase' }}
          >
            Camera
          </Typography>

          <IconButton size="small" onClick={() => onCycleCamera('previous')}>
            <ArrowBackIosNewIcon sx={{ fontSize: 14 }} />
          </IconButton>

          <ToggleButtonGroup
            size="small"
            exclusive
            value={cameraMode}
            onChange={(_, value: CameraMode | null) =>
              onCameraModeChange(value)
            }
          >
            {(Object.keys(cameraModeConfig) as CameraMode[]).map((mode) => (
              <ToggleButton key={mode} value={mode}>
                <Stack direction="row" spacing={0.5} alignItems="center">
                  {cameraModeConfig[mode].icon}
                  <span>{cameraModeConfig[mode].label}</span>
                </Stack>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <IconButton size="small" onClick={() => onCycleCamera('next')}>
            <ArrowForwardIosIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Stack>
      </Stack>
    </Paper>
  );
};
