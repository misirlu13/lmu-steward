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
                <TableRow key={session.sessionKey} hover>
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
                          ? 'Counted again in every total'
                          : 'Keep the session but leave it out of every total'
                      }
                      placement="left"
                    >
                      <IconButton
                        size="small"
                        aria-label={
                          session.excluded
                            ? 'Include session in career totals'
                            : 'Exclude session from career totals'
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
