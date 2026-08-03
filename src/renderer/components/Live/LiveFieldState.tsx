import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import {
  LivePressureBattle,
  LiveSessionState,
  LiveStanding,
  findDriverBySteamId,
} from './liveFixtures';

const formatCountdown = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

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
  onFocusCar: (slotId: number | undefined) => void;
}

export const LiveFieldState: React.FC<LiveFieldStateProps> = ({
  session,
  standings,
  battles,
  captureLabel,
  isCaptureLive,
  onFocusCar,
}) => {
  // A heuristic, deliberately. LMU reports track limits as a running points
  // total whose relationship to mTrackLimitsStepsPerPenalty is not yet
  // understood, so this counts events rather than pretending to know how close
  // a driver is to a penalty. The previous rule compared a count of strikes
  // against a count of steps — different units, so nothing ever qualified.
  const watchlist = [...standings]
    .filter(
      (s) =>
        s.outstandingPenalties > 0 ||
        s.trackLimitStrikes >= 2 ||
        s.incidentCount >= 2,
    )
    .sort(
      (a, b) =>
        b.outstandingPenalties - a.outstandingPenalties ||
        b.incidentCount - a.incidentCount ||
        b.trackLimitStrikes - a.trackLimitStrikes,
    );

  const rankedBattles = [...battles].sort(
    (a, b) => b.closingSpeedKph - a.closingSpeedKph,
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
            {formatCountdown(session.timeRemainingSeconds)}
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
                    {driver.outstandingPenalties > 0 ? (
                      <Chip
                        size="small"
                        label={`${driver.outstandingPenalties} pen`}
                        color="error"
                        variant="outlined"
                        sx={{ height: 18, fontSize: 10 }}
                      />
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
              const ahead = findDriverBySteamId(battle.aheadSteamId);
              const behind = findDriverBySteamId(battle.behindSteamId);
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
