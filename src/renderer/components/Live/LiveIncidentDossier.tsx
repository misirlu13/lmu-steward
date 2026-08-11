import { useMemo } from 'react';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import FlagIcon from '@mui/icons-material/Flag';
import HistoryIcon from '@mui/icons-material/History';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import { StatDisplay } from '../Common/StatDisplay';
import { useLiveIncidentContext } from '../../hooks/useLiveIncidentContext';
import { useApi } from '../../providers/ApiContext';
import { stewardActionShortcut } from '../../utils/stewardActions';
import { LiveIncidentTraceChart } from './LiveIncidentTraceChart';
import { LiveIncident, LiveIncidentTrace, LivePriorCall } from './liveFixtures';

/**
 * Prior calls shown per driver before it collapses to a count.
 *
 * A steward is looking for a pattern, and four entries is enough to see one.
 * Beyond that the list starts competing with the incident actually on screen.
 */
const PRIOR_CALL_LIMIT = 4;

const priorCallLabel = (call: LivePriorCall): string => {
  const lap = call.lapLabel ? `${call.lapLabel} · ` : '';
  /*
    Printed, not looked up. The label is the value, so a call made under an
    action that has since been renamed or deleted still reads back as the text it
    was made under — there is no table to miss a key in.
  */
  if (call.outcome) {
    return `${lap}${call.outcome}`;
  }
  if (call.state === 'FLAGGED') {
    return `${lap}Flagged`;
  }
  if (call.state === 'DEFERRED') {
    return `${lap}Deferred`;
  }
  return `${lap}Decided`;
};

/**
 * A penalty against this driver reads loudest, an unresolved call next, and a
 * finding they were merely part of reads quietest — the ordering a steward
 * would apply themselves if the chips were plain text.
 *
 * Read off the record rather than off the configured tariff. `wasTarget` means
 * the decision named this driver, which is only ever true of a driver-scoped
 * call — so a past call is classified by what it says about itself, not by
 * looking up an action that may since have been renamed or deleted.
 */
const priorCallColor = (
  call: LivePriorCall,
): 'error' | 'warning' | 'info' | 'default' => {
  if (call.outcome && call.wasTarget) {
    return 'error';
  }
  if (call.state === 'FLAGGED') {
    return 'warning';
  }
  if (call.state === 'DEFERRED') {
    return 'info';
  }
  return 'default';
};

interface PriorCallsProps {
  entries: {
    driver: { steamId: string; displayName: string };
    calls: LivePriorCall[];
  }[];
}

/**
 * Every prior call this session against each party.
 *
 * Both parties are listed whenever either has history, because the comparison
 * is the point: "three against one of them and none against the other" is a
 * different situation from "one each", and a panel that only listed the driver
 * with a record would hide that.
 */
