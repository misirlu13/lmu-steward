import { Box, Paper, Stack, Tooltip, Typography } from '@mui/material';
import {
  formatSessionClock,
  formatTimeOfDay,
  summariseWeather,
} from '../../hooks/useLiveSessionData';
import { LiveSessionState } from './liveFixtures';

/** Nothing to show. Never a zero — an absent field is not a measurement. */
const ABSENT = '—';

interface HeaderFactProps {
  label: string;
  value: string;
  hint?: string;
}

/**
 * One reading in the strip.
 *
 * Denser than `StatDisplay`, which is sized for the dashboard's headline
 * numbers: this row carries eight or nine facts and has to survive next to the
 * nav rail without wrapping on a normal window.
 */
const HeaderFact: React.FC<HeaderFactProps> = ({ label, value, hint }) => {
  const fact = (
    <Box sx={{ minWidth: 72 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: 'block',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          lineHeight: 1.4,
        }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={700}
        color={value === ABSENT ? 'text.secondary' : 'text.primary'}
        sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      >
        {value}
      </Typography>
    </Box>
  );

  return hint ? (
    <Tooltip title={hint}>
      <Box>{fact}</Box>
    </Tooltip>
  ) : (
    fact
  );
};

interface LiveSessionHeaderProps {
  session: LiveSessionState;
  /** Every class in the field with its car count, as the provider derives it. */
  fieldByClass: { carClass: string; count: number }[];
  driverCount: number;
}

/**
 * The session's general information, above every live section.
 *
 * It belongs to the shell rather than to one route because it answers the
 * ambient questions — what session is this, what time is it, how much is left,
 * what is the weather doing — and a steward adjudicating an incident needs
 * those as much as one reading the timing screen does.
 *
 * The track name is not repeated here: it is already the shell's title, a line
 * above. Everything else follows the ordering the mockups settle on.
 *
 * **Every field degrades to `—`.** The sidecar that reads the conditions is a
 * local build artifact that is not committed, so a machine that has not built
 * it is the default case rather than an edge case, and this strip has to stay
 * readable with half of it empty.
 */
export const LiveSessionHeader: React.FC<LiveSessionHeaderProps> = ({
  session,
  fieldByClass,
  driverCount,
}) => {
  const timeOfDay = formatTimeOfDay(session.timeOfDay);
  const weather = summariseWeather(session);

  return (
    <Paper
      variant="outlined"
      sx={{ borderColor: 'divider', borderRadius: 2, px: 2, py: 1, mb: 2 }}
      aria-label="Session information"
    >
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
        divider={
          <Box
            sx={{
              width: '1px',
              alignSelf: 'stretch',
              backgroundColor: 'divider',
            }}
          />
        }
      >
        <HeaderFact label="Session" value={session.sessionType} />
        <HeaderFact
          label="Time of day"
          value={timeOfDay ?? ABSENT}
          hint="In-game time of day, as the session reports it."
        />
        <HeaderFact
          label="Remaining"
          value={formatSessionClock(session.timeRemainingSeconds)}
        />
        <HeaderFact
          label="Laps"
          value={
            session.lapsCompleted > 0 ? String(session.lapsCompleted) : ABSENT
          }
          hint="Laps completed by the car furthest through the session. LMU does not report a scheduled lap count, so there is no total to show against it."
        />
        <HeaderFact
          label="Air"
          value={
            session.ambientTempC === undefined
              ? ABSENT
              : `${session.ambientTempC.toFixed(1)}°C`
          }
        />
        <HeaderFact
          label="Track"
          value={
            session.trackTempC === undefined
              ? ABSENT
              : `${session.trackTempC.toFixed(1)}°C`
          }
        />
        <HeaderFact
          label="Weather"
          value={weather ?? ABSENT}
          hint="Derived from rain severity and wetness on the racing line. Deliberately three states and no severity bands — nothing observed so far has been wet enough to say where the boundaries sit."
        />
        <HeaderFact
          label="Field"
          value={driverCount > 0 ? `${driverCount} cars` : ABSENT}
        />

        {/*
          Per-class counts as their own facts rather than one crowded string, so
          a multi-class field reads at a glance and a single-class one costs
          nothing.
        */}
        {fieldByClass.map((entry) => (
          <HeaderFact
            key={entry.carClass}
            label={entry.carClass}
            value={String(entry.count)}
          />
        ))}
      </Stack>
    </Paper>
  );
};
