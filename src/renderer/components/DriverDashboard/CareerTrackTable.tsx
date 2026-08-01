import { useMemo, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Tooltip,
  Typography,
} from '@mui/material';
import { CareerTrackSummary } from '@types';
import {
  formatCount,
  formatDate,
  formatDecimal,
  formatDistance,
  formatFieldPercentile,
  formatLapTime,
} from './careerFormat';

interface CareerTrackTableProps {
  tracks: CareerTrackSummary[];
}

type SortKey =
  | 'trackVenue'
  | 'sessions'
  | 'races'
  | 'wins'
  | 'bestClassGridPos'
  | 'bestClassFinishPos'
  | 'bestLapSec'
  | 'averageFinishPercentile'
  | 'incidentsPer100Km'
  | 'lastRacedAt';

const COLUMNS: {
  key: SortKey;
  label: string;
  numeric: boolean;
  hint?: string;
}[] = [
  { key: 'trackVenue', label: 'Track', numeric: false },
  { key: 'sessions', label: 'Sessions', numeric: true },
  { key: 'races', label: 'Races', numeric: true },
  { key: 'wins', label: 'Wins', numeric: true },
  {
    key: 'bestClassGridPos',
    label: 'Best qual',
    numeric: true,
    hint: 'Best class qualifying position',
  },
  {
    key: 'bestClassFinishPos',
    label: 'Best finish',
    numeric: true,
    hint: 'Best class finishing position',
  },
  { key: 'bestLapSec', label: 'PB lap', numeric: true },
  {
    key: 'averageFinishPercentile',
    label: 'Field position',
    numeric: true,
    hint: 'Average finish as a share of the class field — 8th of 40 beats 5th of 6. Needs three races.',
  },
  {
    key: 'incidentsPer100Km',
    label: 'Inc / 100 km',
    numeric: true,
    hint: 'Incidents measured against distance driven at this track',
  },
  { key: 'lastRacedAt', label: 'Last driven', numeric: true },
];

/** Nulls sort last whichever way the column is pointed. */
const compare = (
  left: CareerTrackSummary,
  right: CareerTrackSummary,
  key: SortKey,
  direction: 'asc' | 'desc',
): number => {
  const a = left[key];
  const b = right[key];

  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  const result =
    typeof a === 'string' && typeof b === 'string'
      ? a.localeCompare(b)
      : Number(a) - Number(b);

  return direction === 'asc' ? result : -result;
};

export const CareerTrackTable = ({ tracks }: CareerTrackTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>('sessions');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(
    () =>
      [...tracks].sort((left, right) =>
        compare(left, right, sortKey, direction),
      ),
    [tracks, sortKey, direction],
  );

  /*
   * Strongest and weakest are ranked on field position, and only among tracks
   * with enough races to mean anything — the aggregate leaves the rest null.
   */
  const ranked = useMemo(
    () => tracks.filter((track) => track.averageFinishPercentile !== null),
    [tracks],
  );
  const strongest = ranked.length
    ? ranked.reduce((best, track) =>
        (track.averageFinishPercentile ?? 1) <
        (best.averageFinishPercentile ?? 1)
          ? track
          : best,
      )
    : null;
  const weakest = ranked.length
    ? ranked.reduce((worst, track) =>
        (track.averageFinishPercentile ?? 0) >
        (worst.averageFinishPercentile ?? 0)
          ? track
          : worst,
      )
    : null;

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection(direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortKey(key);
    setDirection(key === 'trackVenue' ? 'asc' : 'desc');
  };

  return (
    <Card>
      <CardContent>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            mb: 1,
          }}
        >
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Track mastery
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {strongest && strongest !== weakest ? (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                label={`Strongest: ${strongest.trackVenue}`}
              />
            ) : null}
            {weakest && weakest !== strongest ? (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`Weakest: ${weakest.trackVenue}`}
              />
            ) : null}
          </Box>
        </Box>

        {tracks.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No tracks recorded yet.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <TableCell
                      key={column.key}
                      align={column.numeric ? 'right' : 'left'}
                      sortDirection={sortKey === column.key ? direction : false}
                    >
                      <Tooltip title={column.hint ?? ''} placement="top">
                        <TableSortLabel
                          active={sortKey === column.key}
                          direction={sortKey === column.key ? direction : 'asc'}
                          onClick={() => onSort(column.key)}
                        >
                          {column.label}
                        </TableSortLabel>
                      </Tooltip>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sorted.map((track) => (
                  <TableRow
                    key={`${track.trackFolder}|${track.trackLayout}`}
                    hover
                  >
                    <TableCell>
                      <Typography variant="body2">
                        {track.trackVenue || track.trackFolder || 'Unknown'}
                      </Typography>
                      {/*
                        The layout, not just the venue: one folder holds several
                        and their lap times are not comparable.
                      */}
                      <Typography variant="caption" color="text.secondary">
                        {track.trackLayout} · {formatDistance(track.distanceKm)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{track.sessions}</TableCell>
                    <TableCell align="right">{track.races}</TableCell>
                    <TableCell align="right">{track.wins}</TableCell>
                    <TableCell align="right">
                      {track.bestClassGridPos
                        ? `P${track.bestClassGridPos}`
                        : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {track.bestClassFinishPos
                        ? `P${track.bestClassFinishPos}`
                        : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {formatLapTime(track.bestLapSec)}
                    </TableCell>
                    <TableCell align="right">
                      {track.averageFinishPercentile === null ? (
                        <Tooltip title="Needs three races" placement="left">
                          <span>—</span>
                        </Tooltip>
                      ) : (
                        formatFieldPercentile(track.averageFinishPercentile)
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {formatDecimal(track.incidentsPer100Km, 1)}
                    </TableCell>
                    <TableCell align="right">
                      {formatDate(track.lastRacedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          {formatCount(tracks.length)} layouts driven
        </Typography>
      </CardContent>
    </Card>
  );
};