const PriorCalls: React.FC<PriorCallsProps> = ({ entries }) => (
  <Box sx={{ mt: 2 }}>
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{
        display: 'block',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        mb: 0.5,
      }}
    >
      Prior calls this session
    </Typography>
    <Stack spacing={0.75}>
      {entries.map(({ driver, calls }) => (
        <Stack
          key={driver.steamId}
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          data-testid={`prior-calls-${driver.steamId}`}
        >
          <Typography variant="body2" sx={{ minWidth: 168 }}>
            {driver.displayName}
          </Typography>
          {calls.length === 0 ? (
            <Typography variant="caption" color="text.secondary">
              None
            </Typography>
          ) : null}
          {calls.slice(0, PRIOR_CALL_LIMIT).map((call) => (
            <Tooltip
              key={call.decisionId}
              title={
                call.wasTarget
                  ? 'Called against this driver'
                  : 'A finding about an incident this driver was in'
              }
            >
              <Chip
                size="small"
                label={priorCallLabel(call)}
                color={priorCallColor(call)}
                // Filled where the call was against this driver, outlined where
                // they were only involved. The distinction has to survive being
                // read at a glance.
                variant={call.wasTarget ? 'filled' : 'outlined'}
                sx={{ height: 20, fontSize: 10 }}
              />
            </Tooltip>
          ))}
          {calls.length > PRIOR_CALL_LIMIT ? (
            <Typography variant="caption" color="text.secondary">
              +{calls.length - PRIOR_CALL_LIMIT} earlier
            </Typography>
          ) : null}
        </Stack>
      ))}
    </Stack>
  </Box>
);

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
  /**
   * Point the game's camera at a car.
   *
   * Optional, and absent means the button is not drawn. Two callers pass
   * nothing: the replay-side dossier, which has its own seek, and the live view
   * when the steward is reading a *finished* segment — there the camera would
   * swing to whoever holds that slot in the session running now, which is very
   * often a different driver and never the one in the incident. Hidden rather
   * than disabled, on the same reasoning as `onDefer` below.
   */
  onFocusCar?: (slotId: number | undefined) => void;
  /**
   * Rewind the game's picture to just before this incident.
   *
   * Optional and absent means the button is not drawn, on the same reasoning as
   * `onFocusCar`: the replay-side dossier already *is* the footage, and a
   * finished segment's elapsed times address a different session's replay
   * buffer, so the seek would land somewhere unrelated and look like it worked.
   *
   * Deliberately not offered on the queue rows. Selecting a row opens this
   * dossier — the same click — so a per-row button would be a second control
   * for the same act, paid for in MUI components on every one of up to four
   * hundred rows the queue keeps mounted.
   */
  onRewatch?: (incidentId: string) => void;
  onFlag: (incidentId: string) => void;
  /**
   * Records "this one is for post-session review", not "I ran out of time".
   *
   * Optional because the replay-side dossier reuses this component, and there
   * the steward *is* the post-session review — with the footage already on
   * screen there is nothing left to defer to. The action is hidden rather than
   * disabled: a control whose only honest tooltip is "you are already here"
   * should not be drawn.
   */
  onDefer?: (incidentId: string) => void;
  onDecide: (incidentId: string, outcome: string) => void;
  /** Which driver a penalty would be assigned to. */
  targetSteamId?: string;
  onSelectTarget: (steamId: string) => void;
  /**
   * Every call already made this session, indexed by driver. Optional so a
   * caller with no decision store — and the dossier's own tests — still render.
   */
  priorCallsByDriver?: Map<string, LivePriorCall[]>;
  /**
   * The optional explanation the next call will carry.
   *
   * Both props together or neither: the field is only drawn when there is
   * somewhere for the text to go. The replay dossier deliberately passes
   * neither — post-session reasoning is a prompt against the record being
   * revised, not a box bolted to the live footer, and wiring it here would
   * quietly overwrite the reasoning a live call already carries.
   */
  reasoning?: string;
  onChangeReasoning?: (next: string) => void;
  /**
   * Why this incident has no captured evidence, or absent when it has some.
   *
   * Set by the replay dossier for an incident the result log knows about and
   * live capture never saw — a session run before capture was switched on, or
   * one where the sidecar was not attached. Almost every incident in the
   * library is one of these.
   *
   * The panel is kept and the evidence half replaced, rather than the whole
   * dossier being withheld: the drivers, the tariff and the flag are all still
   * meaningful without a trace, and a steward looking at footage of a contact
   * on screen is in a better position to call it than the telemetry ever was.
   * A row of "—" where the measurements go would say the same thing far less
   * clearly.
   */
  evidenceUnavailable?: string;
}

