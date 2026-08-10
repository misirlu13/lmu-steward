import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Radio,
  Stack,
  Typography,
} from '@mui/material';
import {
  LiveSessionMatchCandidate,
  LiveSessionMatchReason,
  LiveSessionMatchResult,
  LiveSessionSummary,
} from '@types';

interface Props {
  session: LiveSessionSummary | null;
  matches: LiveSessionMatchResult | null;
  loading: boolean;
  error: string;
  selectedHash: string;
  onSelect: (replayHash: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onUnlink: () => void;
  onDismiss: () => void;
}

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

/**
 * Why nothing was proposed, said plainly.
 *
 * Each of these is a normal outcome rather than a fault, and the wording says
 * so — a steward who reads "no match" as breakage will go looking for a bug
 * instead of picking the replay themselves.
 */
const REASON_COPY: Record<LiveSessionMatchReason, string> = {
  proposed: '',
  'only-candidate': '',
  'no-candidates':
    'No replay at this track and session type was found. LMU only keeps a replay when replay saving is on, and practice replays are often not kept.',
  'roster-too-small':
    'This session had too few drivers for the grid to identify a replay. Pick one below if you know which it is.',
  'below-floor':
    'No replay shares enough of this session’s grid to be confident. Pick one below if you know which it is.',
  ambiguous:
    'Two replays match this session equally well — a restarted race looks exactly like this. Pick the right one below.',
};

const CandidateRow: React.FC<{
  candidate: LiveSessionMatchCandidate;
  isProposed: boolean;
  selected: boolean;
  onSelect: () => void;
}> = ({ candidate, isProposed, selected, onSelect }) => (
  <Paper
    variant="outlined"
    onClick={onSelect}
    sx={{
      borderColor: selected ? 'primary.main' : 'divider',
      borderRadius: 1,
      cursor: 'pointer',
      p: 1.5,
    }}
  >
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <Radio size="small" checked={selected} onChange={onSelect} />

      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="body2" noWrap>
          {candidate.replayName || 'Unnamed replay'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {new Date(candidate.timestamp * 1000).toLocaleString()} ·{' '}
          {candidate.intersection} of {candidate.liveDriverCount} drivers
          {candidate.incidentAgreement !== null
            ? ` · ${formatPercent(candidate.incidentAgreement)} of incidents agree`
            : ''}
        </Typography>
      </Box>

      {candidate.imported ? <Chip size="small" label="Imported" /> : null}
      {candidate.linked ? (
        <Chip size="small" color="success" label="Linked" />
      ) : null}
      {isProposed && !candidate.linked ? (
        <Chip size="small" color="primary" label="Best match" />
      ) : null}
      <Chip size="small" label={formatPercent(candidate.confidence)} />
    </Stack>
  </Paper>
);

/**
 * Confirms which replay a captured session belongs to.
 *
 * The app never makes this link on its own, however confident the score. A
 * wrong link puts a driver's name against an incident they were not in, in an
 * export a league may publish, so the proposal is shown with the evidence
 * behind it — roster overlap and incident agreement — and a human decides.
 */
export const LinkReplayDialog: React.FC<Props> = ({
  session,
  matches,
  loading,
  error,
  selectedHash,
  onSelect,
  onCancel,
  onConfirm,
  onUnlink,
  onDismiss,
}) => {
  const candidates = matches?.candidates ?? [];
  const proposedHash = matches?.proposed?.replayHash ?? '';
  const reasonCopy = matches ? REASON_COPY[matches.reason] : '';

  return (
    <Dialog open={Boolean(session)} onClose={onCancel} maxWidth="sm" fullWidth>
      <DialogTitle>Link this session to a replay</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {session?.trackName || 'Unknown track'} —{' '}
          {session?.sessionType ?? 'Session'},{' '}
          {session ? new Date(session.startedAt).toLocaleString() : ''}
        </DialogContentText>

        {loading ? (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.5}
            sx={{ py: 2 }}
          >
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Looking for the replay of this session…
            </Typography>
          </Stack>
        ) : null}

        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}

        {!loading && reasonCopy ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            {reasonCopy}
          </Alert>
        ) : null}

        <Stack spacing={1}>
          {candidates.map((candidate) => (
            <CandidateRow
              key={candidate.replayHash}
              candidate={candidate}
              isProposed={candidate.replayHash === proposedHash}
              selected={candidate.replayHash === selectedHash}
              onSelect={() => onSelect(candidate.replayHash)}
            />
          ))}
        </Stack>

        {session?.linkState === 'linked' ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Linked to {session.link?.replayName || 'a replay'}. Unlinking keeps
            everything captured; it only stops the replay showing it.
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        {session?.linkState === 'linked' ? (
          <Button color="error" onClick={onUnlink}>
            Unlink
          </Button>
        ) : null}
        {/*
          The only way to answer a suggestion with "no". Without it the same
          replay would be offered on every visit, which is the nagging an
          unlinked session — a normal state — must not produce.
        */}
        {session?.linkState === 'proposed' ? (
          <Button onClick={onDismiss}>None of These</Button>
        ) : null}
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!selectedHash}
          onClick={onConfirm}
        >
          Link Replay
        </Button>
      </DialogActions>
    </Dialog>
  );
};
