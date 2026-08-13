import React, { useMemo } from 'react';
import {
  Box,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { AiBadge } from '../Common/AiBadge';
import {
  LivePitStatus,
  LiveSectorTimes,
  LiveSessionState,
  LiveStanding,
} from './liveFixtures';

/** Nothing to show. Never a zero. */
const ABSENT = '—';

/**
 * How close two times have to be to count as the same time.
 *
 * LMU reports to the millisecond and the sector splits are subtractions of
 * floats, so an exact `===` would occasionally miss a driver's own best sector
 * by a rounding bit and drop the colour.
 */
const SAME_TIME = 0.0005;

/**
 * The standard timing-screen convention: session best in magenta, an
 * improvement on the driver's own reference in green.
 *
 * `qualifying.main` is already how this app draws a fastest lap, in the replay
 * standings and the lap-by-lap breakdown — so the timing screen inherits the
 * convention rather than introducing a second purple.
 */
type TimingTone = 'session-best' | 'personal-best' | 'plain';

const toneColor: Record<TimingTone, string> = {
  'session-best': 'qualifying.main',
  'personal-best': 'success.main',
  plain: 'text.primary',
};

const toneFor = (
  value?: number,
  personalReference?: number,
  sessionReference?: number,
): TimingTone => {
  if (value === undefined) {
    return 'plain';
  }
  if (sessionReference !== undefined && value <= sessionReference + SAME_TIME) {
    return 'session-best';
  }
  if (
    personalReference !== undefined &&
    value <= personalReference + SAME_TIME
  ) {
    return 'personal-best';
  }
  return 'plain';
};

/** Sector times are sub-minute, so they read as plain seconds. */
const formatSector = (seconds?: number): string =>
  seconds === undefined ? ABSENT : seconds.toFixed(3);

const pitStatusColor: Record<LivePitStatus, string> = {
  TRK: 'text.secondary',
  PIT: 'warning.main',
  GAR: 'error.main',
};

/**
 * The documented `mPitState` values, used for the tooltip only.
 *
 * Not a lookup the UI branches on: an undocumented 5 was the resting value on
 * 34 of 37 cars at a qualifying green, so anything outside this map falls
 * through to the raw number rather than being labelled.
 */
const pitStateDetail: Record<number, string> = {
  0: 'not pitting',
  1: 'stop requested',
  2: 'entering the pits',
  3: 'stopped in the box',
  4: 'leaving the pits',
};

const pitStateHint = (status: LivePitStatus, pitState?: number): string => {
  const base =
    status === 'GAR'
      ? 'In the garage stall.'
      : status === 'PIT'
        ? 'In the pit lane.'
        : 'On track.';
  if (pitState === undefined) {
    return base;
  }
  const detail = pitStateDetail[pitState];
  return `${base} LMU pit state ${pitState}${
    detail ? ` (${detail})` : ' — undocumented'
  }.`;
};

interface SessionReference {
  lap?: number;
  sectors: LiveSectorTimes;
}

/**
 * The fastest lap in the field and the fastest each sector has been run.
 *
 * Both are taken from every driver's best lap, and — importantly — from the
 * *whole* field rather than the filtered one. Narrowing to a class is a
 * question about which cars to look at, not a claim that the rest stopped
 * setting times, so a magenta sector keeps meaning "fastest in the session".
 */
const buildSessionReference = (standings: LiveStanding[]): SessionReference => {
  const fastest = (values: (number | undefined)[]): number | undefined => {
    const held = values.filter((value): value is number => value !== undefined);
    return held.length ? Math.min(...held) : undefined;
  };

  return {
    lap: fastest(standings.map((standing) => standing.bestLapSeconds)),
    sectors: [0, 1, 2].map((index) =>
      fastest(standings.map((standing) => standing.bestLapSectors[index])),
    ) as LiveSectorTimes,
  };
};

interface TimedCellProps {
  label: string;
  tone: TimingTone;
}

const TimedCell: React.FC<TimedCellProps> = ({ label, tone }) => (
  <TableCell
    // The tone is the whole point of the cell and it is carried in a colour,
    // which is not a thing a test can read honestly through jsdom. This is how
    // the convention stays under test.
    data-tone={tone}
    sx={{
      fontFamily: 'monospace',
      fontVariantNumeric: 'tabular-nums',
      color: toneColor[tone],
      fontWeight: tone === 'plain' ? 400 : 700,
      whiteSpace: 'nowrap',
    }}
  >
    {label}
  </TableCell>
);

interface LiveTimingTableProps {
  /** The whole field, in classification order. */
  standings: LiveStanding[];
  /** The rows to draw, once the class filter has been applied. */
  visibleStandings: LiveStanding[];
  session: LiveSessionState;
  onFocusCar: (slotId: number | undefined) => void;
}

/**
 * The timing screen.
 *
 * Two things about it are worth knowing before reading a column:
 *
 * **GAP and INT change meaning with the session type, deliberately.** In a race
 * they are LMU's own `mTimeBehindLeader` and `mTimeBehindNext`, which compose
 * exactly. Outside a race the field is ranked by best lap, so the car one place
 * higher is not the car ahead on track and those fields are meaningless — they
 * read 0.0 for most of an observed practice field, with a negative outlier — so
 * both columns become best-lap deltas, which is what a timing screen shows in
 * practice anyway. `buildStandings` makes that choice; this table only renders
 * it, and the column tooltips say which is on screen.
 *
 * **Green means "matched or beat the same sector on that driver's best lap"**,
 * not "personal best sector". LMU reports a true best S1, a *cumulative* best
 * S1+S2, and no best S3 at all, so a per-sector personal best does not exist in
 * the data for two of the three columns. One reference lap for all three is
 * consistent and checkable; mixing a true best S1 with derived S2 and S3 would
 * be wrong by hundredths and impossible to explain.
 */
const LiveTimingTableComponent: React.FC<LiveTimingTableProps> = ({
  standings,
  visibleStandings,
  session,
  onFocusCar,
}) => {
  const reference = useMemo(
    () => buildSessionReference(standings),
    [standings],
  );

  const isRace = session.sessionType === 'RACE';
  const gapHint = isRace
    ? 'Time behind the leader, as LMU classifies it.'
    : 'Best-lap delta to the fastest car. The field is ranked by best lap outside a race, so LMU’s own gap does not describe the track.';
  const intervalHint = isRace
    ? 'Time behind the car one place ahead.'
    : 'Best-lap delta to the car one place ahead.';

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
          py: 1.25,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Timing
        </Typography>
        <Box sx={{ flex: 1 }} />
        {/*
          The legend is not decoration. Both colours mean something specific and
          neither is the convention a steward might assume, so the screen says
          what it means where it is used.
        */}
        <Tooltip title="The fastest anyone has run this lap or sector, taken from every driver’s best lap.">
          <Chip
            size="small"
            label="Session best"
            variant="outlined"
            sx={{
              height: 20,
              fontSize: 10,
              color: 'qualifying.main',
              borderColor: 'qualifying.main',
            }}
          />
        </Tooltip>
        <Tooltip title="Matched or beat the same sector on that driver’s own best lap.">
          <Chip
            size="small"
            label="Best-lap pace"
            variant="outlined"
            sx={{
              height: 20,
              fontSize: 10,
              color: 'success.main',
              borderColor: 'success.main',
            }}
          />
        </Tooltip>
      </Stack>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table
          size="small"
          stickyHeader
          sx={{
            minWidth: 940,
            '& .MuiTableCell-stickyHeader': {
              backgroundColor: 'background.paper',
            },
            '& .MuiTableCell-root': { whiteSpace: 'nowrap' },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell>P</TableCell>
              <TableCell>Cls</TableCell>
              <TableCell>Driver</TableCell>
              <Tooltip title={gapHint}>
                <TableCell>Gap</TableCell>
              </Tooltip>
              <Tooltip title={intervalHint}>
                <TableCell>Int</TableCell>
              </Tooltip>
              <TableCell>Last</TableCell>
              <TableCell>S1</TableCell>
              <TableCell>S2</TableCell>
              <TableCell>S3</TableCell>
              <TableCell>Best</TableCell>
              <TableCell>Stat</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleStandings.map((standing) => (
              <TableRow
                hover
                key={standing.steamId}
                data-testid={`timing-row-${standing.steamId}`}
                onClick={() => onFocusCar(standing.slotId)}
                sx={{
                  cursor: 'pointer',
                  // A car in the pits is still in the classification, and still
                  // worth reading — just not racing anyone right now.
                  opacity: standing.pitStatus === 'TRK' ? 1 : 0.6,
                }}
              >
                <TableCell sx={{ fontWeight: 700 }}>
                  {standing.position}
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <CarClassBadge carClass={standing.carClass} />
                    <Typography variant="caption" color="text.secondary">
                      {standing.classPosition}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{ minWidth: 28 }}
                    >
                      #{standing.carNumber}
                    </Typography>
                    <Typography variant="body2" fontWeight={700}>
                      {standing.displayName}
                    </Typography>
                    {standing.isAiDriver ? <AiBadge /> : null}
                    {standing.outstandingPenalties > 0 ? (
                      <Tooltip title="Penalties the game is making this driver serve">
                        <Chip
                          size="small"
                          label={standing.outstandingPenalties}
                          color="error"
                          variant="outlined"
                          sx={{ height: 18, fontSize: 10 }}
                        />
                      </Tooltip>
                    ) : null}
                  </Stack>
                </TableCell>
                <TimedCell label={standing.gapToLeader} tone="plain" />
                <TimedCell label={standing.interval} tone="plain" />
                <TimedCell
                  label={standing.lastLap}
                  tone={toneFor(
                    standing.lastLapSeconds,
                    standing.bestLapSeconds,
                    reference.lap,
                  )}
                />
                {[0, 1, 2].map((index) => (
                  <TimedCell
                    key={index}
                    label={formatSector(standing.lastSectors[index])}
                    tone={toneFor(
                      standing.lastSectors[index],
                      standing.bestLapSectors[index],
                      reference.sectors[index],
                    )}
                  />
                ))}
                <TimedCell
                  label={standing.bestLap}
                  tone={toneFor(
                    standing.bestLapSeconds,
                    undefined,
                    reference.lap,
                  )}
                />
                <TableCell>
                  <Tooltip
                    title={pitStateHint(standing.pitStatus, standing.pitState)}
                  >
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color={pitStatusColor[standing.pitStatus]}
                    >
                      {standing.pitStatus}
                    </Typography>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {visibleStandings.length === 0 ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ px: 2, py: 3, textAlign: 'center' }}
          >
            {standings.length === 0
              ? 'No cars in the session yet.'
              : 'No cars in this class.'}
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
};

/**
 * Memoised because its parent re-renders at 5 Hz to move the track map's
 * markers, and none of the thirty-odd numbers in a row of this table changes
 * faster than 1 Hz.
 *
 * The parent is what makes this work: it hands the table the *unmerged*
 * standings and gives the merged ones to the map alone, so a position tick
 * leaves every prop here with the identity it had.
 */
export const LiveTimingTable = React.memo(LiveTimingTableComponent);
