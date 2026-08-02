import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { CareerSessionRecord } from '@types';
import { formatDate, formatLapTime } from './careerFormat';

interface CareerRecentSessionsProps {
  sessions: CareerSessionRecord[];
  onToggleExcluded: (sessionKey: string, excluded: boolean) => void;
}

const SESSION_LABEL: Record<string, string> = {
  RACE: 'Race',
  QUALIFY: 'Qualifying',
  PRACTICE: 'Practice',
};

export const CareerRecentSessions = ({
  sessions,
  onToggleExcluded,
}: CareerRecentSessionsProps) => {
  if (!sessions.length) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Recent sessions
        </Typography>

        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Track</TableCell>
                <TableCell>Session</TableCell>
                <TableCell>Car</TableCell>
                <TableCell align="right">Grid</TableCell>
                <TableCell align="right">Finish</TableCell>
                <TableCell align="right">Best lap</TableCell>
                <TableCell align="right">Incidents</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((session) => (
                <TableRow
                  key={session.sessionKey}
                  hover
                  /*
                    An excluded session stays in the table — this list is the
                    only place the exclusion can be undone — so it is dimmed
                    rather than removed, and its own toggle stays at full
                    strength so it remains obviously clickable.
                  */
                  sx={session.excluded ? { opacity: 0.45 } : undefined}
                >
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(session.startedAt)}
                    </Typography>
                    {/*
                      A session whose log has gone is still here, and says so.
                      That is the promise the whole feature rests on.
                    */}
                    {!session.filePresent ? (
                      <Tooltip
                        title="The result log for this session is no longer on disk. The session is kept."
                        placement="right"
                      >
                        <Typography variant="caption" color="text.secondary">
                          file gone
                        </Typography>
                      </Tooltip>
                    ) : null}
                    {session.excluded ? (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        excluded
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {session.trackVenue || session.trackFolder}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {session.trackLayout}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={
                        SESSION_LABEL[session.sessionType] ??
                        session.sessionType
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" noWrap>
                      {session.carType}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {session.carClass}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {session.classGridPos ? `P${session.classGridPos}` : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {session.classFinishPos
                      ? `P${session.classFinishPos}`
                      : '—'}
                  </TableCell>
                  <TableCell align="right">
                    {formatLapTime(session.bestLapSec)}
                  </TableCell>
                  <TableCell align="right">{session.incidentsCaused}</TableCell>
                  <TableCell align="right">
                    <Tooltip
                      title={
                        session.excluded
                          ? 'Excluded — this session counts towards nothing. Click to count it again.'
                          : 'Counted in every total. Click to keep the session but leave it out of them.'
                      }
                      placement="left"
                    >
                      <IconButton
                        size="small"
                        color={session.excluded ? 'default' : 'primary'}
                        aria-label={
                          session.excluded
                            ? 'Include session in career totals'
                            : 'Exclude session from career totals'
                        }
                        aria-pressed={session.excluded}
                        // Undimmed, so the way back is never faint.
                        sx={
                          session.excluded ? { opacity: 1 / 0.45 } : undefined
                        }
                        onClick={() =>
                          onToggleExcluded(
                            session.sessionKey,
                            !session.excluded,
                          )
                        }
                      >
                        {session.excluded ? (
                          <VisibilityOffRoundedIcon fontSize="small" />
                        ) : (
                          <VisibilityRoundedIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </CardContent>
    </Card>
  );
};
