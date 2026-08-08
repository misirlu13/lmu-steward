import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import SensorsIcon from '@mui/icons-material/Sensors';
import { LiveSessionLinkState, LiveSessionSummary } from '@types';
import { liveSegmentLabel } from './liveFixtures';

/**
 * Whether a segment has a replay behind it, in one dot.
 *
 * A dot rather than a word because the picker is a navigation control and the
 * link state is a footnote on it — `CapturedSessions` is where linking is
 * actually done, and it says all of this in full. `unlinked` is a normal
 * resting state, so it gets the quietest treatment of the three rather than a
 * warning colour.
 */
const linkStateColor: Record<LiveSessionLinkState, string> = {
  linked: 'success.main',
  proposed: 'info.main',
  unlinked: 'divider',
};

const linkStateTitle: Record<LiveSessionLinkState, string> = {
  linked: 'Linked to a replay',
  proposed: 'A matching replay is waiting to be confirmed',
  unlinked: 'No replay linked',
};

/** `HH:MM` local, which is what separates two segments a label cannot. */
const startedAtLabel = (startedAt: number): string =>
  new Date(startedAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

interface SegmentButtonProps {
  segment: LiveSessionSummary;
  isActive: boolean;
  isSelected: boolean;
  onSelect: (sessionKey: string) => void;
}

const SegmentButton: React.FC<SegmentButtonProps> = ({
  segment,
  isActive,
  isSelected,
  onSelect,
}) => (
  <Box
    role="button"
    aria-pressed={isSelected}
    aria-label={`${liveSegmentLabel(segment.session)}, ${
      segment.incidentCount
    } incidents${isActive ? ', running now' : ''}`}
    onClick={() => onSelect(segment.sessionKey)}
    sx={{
      px: 1.5,
      py: 0.75,
      minWidth: 116,
      cursor: 'pointer',
      borderRadius: 1.5,
      border: '1px solid',
      borderColor: isSelected ? 'primary.main' : 'divider',
      backgroundColor: isSelected ? 'action.selected' : 'transparent',
      '&:hover': { backgroundColor: 'action.hover' },
    }}
  >
    <Stack direction="row" alignItems="center" spacing={0.75}>
      <Typography variant="body2" fontWeight={700} noWrap>
        {liveSegmentLabel(segment.session)}
      </Typography>
      {isActive ? (
        <Tooltip title="The session the game is running now">
          <SensorsIcon sx={{ fontSize: 14, color: 'success.main' }} />
        </Tooltip>
      ) : null}
      <Box sx={{ flex: 1 }} />
      <Tooltip title={linkStateTitle[segment.linkState]}>
        <Box
          aria-label={linkStateTitle[segment.linkState]}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: linkStateColor[segment.linkState],
          }}
        />
      </Tooltip>
    </Stack>
    <Typography variant="caption" color="text.secondary">
      {startedAtLabel(segment.startedAt)} · {segment.incidentCount} inc
    </Typography>
  </Box>
);

/**
 * Whether the picker has anything to draw.
 *
 * Exported so a grid-based caller can avoid reserving a row for a component
 * that is about to render nothing — the rule lives here so the two cannot
 * disagree about when the picker exists.
 */
export const hasSegmentChoice = (segments: LiveSessionSummary[]): boolean =>
  segments.length > 1;

export interface LiveSessionSegmentPickerProps {
  segments: LiveSessionSummary[];
  /** The session the game is running. */
  activeSessionKey: string;
  /** The session the incident queue is showing, which may be a past one. */
  selectedSessionKey: string;
  isReviewingRecord: boolean;
  loading: boolean;
  onSelect: (sessionKey: string) => void;
}

/**
 * The weekend's sessions, and which one the incident queue is showing.
 *
 * Draws nothing below two segments. A steward who has run one session has
 * nothing to pick between, and a picker offering a single choice is a row of
 * chrome that teaches them to stop looking at it.
 *
 * The read-only notice lives here rather than in the views because it belongs
 * to the same decision the buttons make. Both surfaces that render this get the
 * warning for free, and neither can render the picker without it.
 */
export const LiveSessionSegmentPicker: React.FC<
  LiveSessionSegmentPickerProps
> = ({
  segments,
  activeSessionKey,
  selectedSessionKey,
  isReviewingRecord,
  loading,
  onSelect,
}) => {
  if (!hasSegmentChoice(segments)) {
    return null;
  }

  return (
    <Paper
      variant="outlined"
      sx={{ borderColor: 'divider', borderRadius: 2, px: 1.5, py: 1.25 }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        flexWrap="wrap"
        useFlexGap
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 700, letterSpacing: 0.6 }}
        >
          SESSION
        </Typography>

        {segments.map((segment) => (
          <SegmentButton
            key={segment.sessionKey}
            segment={segment}
            isActive={segment.sessionKey === activeSessionKey}
            isSelected={segment.sessionKey === selectedSessionKey}
            onSelect={onSelect}
          />
        ))}

        {loading ? <CircularProgress size={16} /> : null}
      </Stack>

      {isReviewingRecord ? (
        <Stack
          direction="row"
          alignItems="center"
          spacing={1}
          sx={{
            mt: 1.25,
            pt: 1.25,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <HistoryIcon sx={{ fontSize: 16, color: 'info.main' }} />
          {/*
            Says which half of the screen changed, because only half of it did.
            The incident queue and its counts follow this selection; the field,
            the timing screen and the camera stay on whatever the game is doing.
            A steward who assumed the whole view had moved would read a live
            timing screen as a record of a session that ended an hour ago.
          */}
          <Typography variant="caption" color="text.secondary">
            Reviewing a finished session — these incidents are a record, not a
            live feed. Field, timing and camera stay on the running session.
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button
            size="small"
            startIcon={<SensorsIcon />}
            onClick={() => onSelect(activeSessionKey)}
          >
            Back to live
          </Button>
        </Stack>
      ) : null}
    </Paper>
  );
};
