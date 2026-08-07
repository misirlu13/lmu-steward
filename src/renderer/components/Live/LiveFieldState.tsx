import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Box, Chip, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import { formatSessionClock } from '../../hooks/useLiveSessionData';
import {
  LivePressureBattle,
  LiveSessionState,
  LiveStanding,
} from './liveFixtures';

interface SectionProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, children, action }) => (
  <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      sx={{ px: 2, pt: 1.5, pb: 1 }}
    >
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700 }}
      >
        {title}
      </Typography>
      <Box sx={{ flex: 1 }} />
      {action}
    </Stack>
    <Box sx={{ px: 2, pb: 1.5 }}>{children}</Box>
  </Box>
);

interface LiveFieldStateProps {
  session: LiveSessionState;
  standings: LiveStanding[];
  battles: LivePressureBattle[];
  captureLabel: string;
  isCaptureLive: boolean;
  /**
   * Penalties the steward has assigned this session, per driver identity.
   * Optional so the panel renders without a decision store behind it.
   */
  stewardPenaltiesByDriver?: Map<string, number>;
  onFocusCar: (slotId: number | undefined) => void;
}

/**
 * The Overview's field-state column: session clock, watchlist, pressure list,
 * standings.
 *
 * **The watchlist stays here.** The plan's file list said it "moves out to its
 * own panel" without naming a destination, and that line predates the sectioned
 * shell — so the call is made here rather than left for Step 9 to trip over.
 *
 * It belongs on Overview because the question it answers is a monitoring one:
 * *who should I be watching?* That is what Overview is for. The incidents view
 * answers the adjudication question — *has this driver been here before?* — and
 * now answers it properly, in the dossier's prior-calls list, against the two
 * drivers actually in front of the steward. A driver-level tally on that page
 * would compete with the dossier for the same attention and answer a question
 * nobody is asking mid-incident. `/live/incidents` also has no room for it: it
 * is a filter strip over two columns, and a third panel would take width from
 * the queue or the dossier, which is the clutter the whole shell exists to
 * undo.
 *
 * Step 9 promotes the pressure monitor out of here onto the timing view, which
 * leaves this panel as session + watchlist + field. That is a coherent column,
 * not a leftover.
 */
