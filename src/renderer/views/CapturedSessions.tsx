import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { CONSTANTS } from '@constants';
import { LiveSessionMatchResult, LiveSessionSummary } from '@types';
import { ViewHeader } from '../components/Common/ViewHeader';
import { CapturedSessionRow } from '../components/CapturedSessions/CapturedSessionRow';
import { DeleteCapturedSessionDialog } from '../components/CapturedSessions/DeleteCapturedSessionDialog';
import { LinkReplayDialog } from '../components/CapturedSessions/LinkReplayDialog';
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
  const navigate = useNavigate();
  const { subscribeToApiChannel, liveCaptureEnabled } = useApi();
  const [sessions, setSessions] = useState<LiveSessionSummary[]>([]);
  const [pendingDelete, setPendingDelete] = useState<LiveSessionSummary | null>(
    null,
  );
  const [linking, setLinking] = useState<LiveSessionSummary | null>(null);
  const [matches, setMatches] = useState<LiveSessionMatchResult | null>(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchError, setMatchError] = useState('');
  const [selectedHash, setSelectedHash] = useState('');
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

  const applyMatches = useCallback((payload: unknown) => {
    const response = payload as {
      status?: string;
      message?: string;
      data?: LiveSessionMatchResult;
    };

    setMatchesLoading(false);

    if (response?.status === 'error') {
      setMatchError(response.message ?? 'Unable to look for a replay.');
      return;
    }

    setMatchError('');
    setMatches(response?.data ?? null);
    // The proposal starts selected so confirming a good match is one click,
    // while still being an explicit confirmation rather than an auto-link.
    setSelectedHash(response?.data?.proposed?.replayHash ?? '');
  }, []);

  const closeLinkDialog = useCallback(() => {
    setLinking(null);
    setMatches(null);
    setSelectedHash('');
    setMatchError('');
  }, []);

  const applyLinkResult = useCallback(
    (payload: unknown) => {
      applyList(payload);
      closeLinkDialog();
    },
    [applyList, closeLinkDialog],
  );

  useEffect(() => {
    const unsubscribeList = subscribeToApiChannel(
      CONSTANTS.API.GET_LIVE_SESSIONS,
      applyList,
    );
    const unsubscribeDelete = subscribeToApiChannel(
      CONSTANTS.API.POST_DELETE_LIVE_SESSION,
      applyList,
    );
    const unsubscribeMatches = subscribeToApiChannel(
      CONSTANTS.API.GET_LIVE_SESSION_MATCHES,
      applyMatches,
    );
    const unsubscribeLink = subscribeToApiChannel(
      CONSTANTS.API.POST_LINK_LIVE_SESSION,
      applyLinkResult,
    );
    const unsubscribeDismiss = subscribeToApiChannel(
      CONSTANTS.API.POST_DISMISS_LIVE_SESSION_MATCH,
      applyList,
    );

    sendMessage(CONSTANTS.API.GET_LIVE_SESSIONS);

    return () => {
      unsubscribeList();
      unsubscribeDelete();
      unsubscribeMatches();
      unsubscribeLink();
      unsubscribeDismiss();
    };
  }, [applyList, applyLinkResult, applyMatches, subscribeToApiChannel]);

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

  const openLinkDialog = (session: LiveSessionSummary) => {
    setLinking(session);
    setMatches(null);
    setSelectedHash('');
    setMatchError('');
    setMatchesLoading(true);
    sendMessage(CONSTANTS.API.GET_LIVE_SESSION_MATCHES, session.sessionKey);
  };

  const onConfirmLink = () => {
    if (!linking || !selectedHash) {
      return;
    }

    sendMessage(CONSTANTS.API.POST_LINK_LIVE_SESSION, {
      sessionKey: linking.sessionKey,
      replayHash: selectedHash,
      method:
        selectedHash === matches?.proposed?.replayHash ? 'roster' : 'manual',
    });
  };

  const onUnlink = () => {
    if (!linking) {
      return;
    }

    sendMessage(CONSTANTS.API.POST_LINK_LIVE_SESSION, {
      sessionKey: linking.sessionKey,
      replayHash: null,
    });
  };

  const onDismiss = () => {
    if (!linking) {
      return;
    }

    sendMessage(
      CONSTANTS.API.POST_DISMISS_LIVE_SESSION_MATCH,
      linking.sessionKey,
    );
    closeLinkDialog();
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
          <CapturedSessionRow
            key={session.sessionKey}
            session={session}
            isDeleting={deletingKey === session.sessionKey}
            onViewReplay={(replayHash) => navigate(`/replay/${replayHash}`)}
            onLinkReplay={openLinkDialog}
            onDelete={setPendingDelete}
          />
        ))}
      </Stack>

      <DeleteCapturedSessionDialog
        session={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={onConfirmDelete}
      />

      <LinkReplayDialog
        session={linking}
        matches={matches}
        loading={matchesLoading}
        error={matchError}
        selectedHash={selectedHash}
        onSelect={setSelectedHash}
        onCancel={closeLinkDialog}
        onConfirm={onConfirmLink}
        onUnlink={onUnlink}
        onDismiss={onDismiss}
      />
    </Box>
  );
};
