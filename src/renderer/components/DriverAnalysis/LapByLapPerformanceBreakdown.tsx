import {
  Box,
  Chip,
  Paper,
  TableContainer,
  TablePagination,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { useEffect, useMemo, useState } from 'react';

export interface DriverLapBreakdownRow {
  lapNumber: number;
  standingLabel: string;
  lapTimeLabel: string;
  deltaToBestLabel: string;
  deltaToPreviousLabel: string;
  isFastestLap: boolean;
  hasTrackLimit: boolean;
  hasIncident: boolean;
  penaltyLabel: string | null;
}

interface LapByLapPerformanceBreakdownProps {
  rows: DriverLapBreakdownRow[];
}

const ROWS_PER_PAGE = 20;
type DeltaReferenceMode = 'best-lap' | 'previous-lap';

const getDeltaColor = (deltaLabel: string) => {
  if (deltaLabel === '--') {
    return 'text.secondary';
  }

  const deltaValue = Number(deltaLabel);
  if (Number.isFinite(deltaValue) && deltaValue === 0) {
    return 'text.primary';
  }

  return deltaLabel.startsWith('+') ? 'error.main' : 'success.main';
};

export const LapByLapPerformanceBreakdown: React.FC<
  LapByLapPerformanceBreakdownProps
> = ({ rows }) => {
  const [page, setPage] = useState(0);
  const [deltaReferenceMode, setDeltaReferenceMode] =
    useState<DeltaReferenceMode>('best-lap');

  const orderedRows = useMemo(
    () => [...rows].sort((left, right) => left.lapNumber - right.lapNumber),
    [rows],
  );

  const pagedRows = useMemo(() => {
    const start = page * ROWS_PER_PAGE;
    return orderedRows.slice(start, start + ROWS_PER_PAGE);
  }, [orderedRows, page]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(orderedRows.length / ROWS_PER_PAGE) - 1);
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [orderedRows.length, page]);

  return (
    <Paper
      variant="outlined"
      sx={{
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="subtitle1" fontWeight={700}>
          Lap-by-Lap Performance Breakdown
        </Typography>

        <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap">
          <ToggleButtonGroup
            exclusive
            size="small"
            value={deltaReferenceMode}
            onChange={(_, nextValue: DeltaReferenceMode | null) => {
              if (!nextValue) {
                return;
              }

              setDeltaReferenceMode(nextValue);
            }}
          >
            <ToggleButton value="best-lap">Best Lap</ToggleButton>
            <ToggleButton value="previous-lap">Previous Lap</ToggleButton>
          </ToggleButtonGroup>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <WarningAmberIcon sx={{ fontSize: 14, color: 'warning.main' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Track Limits
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <ReportProblemIcon sx={{ fontSize: 14, color: 'error.main' }} />
            <Typography variant="caption" color="text.secondary" fontWeight={700}>
              Incidents
            </Typography>
          </Stack>
          <Typography variant="caption" color="secondary.main" fontWeight={700}>
            Penalties
          </Typography>
        </Stack>
      </Stack>

      <TableContainer
        sx={{
          maxHeight: 900,
          overflow: 'auto',
        }}
      >
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead>
            <TableRow>
              <TableCell>Lap #</TableCell>
              <TableCell>Standing</TableCell>
              <TableCell>Lap Time</TableCell>
              <TableCell>
                {deltaReferenceMode === 'best-lap'
                  ? 'Delta (Best Lap)'
                  : 'Delta (Previous Lap)'}
              </TableCell>
              <TableCell align="center">Track Limits</TableCell>
              <TableCell align="center">Incidents</TableCell>
              <TableCell align="center">Penalties</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.length ? (
              pagedRows.map((row) => (
                <TableRow key={row.lapNumber} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    {row.lapNumber}
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{row.standingLabel}</TableCell>
                  <TableCell
                    sx={{
                      fontFamily: 'monospace',
                      color: row.isFastestLap ? 'qualifying.main' : 'text.primary',
                      fontWeight: row.isFastestLap ? 700 : 400,
                    }}
                  >
                    {row.lapTimeLabel}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontFamily: 'monospace',
                      color: getDeltaColor(
                        deltaReferenceMode === 'best-lap'
                          ? row.deltaToBestLabel
                          : row.deltaToPreviousLabel,
                      ),
                    }}
                  >
                    {deltaReferenceMode === 'best-lap'
                      ? row.deltaToBestLabel
                      : row.deltaToPreviousLabel}
                  </TableCell>
                  <TableCell align="center">
                    {row.hasTrackLimit ? (
                      <WarningAmberIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {row.hasIncident ? (
                      <ReportProblemIcon sx={{ fontSize: 16, color: 'error.main' }} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {row.penaltyLabel ? (
                      <Chip
                        size="small"
                        color="secondary"
                        variant="outlined"
                        label={row.penaltyLabel}
                        sx={{ fontWeight: 700 }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        -
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7}>
                  <Typography variant="body2" color="text.secondary">
                    No lap telemetry available for this driver.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={orderedRows.length}
        page={page}
        onPageChange={(_, nextPage) => setPage(nextPage)}
        rowsPerPage={ROWS_PER_PAGE}
        rowsPerPageOptions={[ROWS_PER_PAGE]}
      />
    </Paper>
  );
};