export const LiveIncidentDossier: React.FC<LiveIncidentDossierProps> = ({
  incident,
  onFocusCar,
  onRewatch,
  onFlag,
  onDefer,
  onDecide,
  targetSteamId,
  onSelectTarget,
  priorCallsByDriver,
  reasoning,
  onChangeReasoning,
  evidenceUnavailable,
}) => {
  /*
    The tariff, taken resolved off the API context rather than held here.

    Both dossiers draw these buttons and both decide paths guard them, so the one
    place the league's list is resolved is `ApiContext` — this component does not
    know a shipped default exists. Read here rather than passed in so the two
    callers cannot pass different lists.
  */
  const { stewardActions } = useApi();

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

  /*
    This incident's own record is excluded: a dossier that listed the call the
    steward has just made on the incident in front of them as "prior" would be
    citing itself as precedent.
  */
  const priorCalls = useMemo(
    () =>
      incident
        ? incident.drivers.map((driver) => ({
            driver,
            calls: (priorCallsByDriver?.get(driver.steamId) ?? []).filter(
              (call) => call.incidentId !== incident.id,
            ),
          }))
        : [],
    [incident, priorCallsByDriver],
  );

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
        {/*
          No incident id here. It was the store's primary key —
          `live|{track}|{session}|{startedAt}#{sha1 of etSeconds|raw}` — and a
          steward could do nothing with it: no export column carries it, nothing
          in the app takes one as input, and the session half restated the
          header two rows above. What identifies an incident to a human is the
          time and lap on the right of this row and the drivers named below it.
          The key stays load-bearing in the store, where it belongs.
        */}
        <Typography variant="subtitle2" fontWeight={700}>
          Incident Dossier
        </Typography>
        <Box sx={{ flex: 1 }} />
        {/*
          One button, not two. There is no honest "enter replay mode" control to
          pair a seek with: entering replay on its own drops the steward at lap
          1, and a seek sent while the picture is live is inert. So the act
          offered is the one a steward actually wants — show me this moment —
          and main does the read-toggle-seek behind it.

          The picture lands five seconds early, the replay view's own lead-in, so
          the contact is approached rather than joined.
        */}
        {onRewatch ? (
          <Tooltip title="Rewind the game's picture to just before this incident. Timing and standings stay live, and the session keeps being captured.">
            <Button
              size="small"
              startIcon={<HistoryIcon />}
              onClick={() => onRewatch(incident.id)}
            >
              Rewatch
            </Button>
          </Tooltip>
        ) : null}
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
                {onFocusCar ? (
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
                ) : null}
              </Stack>
            );
          })}
        </Stack>

        {/*
          Everything from here to the prior calls is what live capture recorded,
          so with nothing captured there is nothing for any of it to say. One
          sentence replaces the lot — a raw-stream box holding the log's own
          text, three stat tiles reading "—" and five evidence rows doing the
          same is a panel that looks broken rather than empty.
        */}
        {evidenceUnavailable ? (
          <Box
            sx={{
              px: 1.5,
              py: 2,
              mb: 2,
              borderRadius: 1,
              backgroundColor: 'background.default',
              border: '1px dashed',
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
              No captured evidence
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {evidenceUnavailable}
            </Typography>
          </Box>
        ) : (
          <>
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
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 2 }}
              >
                Loading captured trace…
              </Typography>
            ) : null}
          </>
        )}

        {/*
          Placed last in the evidence, immediately above the tariff: it is the
          only thing on this panel that is not about this incident, and it is
          read at the moment of deciding rather than while working through the
          evidence. Drawn only when there is something to say — a "no prior
          calls" block on every dossier in a clean session is furniture.
        */}
        {priorCalls.some((entry) => entry.calls.length > 0) ? (
          <PriorCalls entries={priorCalls} />
        ) : null}

        {incident.state === 'DEFERRED' ? (
          <Box
            sx={{
              mt: 2,
              px: 1.5,
              py: 1.25,
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'info.main',
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
              Deferred
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              Held for post-session review
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Not counted as unreviewed. Deciding it here still works and
              replaces the deferral.
            </Typography>
          </Box>
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
            {/*
              The stored outcome, verbatim. A call made under an action that has
              since been renamed or removed still reads back correctly, because
              the record carries its own words rather than a key into a list.
            */}
            <Typography variant="body2" fontWeight={700}>
              {incident.decision}
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
        {/*
          Optional, and nothing below it is gated on it. A live call is made
          under time pressure and the call itself is what matters; the design
          docs are explicit that reasoning is prompted for properly during
          post-session review, so forcing it here would only teach stewards to
          type a full stop to unlock the buttons.

          It sits above the tariff because that is the order the work happens
          in, and it carries onto a flag or a deferral as well as a decision —
          "why I parked this" is worth as much as "why I called it".
        */}
        {onChangeReasoning ? (
          <TextField
            size="small"
            fullWidth
            value={reasoning ?? ''}
            onChange={(event) => onChangeReasoning(event.target.value)}
            placeholder="Reasoning (optional)"
            inputProps={{ 'aria-label': 'Reasoning (optional)' }}
          />
        ) : null}

        <Typography
          variant="caption"
          color={targetDriver ? 'warning.main' : 'text.secondary'}
        >
          {targetDriver
            ? `Penalty applies to ${targetDriver.displayName} #${targetDriver.carNumber}`
            : 'Select a driver above to assign a penalty'}
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {stewardActions.map((action, index) => {
            const shortcut = stewardActionShortcut(index);

            return (
              <Button
                key={action.id}
                size="small"
                /*
                  The action's own flag, not a guess from its text. A
                  league-defined penalty still refuses to be recorded against a
                  two-car incident with nobody named — the check the very first
                  live UI was missing.
                */
                disabled={action.driverScoped && !targetDriver}
                variant={
                  incident.decision === action.label ? 'contained' : 'outlined'
                }
                onClick={() => onDecide(incident.id, action.label)}
              >
                {action.label}
                {/* Past the ninth there is no key left to print. */}
                {shortcut ? (
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 0.75 }}
                  >
                    {shortcut}
                  </Typography>
                ) : null}
              </Button>
            );
          })}
        </Stack>
        {/*
          Two ways of not deciding, kept apart on purpose. A flag is a promise
          to come back before the chequered flag; a deferral is a decision that
          this one needs the full replay and is not going to be called live.
          Collapsing them would make an end-of-session "these are still open"
          list count deliberate hand-offs as unfinished work.
        */}
        <Stack direction="row" spacing={1} sx={{ alignSelf: 'flex-start' }}>
          <Button
            size="small"
            variant={incident.state === 'FLAGGED' ? 'contained' : 'outlined'}
            color="warning"
            startIcon={<FlagIcon />}
            onClick={() => onFlag(incident.id)}
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
          {onDefer ? (
            <Button
              size="small"
              variant={incident.state === 'DEFERRED' ? 'contained' : 'outlined'}
              color="info"
              startIcon={<ScheduleIcon />}
              onClick={() => onDefer(incident.id)}
            >
              Defer to post-session
              <Typography
                component="span"
                variant="caption"
                sx={{ ml: 0.75, opacity: 0.7 }}
              >
                D
              </Typography>
            </Button>
          ) : null}
        </Stack>
      </Stack>
    </Paper>
  );
};
