import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import { CONSTANTS } from '@constants';
import { LiveSessionSummary } from '@types';
import { sendMessage } from '../../utils/postMessage';
import { useApi } from '../../providers/ApiContext';

interface Props {
  /** Hidden entirely when live capture is off; there is nothing to accumulate. */
  enabled: boolean;
}

/**
 * Sessions recorded by live capture.
 *
 * Deliberately minimal, and deliberately not a place to do stewarding: it
 * exists so captured evidence is visible and removable rather than sitting
 * invisibly on disk. Anything more belongs on the replay view.
 */
export const CapturedSessions = ({ enabled }: Props) => {
  const { subscribeToApiChannel } = useApi();
  const [sessions, setSessions] = useState<LiveSessionSummary[]>([]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState('');

  const applyList = useCallback((payload: unknown) => {
    const response = payload as {
      status?: string;
      message?: string;
      data?: LiveSessionSummary[];
    };

    if (Array.isArray(response?.data)) {
      setSessions(response.data);
    }

    setError(response?.status === 'error' ? (response.message ?? '') : '');
    setPendingKey(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const unsubscribeList = subscribeToApiChannel(
      CONSTANTS.API.GET_LIVE_SESSIONS,
      applyList,
    );
    const unsubscribeDelete = subscribeToApiChannel(
      CONSTANTS.API.POST_DELETE_LIVE_SESSION,
      applyList,
    );

    sendMessage(CONSTANTS.API.GET_LIVE_SESSIONS);

    return () => {
      unsubscribeList();
      unsubscribeDelete();
    };
  }, [applyList, enabled, subscribeToApiChannel]);

  if (!enabled) {
    return null;
  }

  const onDelete = (sessionKey: string) => {
    setPendingKey(sessionKey);
    sendMessage(CONSTANTS.API.POST_DELETE_LIVE_SESSION, sessionKey);
  };

  return (
    <Paper
      variant="outlined"
      sx={{ borderColor: 'divider', borderRadius: 1, p: 2, mt: 2 }}
    >
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <SensorsRoundedIcon sx={{ fontSize: 18 }} />
          <Typography variant="subtitle2" fontWeight={700}>
            Captured Sessions
          </Typography>
          <Chip size="small" label={sessions.length} />
        </Stack>

        {error ? (
          <Typography variant="caption" color="error.main">
            {error}
          </Typography>
        ) : null}

        {sessions.length === 0 ? (
          <Typography variant="caption" color="text.secondary">
            Nothing captured yet. Sessions appear here once live capture records
            one.
          </Typography>
        ) : (
          sessions.map((session) => (
            <Stack
              key={session.sessionKey}
              direction="row"
              alignItems="center"
              spacing={1.5}
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                px: 1.5,
                py: 1,
              }}
            >
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="body2" noWrap>
                  {session.trackName || 'Unknown track'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {session.sessionType ?? 'Session'} ·{' '}
                  {new Date(session.startedAt).toLocaleString()} ·{' '}
                  {session.driverCount} drivers
                </Typography>
              </Box>

              <Tooltip title="Incidents captured">
                <Chip size="small" label={`${session.incidentCount} inc`} />
              </Tooltip>
              {/*
                Called out separately because it is the only part a replay
                cannot rebuild: traces exist nowhere else once this is deleted.
              */}
              <Tooltip title="Incidents with a captured trace">
                <Chip
                  size="small"
                  color={session.evidenceCount > 0 ? 'primary' : 'default'}
                  label={`${session.evidenceCount} evidence`}
                />
              </Tooltip>

              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlineIcon />}
                disabled={pendingKey === session.sessionKey}
                onClick={() => onDelete(session.sessionKey)}
              >
                {pendingKey === session.sessionKey ? 'Deleting…' : 'Delete'}
              </Button>
            </Stack>
          ))
        )}
      </Stack>
    </Paper>
  );
};