export const LiveFieldState: React.FC<LiveFieldStateProps> = ({
  session,
  standings,
  battles,
  captureLabel,
  isCaptureLive,
  stewardPenaltiesByDriver,
  onFocusCar,
}) => {
  const stewardPenaltiesFor = (steamId: string) =>
    stewardPenaltiesByDriver?.get(steamId) ?? 0;

  /*
    A heuristic, deliberately. LMU reports track limits as a running points
    total whose relationship to mTrackLimitsStepsPerPenalty is not yet
    understood, so this counts events rather than pretending to know how close
    a driver is to a penalty. The previous rule compared a count of strikes
    against a count of steps — different units, so nothing ever qualified.

    Two kinds of penalty are counted and they are kept apart on screen. The
    game's own `outstandingPenalties` is what a driver is being made to serve;
    the steward's tally is what has been called against them, which LMU knows
    nothing about and cannot show. Summing them would double-count a call the
    steward also entered in-game, and would make "who has been penalised" and
    "who is still serving something" impossible to tell apart.

    A steward's own call qualifies a driver on its own: a driver who has already
    been penalised this session is by definition one worth watching.
  */
  const watchlist = [...standings]
    .filter(
      (s) =>
        s.outstandingPenalties > 0 ||
        stewardPenaltiesFor(s.steamId) > 0 ||
        s.trackLimitStrikes >= 2 ||
        s.incidentCount >= 2,
    )
    .sort(
      (a, b) =>
        stewardPenaltiesFor(b.steamId) - stewardPenaltiesFor(a.steamId) ||
        b.outstandingPenalties - a.outstandingPenalties ||
        b.incidentCount - a.incidentCount ||
        b.trackLimitStrikes - a.trackLimitStrikes,
    );

  /*
    Already ordered by gap upstream, and deliberately not re-sorted here.
    Ranking by closing speed made rows swap places every second as the figure
    moved, which read as the panel thrashing rather than as cars racing.
  */
  const rankedBattles = battles;

  /*
    Resolved against the standings on screen, preferring slot over steam id.
    Steam id is 0 for every AI entry and every offline session, so a field of
    AI cars would otherwise collapse onto one driver. Falls back to steam id
    for the layout fixtures, which carry no slots.
  */
  const findBattleCar = (
    slotId: number | undefined,
    steamId: string | undefined,
  ) =>
    (slotId !== undefined
      ? standings.find((entry) => entry.slotId === slotId)
      : undefined) ??
    (steamId && steamId !== '0'
      ? standings.find((entry) => entry.steamId === steamId)
      : undefined);

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
      <Box sx={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <Section
          title="Session"
          action={
            <Chip
              size="small"
              label={captureLabel}
              color={isCaptureLive ? 'success' : 'default'}
              variant="outlined"
              sx={{ height: 20, fontSize: 10 }}
            />
          }
        >
          <Typography variant="h5" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatSessionClock(session.timeRemainingSeconds)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {session.lapsCompleted} laps · {session.serverName}
          </Typography>
        </Section>

        <Section title="Watchlist">
          {watchlist.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No drivers currently flagged.
            </Typography>
          ) : null}
          <Stack spacing={1}>
            {watchlist.map((driver) => {
              const summary = [
                `${driver.incidentCount} inc`,
                `${driver.trackLimitStrikes} limits`,
                driver.trackLimitPoints !== undefined
                  ? `${driver.trackLimitPoints.toFixed(2).replace(/\.?0+$/, '')} pts`
                  : undefined,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <Box
                  key={driver.steamId}
                  data-testid={`watchlist-${driver.steamId}`}
                  onClick={() => onFocusCar(driver.slotId)}
                  sx={{ cursor: 'pointer' }}
                >
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Typography variant="body2">
                      {driver.displayName}
                    </Typography>
                    {driver.isAiDriver ? <AiBadge /> : null}
                    <Typography variant="body2" color="text.secondary">
                      #{driver.carNumber}
                    </Typography>
                    <CarClassBadge carClass={driver.carClass} />
                    <Box sx={{ flex: 1 }} />
                    {stewardPenaltiesFor(driver.steamId) > 0 ? (
                      <Tooltip title="Penalties assigned by the steward this session">
                        <Chip
                          size="small"
                          label={`${stewardPenaltiesFor(driver.steamId)} steward`}
                          color="warning"
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      </Tooltip>
                    ) : null}
                    {driver.outstandingPenalties > 0 ? (
                      <Tooltip title="Penalties the game is making this driver serve">
                        <Chip
                          size="small"
                          label={`${driver.outstandingPenalties} in-game`}
                          color="error"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      </Tooltip>
                    ) : null}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {summary}
                  </Typography>
                </Box>
              );
            })}
          </Stack>
        </Section>

        <Section title="Pressure Monitor">
          <Stack spacing={1}>
            {rankedBattles.map((battle) => {
              const ahead = findBattleCar(
                battle.aheadSlotId,
                battle.aheadSteamId,
              );
              const behind = findBattleCar(
                battle.behindSlotId,
                battle.behindSteamId,
              );
              if (!ahead || !behind) {
                return null;
              }
              return (
                <Stack
                  key={battle.id}
                  direction="row"
                  alignItems="center"
                  spacing={0.75}
                  sx={{ cursor: 'pointer' }}
                  onClick={() => onFocusCar(behind.slotId)}
                >
                  {battle.isTraffic ? (
                    <WarningAmberIcon
                      sx={{ fontSize: 16, color: 'warning.main' }}
                    />
                  ) : (
                    <Box sx={{ width: 16 }} />
                  )}
                  <Typography variant="body2" color="text.secondary">
                    #{behind.carNumber}
                  </Typography>
                  <CarClassBadge carClass={behind.carClass} />
                  <Typography variant="caption" color="text.secondary">
                    on
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    #{ahead.carNumber}
                  </Typography>
                  <CarClassBadge carClass={ahead.carClass} />
                  <Box sx={{ flex: 1 }} />
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {battle.gapSeconds.toFixed(1)}s
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    +{battle.closingSpeedKph.toFixed(0)} kph
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        </Section>

        <Section title="Field">
          <Stack spacing={0.5}>
            {standings.map((driver) => (
              <Stack
                key={driver.steamId}
                direction="row"
                alignItems="center"
                spacing={0.75}
                onClick={() => onFocusCar(driver.slotId)}
                sx={{ cursor: 'pointer', opacity: driver.inPits ? 0.55 : 1 }}
              >
                <Typography
                  variant="caption"
                  sx={{ minWidth: 20, fontWeight: 700 }}
                >
                  {driver.position}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  #{driver.carNumber}
                </Typography>
                <CarClassBadge carClass={driver.carClass} />
                <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                  {driver.displayName}
                </Typography>
                {driver.inPits ? (
                  <Chip
                    size="small"
                    label="PIT"
                    variant="outlined"
                    sx={{ height: 18, fontSize: 10 }}
                  />
                ) : null}
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {driver.gapToLeader}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Section>
      </Box>
    </Paper>
  );
};
