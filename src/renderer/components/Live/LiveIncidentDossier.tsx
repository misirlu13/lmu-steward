import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FlagIcon from '@mui/icons-material/Flag';
import { Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import { StatDisplay } from '../Common/StatDisplay';
import {
  LiveDecisionOutcome,
  LiveIncident,
  findDriverBySteamId,
} from './liveFixtures';

const tariff: { outcome: LiveDecisionOutcome; label: string; shortcut: string }[] =
  [
    { outcome: 'penalty-5s', label: '5s Penalty', shortcut: '1' },
    { outcome: 'penalty-10s', label: '10s Penalty', shortcut: '2' },
    { outcome: 'drive-through', label: 'Drive-Through', shortcut: '3' },
    { outcome: 'no-action', label: 'No Action', shortcut: '4' },
    { outcome: 'note', label: 'Note Only', shortcut: '5' },
  ];

const decisionLabel: Record<LiveDecisionOutcome, string> = {
  'penalty-5s': '5s Penalty',
  'penalty-10s': '10s Penalty',
  'drive-through': 'Drive-Through',
  'no-action': 'No Action',
  note: 'Note Only',
};

interface EvidenceRowProps {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}

const EvidenceRow: React.FC<EvidenceRowProps> = ({
  label,
  value,
  emphasis = false,
}) => (
  <Stack
    direction="row"
    alignItems="center"
    spacing={2}
    sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}
  >
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{
        minWidth: 168,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
      }}
    >
      {label}
    </Typography>
    <Box
      sx={{
        fontSize: '0.875rem',
        fontWeight: emphasis ? 700 : 400,
        color: emphasis ? 'warning.main' : 'text.primary',
      }}
    >
      {value}
    </Box>
  </Stack>
);

interface LiveIncidentDossierProps {
  incident?: LiveIncident;
  onFocusCar: (steamId: string) => void;
  onFlag: (incidentId: string) => void;
  onDecide: (incidentId: string, outcome: LiveDecisionOutcome) => void;
}

