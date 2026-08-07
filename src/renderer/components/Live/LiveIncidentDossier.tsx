import { useMemo } from 'react';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FlagIcon from '@mui/icons-material/Flag';
import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import { StatDisplay } from '../Common/StatDisplay';
import { useLiveIncidentContext } from '../../hooks/useLiveIncidentContext';
import { LiveIncidentTraceChart } from './LiveIncidentTraceChart';
import {
  LiveDecisionOutcome,
  LiveIncident,
  LiveIncidentTrace,
  isDriverScopedOutcome,
} from './liveFixtures';

const tariff: {
  outcome: LiveDecisionOutcome;
  label: string;
  shortcut: string;
}[] = [
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

/**
 * A duration that ran to the edge of the captured window is a floor, not a
 * measurement, and has to read as one.
 */
const heldLabel = (held?: { seconds: number; truncated: boolean }): string => {
  if (!held) {
    return '—';
  }
  return `${held.seconds.toFixed(1)}s${held.truncated ? '+' : ''}`;
};

interface CarMeasurementsProps {
  incident: LiveIncident;
}

const CarMeasurements: React.FC<CarMeasurementsProps> = ({ incident }) => {
  const rows = incident.evidence.cars;
  if (rows.length === 0) {
    return null;
  }

  const columns: { label: string; render: (index: number) => string }[] = [
    {
      label: 'Speed at contact',
      render: (index) => {
        const speed = rows[index].speedKph;
        return speed === undefined ? '—' : `${speed.toFixed(0)} kph`;
      },
    },
    {
      label: 'Peak deceleration',
      render: (index) => {
        const decel = rows[index].peakDecelMps2;
        return decel === undefined ? '—' : `${decel.toFixed(1)} m/s²`;
      },
    },
    {
      label: 'Braking before contact',
      render: (index) => heldLabel(rows[index].brakeApplied),
    },
    {
      label: 'Blue flag shown',
      render: (index) => heldLabel(rows[index].blueFlagShown),
    },
    {
      label: 'Peak yaw rate',
      render: (index) => {
        const yaw = rows[index].peakYawRateDegPerSec;
        return yaw === undefined ? '—' : `${yaw.toFixed(0)}°/s`;
      },
    },
  ];

  const nameFor = (steamId: string) =>
    incident.drivers.find((driver) => driver.steamId === steamId)
      ?.displayName ?? steamId;

  return (
    <Box sx={{ mt: 2 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ py: 0.75, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Box sx={{ minWidth: 168 }} />
        {rows.map((car) => (
          <Box key={car.steamId} sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="caption" fontWeight={700} noWrap>
              {nameFor(car.steamId)}
            </Typography>
          </Box>
        ))}
      </Stack>

      {columns.map((column) => (
        <Stack
          key={column.label}
          direction="row"
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
            {column.label}
          </Typography>
          {rows.map((car, index) => (
            <Box key={car.steamId} sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2">{column.render(index)}</Typography>
            </Box>
          ))}
        </Stack>
      ))}
    </Box>
  );
};

interface LiveIncidentDossierProps {
  incident?: LiveIncident;
  onFocusCar: (slotId: number | undefined) => void;
  onFlag: (incidentId: string) => void;
  onDecide: (incidentId: string, outcome: LiveDecisionOutcome) => void;
  /** Which driver a penalty would be assigned to. */
  targetSteamId?: string;
  onSelectTarget: (steamId: string) => void;
}

export const LiveIncidentDossier: React.FC<LiveIncidentDossierProps> = ({
  incident,
  onFocusCar,
  onFlag,
  onDecide,
  targetSteamId,
  onSelectTarget,
}) => {
  /*
    The window is pulled when the dossier is opened rather than carried on the
    incident list. A window is a few hundred frames per car and a race holds
    hundreds of them, so shipping them all at 1Hz to draw the one chart on
    screen cost roughly 24 MB a second at four hundred incidents. Asked for
    only when capture says there is one to ask for.
  */
  const { context, isLoading } = useLiveIncidentContext(
    incident?.hasTrace && !incident.traces?.length ? incident.id : undefined,
  );

  const traces = useMemo<LiveIncidentTrace[] | undefined>(() => {
    // Fixtures carry theirs inline, so dev mode never needs a round trip.
    if (incident?.traces?.length) {
      return incident.traces;
    }
    if (!incident || !context) {
      return undefined;
    }

    return context.cars.map((car) => {
      const party = incident.drivers.find(
        (driver) => driver.slotId === car.slotId,
      );
      return {
        steamId: party?.steamId ?? `slot-${car.slotId}`,
        displayName: party?.displayName ?? `Car ${car.slotId}`,
        frames: car.frames,
      };
    });
  }, [context, incident]);

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

  // Every steam id in the evidence belongs to a party of this incident, so the
  // incident carries its own lookup — no driver table needs threading in.
  const findParty = (steamId?: string) =>
    steamId
      ? incident.drivers.find((driver) => driver.steamId === steamId)
      : undefined;

  const targetDriver = findParty(targetSteamId);
  const aheadDriver = findParty(incident.evidence.aheadDriverSteamId);
  const offTrackNames = incident.evidence.cars
    .filter((car) => car.offTrack)
    .map((car) => findParty(car.steamId)?.displayName ?? car.steamId);
  const anyOffTrackKnown = incident.evidence.cars.some(
    (car) => car.offTrack !== undefined,
  );

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
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
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
            const isTarget = driver.steamId === targetSteamId;
            return (
              <Stack
                key={driver.steamId}
                data-testid={`dossier-driver-${driver.steamId}`}
                direction="row"
                spacing={1}
                alignItems="center"
                onClick={() => onSelectTarget(driver.steamId)}
                sx={{
                  px: 1.5,
                  py: 1,
                  borderRadius: 1,
                  cursor: 'pointer',
                  border: '2px solid',
                  borderColor: isTarget
                    ? 'warning.main'
                    : isAtFault
                      ? 'error.main'
                      : 'transparent',
                  outline: isTarget ? 'none' : '1px solid',
                  outlineColor: 'divider',
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
                {isTarget ? (
                  <Chip
                    size="small"
                    label="Penalty target"
                    color="warning"
                    sx={{ height: 20, fontSize: 10 }}
                  />
                ) : null}
                <Button
                  size="small"
                  startIcon={<CenterFocusStrongIcon />}
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onFocusCar(driver.slotId);
                  }}
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
            sx={{
              display: 'block',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
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
          <StatDisplay label="Location">
            <Typography variant="h6">
              {incident.evidence.trackPositionLabel ?? '—'}
            </Typography>
          </StatDisplay>
        </Stack>

        <Divider sx={{ mb: 1 }} />

        <EvidenceRow
          label="Ahead at contact"
          value={
            aheadDriver
              ? `${aheadDriver.displayName} #${aheadDriver.carNumber}`
              : '—'
          }
        />
        <EvidenceRow
          label="Class interaction"
          value={
            incident.evidence.isTrafficIncident === undefined
              ? '—'
              : incident.evidence.isTrafficIncident
                ? 'Multiclass traffic'
                : 'Same class'
          }
          emphasis={incident.evidence.isTrafficIncident === true}
        />
        <EvidenceRow
          label="Off track"
          value={
            offTrackNames.length
              ? offTrackNames.join(', ')
              : anyOffTrackKnown
                ? 'All parties on track'
                : '—'
          }
          emphasis={offTrackNames.length > 0}
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

        <CarMeasurements incident={incident} />

        {traces?.length ? (
          <LiveIncidentTraceChart
            traces={traces}
            anchorErrorSeconds={
              incident.anchorErrorSeconds ?? context?.anchorErrorSeconds
            }
          />
        ) : null}

        {isLoading ? (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
            Loading captured trace…
          </Typography>
        ) : null}

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
              sx={{
                display: 'block',
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
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
        <Typography
          variant="caption"
          color={targetDriver ? 'warning.main' : 'text.secondary'}
        >
          {targetDriver
            ? `Penalty applies to ${targetDriver.displayName} #${targetDriver.carNumber}`
            : 'Select a driver above to assign a penalty'}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {tariff.map((entry) => (
            <Button
              key={entry.outcome}
              size="small"
              disabled={isDriverScopedOutcome(entry.outcome) && !targetDriver}
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
