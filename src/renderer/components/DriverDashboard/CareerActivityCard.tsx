import { Box, Card, CardContent, Tooltip, Typography } from '@mui/material';
import { CareerAggregate } from '@types';
import { formatDate, formatDecimal } from './careerFormat';

interface CareerActivityCardProps {
  aggregate: CareerAggregate;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_SECONDS = 86400;
/** A year of weeks, which is as far back as a calendar strip stays readable. */
const CALENDAR_WEEKS = 53;

/**
 * Activity as a calendar of weeks, drawn rather than charted — the app has no
 * charting dependency and builds its own visuals elsewhere.
 */
const Calendar = ({
  byDay,
}: {
  byDay: { day: number; sessions: number }[];
}) => {
  if (!byDay.length) {
    return null;
  }

  const counts = new Map(byDay.map((entry) => [entry.day, entry.sessions]));
  const peak = Math.max(...byDay.map((entry) => entry.sessions));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Start on the Sunday that opens the earliest week shown.
  const start = new Date(today);
  start.setDate(start.getDate() - CALENDAR_WEEKS * 7 - today.getDay());

  const weeks = Array.from({ length: CALENDAR_WEEKS + 1 }, (_unused, week) =>
    Array.from({ length: 7 }, (_ignored, weekday) => {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + weekday);
      const day = Math.floor(date.getTime() / 1000);
      return { day, sessions: counts.get(day) ?? 0, future: date > today };
    }),
  );

  return (
    <Box sx={{ mt: 1, overflowX: 'auto' }}>
      <Box sx={{ display: 'flex', gap: '2px' }}>
        {weeks.map((week) => (
          <Box
            key={week[0].day}
            sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
          >
            {week.map((cell) => (
              <Tooltip
                key={cell.day}
                title={
                  cell.future
                    ? ''
                    : `${cell.sessions} on ${formatDate(cell.day)}`
                }
                placement="top"
              >
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: '2px',
                    backgroundColor: cell.sessions
                      ? 'primary.main'
                      : 'background.alt',
                    opacity: cell.future
                      ? 0
                      : cell.sessions
                        ? 0.3 + 0.7 * (cell.sessions / peak)
                        : 1,
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
};

const Bars = ({
  values,
  labelFor,
  title,
}: {
  values: number[];
  labelFor: (index: number) => string;
  title: string;
}) => {
  const peak = Math.max(1, ...values);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="caption" color="text.secondary">
        {title}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '2px',
          height: 48,
          mt: 0.5,
        }}
      >
        {values.map((value, index) => (
          <Tooltip
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            title={`${labelFor(index)} · ${value}`}
            placement="top"
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 4,
                height: `${Math.max(3, (value / peak) * 100)}%`,
                borderRadius: '2px 2px 0 0',
                backgroundColor: 'primary.main',
                opacity: value ? 0.75 : 0.2,
              }}
            />
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
};

export const CareerActivityCard = ({ aggregate }: CareerActivityCardProps) => {
  const { activity } = aggregate;

  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Habits
          </Typography>
          {activity.practicePerRace !== null ? (
            <Tooltip
              title="How many practice sessions you run for each race you enter"
              placement="left"
            >
              <Typography variant="caption" color="text.secondary">
                {formatDecimal(activity.practicePerRace, 1)} practice sessions
                per race
              </Typography>
            </Tooltip>
          ) : null}
        </Box>

        <Calendar byDay={activity.byDay} />

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ flex: '1 1 240px' }}>
            <Bars
              values={activity.byHour}
              labelFor={(hour) => `${String(hour).padStart(2, '0')}:00`}
              title="By hour of day"
            />
          </Box>
          <Box sx={{ flex: '1 1 200px' }}>
            <Bars
              values={activity.byWeekday}
              labelFor={(day) => WEEKDAYS[day]}
              title="By day of week"
            />
          </Box>
        </Box>

        {activity.aidUsage.length ? (
          <Box sx={{ mt: 1.5 }}>
            {/*
              Aid usage over time. `ControlAndAids` records the level, so a
              driver moving from ABS=2 to ABS=1 to none shows up as three
              entries with the last one ending — a progression no sim tracks.
            */}
            <Typography variant="caption" color="text.secondary">
              Driver aids used
            </Typography>
            {activity.aidUsage.slice(0, 6).map((entry) => (
              <Box
                key={entry.aid}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  py: 0.25,
                }}
              >
                <Typography variant="body2">{entry.aid}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {entry.sessions} sessions · last{' '}
                  {formatDate(entry.lastSeenAt)}
                </Typography>
              </Box>
            ))}
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
};

export const CAREER_ACTIVITY_DAY_SECONDS = DAY_SECONDS;