export const LiveIncidentDossier: React.FC<LiveIncidentDossierProps> = ({
  incident,
  onFocusCar,
  onFlag,
  onDecide,
}) => {
  if (!incident) {
    return (
      <Paper
        variant="outlined"
        sx={{
          borderColor: 'divider',
          borderRadius: 2,
          p: 3,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Select an incident from the queue to review the evidence.
        </Typography>
      </Paper>
    );
  }

  const aheadDriver = findDriverBySteamId(incident.evidence.aheadDriverSteamId);
  const atFaultDriver = findDriverBySteamId(incident.atFaultSteamId);
  const offTrackNames = (incident.evidence.offTrack ?? [])
    .map((steamId) => findDriverBySteamId(steamId)?.displayName)
    .filter(Boolean);

  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: 'divider',
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Incident Dossier
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {incident.id}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {incident.timestampLabel} · {incident.lapLabel}
        </Typography>
      </Stack>

      <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0, p: 2 }}>
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mb: 2 }}
        >
          {incident.drivers.map((driver) => {
            const isAtFault = driver.steamId === incident.atFaultSteamId;
            return (
              <Stack
                key={driver.steamId}
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: isAtFault ? 'error.main' : 'divider',
                  backgroundColor: 'background.alt',
                }}
              >
                <Typography variant="body2" fontWeight={700}>
                  {driver.displayName}
                </Typography>
                {driver.isAiDriver ? <AiBadge /> : null}
                <Typography variant="body2" color="text.secondary">
                  #{driver.carNumber}
                </Typography>
                <CarClassBadge carClass={driver.carClass} />
                {isAtFault ? (
                  <Chip
                    size="small"
                    label="Likely at fault"
                    color="error"
                    variant="outlined"
                    sx={{ height: 20, fontSize: 10 }}
                  />
                ) : null}
                <Button
                  size="small"
                  startIcon={<CenterFocusStrongIcon />}
                  onClick={() => onFocusCar(driver.steamId)}
                >
                  Focus
                </Button>
              </Stack>
            );
          })}
        </Stack>

        <Box
          sx={{
            px: 1.5,
            py: 1,
            mb: 2,
            borderRadius: 1,
            backgroundColor: 'background.default',
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.8 }}
          >
            Raw stream
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
            {incident.rawText}
          </Typography>
        </Box>

        <Stack direction="row" sx={{ mb: 2 }}>
          <StatDisplay label="Closing Speed">
            <Typography variant="h6">
              {incident.evidence.closingSpeedKph
                ? `${incident.evidence.closingSpeedKph.toFixed(1)} kph`
                : '—'}
            </Typography>
          </StatDisplay>
          <StatDisplay label="Magnitude">
            <Typography variant="h6">
              {incident.contactMagnitude
                ? incident.contactMagnitude.toFixed(0)
                : '—'}
            </Typography>
          </StatDisplay>
          <StatDisplay label="Corner">
            <Typography variant="h6">
              {incident.evidence.cornerLabel ?? '—'}
            </Typography>
          </StatDisplay>
        </Stack>

        <Divider sx={{ mb: 1 }} />

        <EvidenceRow
          label="Ahead at contact"
          value={aheadDriver ? `${aheadDriver.displayName} #${aheadDriver.carNumber}` : '—'}
        />
        <EvidenceRow
          label="Class interaction"
          value={
            incident.evidence.isTrafficIncident
              ? 'Multiclass traffic'
              : 'Same class'
          }
          emphasis={incident.evidence.isTrafficIncident}
        />
        <EvidenceRow
          label="Blue flag shown"
          value={
            incident.evidence.blueFlagShownSeconds
              ? `${incident.evidence.blueFlagShownSeconds.toFixed(1)}s before contact`
              : 'Not shown'
          }
          emphasis={Boolean(incident.evidence.blueFlagShownSeconds)}
        />
        <EvidenceRow
          label="Off track"
          value={offTrackNames.length ? offTrackNames.join(', ') : 'Both on track'}
        />
        <EvidenceRow
          label="Peak yaw rate"
          value={
            incident.evidence.peakYawRateDegPerSec
              ? `${incident.evidence.peakYawRateDegPerSec.toFixed(0)}°/s`
              : '—'
          }
        />
        <EvidenceRow
          label="Local yellow in sector"
          value={incident.evidence.localYellowInSector ? 'Yes' : 'No'}
          emphasis={Boolean(incident.evidence.localYellowInSector)}
        />
        <EvidenceRow
          label="Participants"
          value={
            incident.drivers.some((d) => d.isAiDriver)
              ? 'Includes AI driver'
              : 'All human'
          }
          emphasis={incident.drivers.some((d) => d.isAiDriver)}
        />

        {incident.state === 'DECIDED' && incident.decision ? (
          <Box
            sx={{
              mt: 2,
              px: 1.5,
              py: 1.25,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'success.main',
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.8 }}
            >
              Decision
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              {decisionLabel[incident.decision]}
            </Typography>
            {incident.decisionReasoning ? (
              <Typography variant="caption" color="text.secondary">
                {incident.decisionReasoning}
              </Typography>
            ) : null}
          </Box>
        ) : null}
      </Box>

      <Stack
        spacing={1}
        sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}
      >
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {tariff.map((entry) => (
            <Button
              key={entry.outcome}
              size="small"
              variant={
                incident.decision === entry.outcome ? 'contained' : 'outlined'
              }
              onClick={() => onDecide(incident.id, entry.outcome)}
            >
              {entry.label}
              <Typography
                component="span"
                variant="caption"
                color="text.secondary"
                sx={{ ml: 0.75 }}
              >
                {entry.shortcut}
              </Typography>
            </Button>
          ))}
        </Stack>
        <Button
          size="small"
          variant={incident.state === 'FLAGGED' ? 'contained' : 'outlined'}
          color="warning"
          startIcon={<FlagIcon />}
          onClick={() => onFlag(incident.id)}
          sx={{ alignSelf: 'flex-start' }}
        >
          Flag for review
          <Typography
            component="span"
            variant="caption"
            sx={{ ml: 0.75, opacity: 0.7 }}
          >
            F
          </Typography>
        </Button>
      </Stack>
    </Paper>
  );
};
