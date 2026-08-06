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
import { CONSTANTS } from '@constants';
import { LiveSessionSummary } from '@types';
import { ViewHeader } from '../components/Common/ViewHeader';
import { DeleteCapturedSessionDialog } from '../components/CapturedSessions/DeleteCapturedSessionDialog';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';

/**
 * Sessions recorded by live capture.
 *
 * Its own view rather than a section of the replay list: the two are unrelated
 * collections, and sitting inside the replay list meant inheriting its
 * pagination and filters, which apply to neither.
 *
 * Deliberately minimal, and deliberately not a place to do stewarding. It
 * exists so captured evidence is visible and removable rather than sitting
 * invisibly on disk.
 */
export const CapturedSessionsView = () => {
  const { subscribeToApiChannel, liveCaptureEnabled } = useApi();
  const [sessions, setSessions] = useState<LiveSessionSummary[]>([]);
  const [pendingDelete, setPendingDelete] = useState<LiveSessionSummary | null>(
    null,
  );
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
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
    setDeletingKey(null);
  }, []);

  useEffect(() => {
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
  }, [applyList, subscribeToApiChannel]);

  const onConfirmDelete = () => {
    if (!pendingDelete) {
      return;
    }

    setDeletingKey(pendingDelete.sessionKey);
    sendMessage(
      CONSTANTS.API.POST_DELETE_LIVE_SESSION,
      pendingDelete.sessionKey,
    );
    setPendingDelete(null);
  };

  return (
    <Box>
      <ViewHeader
        title="Captured Sessions"
        subtitle="Sessions recorded by live capture, with the evidence a replay cannot rebuild."
      />

      {error ? (
        <Typography variant="caption" color="error.main">
          {error}
        </Typography>
      ) : null}

      <Stack spacing={1.5} sx={{ mt: 2 }}>
        {/*
          Reached directly by URL as well as by the nav link, so the disabled
          case explains itself rather than showing an empty page.
        */}
        {!liveCaptureEnabled && sessions.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}
          >
            <Typography variant="body2" color="text.secondary">
              Live capture is turned off, so nothing is being recorded. Turn it
              on under Experimental Features in User Settings.
            </Typography>
          </Paper>
        ) : null}

        {liveCaptureEnabled && sessions.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 3 }}
          >
            <Typography variant="body2" color="text.secondary">
              Nothing captured yet. Sessions appear here once live capture
              records one.
            </Typography>
          </Paper>
        ) : null}

        {sessions.map((session) => (
          <Paper
            key={session.sessionKey}
            variant="outlined"
            sx={{ borderColor: 'divider', borderRadius: 1, p: 2 }}
          >
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Typography variant="body1" noWrap>
                  {session.trackName || 'Unknown track'}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {session.sessionType ?? 'Session'} ·{' '}
                  {new Date(session.startedAt).toLocaleString()} ·{' '}
                  {session.driverCount} drivers
                </Typography>
              </Box>

              <Tooltip title="Incidents captured">
                <Chip
                  size="small"
                  label={`${session.incidentCount} incidents`}
                />
              </Tooltip>
              {/*
                Called out separately because it is the only part a replay
                cannot rebuild: traces exist nowhere else once this is deleted.
              */}
              <Tooltip title="Incidents with a recorded trace">
                <Chip
                  size="small"
                  color={session.evidenceCount > 0 ? 'primary' : 'default'}
                  label={`${session.evidenceCount} with evidence`}
                />
              </Tooltip>

              <Button
                size="small"
                color="error"
                startIcon={<DeleteOutlineIcon />}
                disabled={deletingKey === session.sessionKey}
                onClick={() => setPendingDelete(session)}
              >
                {deletingKey === session.sessionKey ? 'Deleting…' : 'Delete'}
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>

      <DeleteCapturedSessionDialog
        session={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={onConfirmDelete}
      />
    </Box>
  );
};
