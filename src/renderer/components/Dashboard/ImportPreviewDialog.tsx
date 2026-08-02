import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Checkbox from '@mui/material/Checkbox';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ImportFileSelection,
  ImportPreviewRowState,
  ImportPreviewState,
  ImportSelectionPayload,
} from '../../providers/ApiContext';

interface ImportPreviewDialogProps {
  preview: ImportPreviewState | null;
  /** Logs the user browsed to, keyed by row id. */
  rowLogSelections: Record<string, ImportFileSelection>;
  isImporting: boolean;
  onChooseLogForRow: (rowId: string) => void;
  onCancel: () => void;
  onConfirm: (
    rows: ImportPreviewRowState[],
    selections: ImportSelectionPayload[],
  ) => void;
}

/** Sentinel for the "browse for a file not in the list" option. */
const BROWSE_VALUE = '__browse__';

const sessionLabels: Record<string, string> = {
  RACE: 'Race',
  QUALIFY: 'Qualifying',
  PRACTICE: 'Practice',
};

const formatSize = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;

/**
 * Why a row has no proposal, in the terms the user can act on.
 *
 * `ambiguous` is the one that matters. It is what a restarted race produces:
 * several sessions sharing an event time, a track, a session type and an
 * identical grid. Nothing automatic separates them, so the row says so and asks
 * rather than picking one and being wrong three times out of four.
 */
const unpairedReasons: Record<string, string> = {
  'no-candidates':
    'No result log in this hand-off or your own Results folder matches this session type.',
  'roster-too-small':
    'Too few drivers in this replay to identify its log. Choose one yourself.',
  'below-floor':
    'No log has enough drivers in common with this replay to be confident. Choose one yourself.',
  ambiguous:
    'Several logs match this replay equally well — most likely a restarted race, where every session shares a grid and a start time. Only you can say which is which.',
};

interface RowDecision {
  /** Absolute path of the chosen log, or '' for none. */
  logPath: string;
  skipped: boolean;
}

const buildInitialDecisions = (
  rows: ImportPreviewRowState[],
): Record<string, RowDecision> =>
  Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        logPath: row.pairing.proposed?.candidate.filePath ?? '',
        /*
         * An already-imported replay defaults to skipped rather than being
         * hidden. Importing it again would put a second copy of a 400 MB file
         * in the install under an "(imported 2)" name, but the user may have
         * deleted the original and mean it — so it is offered, just not armed.
         */
        skipped: Boolean(row.alreadyImportedHash),
      },
    ]),
  );

/**
 * The confirmation step for a folder or archive of replays.
 *
 * Nothing has been written into the LMU install at this point — a zip has been
 * unpacked into temp, and that is all. Every row is shown, including the ones
 * that cannot be imported, because a steward who handed over nine replays and
 * sees six needs to know what happened to the other three.
 */
export const ImportPreviewDialog: React.FC<ImportPreviewDialogProps> = ({
  preview,
  rowLogSelections,
  isImporting,
  onChooseLogForRow,
  onCancel,
  onConfirm,
}) => {
  const rows = useMemo(() => preview?.rows ?? [], [preview]);
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  /*
   * One note for the whole run, applied to every replay it imports.
   *
   * A hand-off is one thing that arrived from one person for one reason —
   * "Protest 12, sent by Team Foxtrot" describes all nine replays in it, and
   * asking a steward to retype that nine times would mean it gets typed none.
   * It is stored per replay, so per-row notes are a UI change later rather than
   * a data migration.
   */
  const [note, setNote] = useState('');

  useEffect(() => {
    setDecisions(buildInitialDecisions(rows));
  }, [rows]);

  // A new source is a new hand-off; its note should not be the last one's.
  useEffect(() => {
    setNote('');
  }, [preview?.sourceLabel]);

  /*
   * A log the user browsed to is adopted as that row's choice. Done here rather
   * than in the click handler because the file arrives asynchronously, from the
   * main process, after the native dialog closes.
   */
  useEffect(() => {
    setDecisions((previous) => {
      let changed = false;
      const next = { ...previous };

      for (const [rowId, selection] of Object.entries(rowLogSelections)) {
        if (next[rowId] && next[rowId].logPath !== selection.filePath) {
          next[rowId] = { logPath: selection.filePath, skipped: false };
          changed = true;
        }
      }

      return changed ? next : previous;
    });
  }, [rowLogSelections]);

  const selections: ImportSelectionPayload[] = rows
    .filter((row) => {
      const decision = decisions[row.id];
      return decision && !decision.skipped && decision.logPath;
    })
    .map((row) => {
      const decision = decisions[row.id];
      const isManifestChoice =
        row.manifest !== null && row.manifest.logPath === decision.logPath;
      const isProposed =
        row.pairing.proposed?.candidate.filePath === decision.logPath;

      return {
        id: row.id,
        logPath: decision.logPath,
        /*
         * 'manifest' only when the log is still the one the manifest named. If
         * the user has overridden it, the pairing is theirs and the record
         * should say so.
         */
        method: isManifestChoice
          ? ('manifest' as const)
          : isProposed
            ? ('roster' as const)
            : ('manual' as const),
        confidence: isProposed
          ? (row.pairing.proposed?.confidence ?? null)
          : null,
        ...(isManifestChoice ? { timestamp: row.manifest?.timestamp } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
    });

  const unpairableCount = rows.filter(
    (row) => row.pairing.ranked.length === 0,
  ).length;
  const alreadyImportedCount = rows.filter(
    (row) => row.alreadyImportedHash,
  ).length;

  const setDecision = (rowId: string, patch: Partial<RowDecision>) =>
    setDecisions((previous) => ({
      ...previous,
      [rowId]: { ...previous[rowId], ...patch },
    }));

  return (
    <Dialog
      open={Boolean(preview)}
      onClose={isImporting ? undefined : onCancel}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>
        {preview?.kind === 'zip' ? 'Import from archive' : 'Import from folder'}
      </DialogTitle>
      <DialogContent>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ wordBreak: 'break-all', mb: 2 }}
        >
          {preview?.sourceLabel}
        </Typography>

        {rows.length > 0 ? (
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(changeEvent) => setNote(changeEvent.target.value)}
            placeholder="Protest 12 — sent by Team Foxtrot, contact on lap 7"
            helperText="Where this hand-off came from and why you have it. Applied to every replay imported below, and shown on them in the Imported view."
            multiline
            minRows={2}
            fullWidth
            size="small"
            disabled={isImporting}
            sx={{ mb: 2 }}
            slotProps={{ htmlInput: { 'aria-label': 'Import note' } }}
          />
        ) : null}

        {rows.length === 0 ? (
          <Alert severity="info">
            No readable replays were found here. A hand-off needs the .Vcr files
            themselves — a folder of result logs alone is not enough.
          </Alert>
        ) : null}

        <Stack spacing={1.5} sx={{ mb: 2 }}>
          {preview && preview.manifestSessionCount > 0 ? (
            <Alert severity="success">
              This came from LMU Steward. {preview.manifestSessionCount} of{' '}
              {rows.length} replays carry the exporter&apos;s own pairing, so
              their logs and session dates are taken as given rather than
              guessed at.
            </Alert>
          ) : null}

          {/*
            A partial weekend has to be distinguishable from a complete one.
            Without this, a steward hunting an incident in a race that was never
            in the archive would assume the scan had missed it.
          */}
          {preview && preview.omittedSessions.length > 0 ? (
            <Alert severity="warning">
              <AlertTitle>
                {preview.omittedSessions.length} session
                {preview.omittedSessions.length === 1 ? ' was' : 's were'} left
                out when this archive was made
              </AlertTitle>
              {preview.omittedSessions.map((omitted) => (
                <Typography variant="body2" key={omitted.replayName}>
                  {omitted.replayName} — {omitted.reason}
                </Typography>
              ))}
            </Alert>
          ) : null}

          {preview && preview.rejectedEntries.length > 0 ? (
            <Alert severity="error">
              <AlertTitle>
                {preview.rejectedEntries.length} entr
                {preview.rejectedEntries.length === 1
                  ? 'y was'
                  : 'ies were'}{' '}
                skipped
              </AlertTitle>
              They named paths outside the archive, which a replay hand-off
              never does. Nothing was written outside the unpack folder.
            </Alert>
          ) : null}

          {unpairableCount > 0 ? (
            <Alert severity="warning">
              {unpairableCount} of {rows.length} replays have no result log
              available and cannot be imported. LMU stores a replay&apos;s date
              on the file itself and copying loses it — without the log there is
              nothing to restore it from.
            </Alert>
          ) : null}

          {alreadyImportedCount > 0 ? (
            <Alert severity="info">
              {alreadyImportedCount}{' '}
              {alreadyImportedCount === 1 ? 'replay is' : 'replays are'} already
              imported and set to skip. Importing again adds a second copy
              rather than replacing the first.
            </Alert>
          ) : null}
        </Stack>

        {rows.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">Import</TableCell>
                  <TableCell>Replay</TableCell>
                  <TableCell>Session</TableCell>
                  <TableCell>Result log</TableCell>
                  <TableCell>Match</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => {
                  const decision = decisions[row.id] ?? {
                    logPath: '',
                    skipped: false,
                  };
                  const hasCandidates = row.pairing.ranked.length > 0;
                  const isManifestChoice =
                    row.manifest !== null &&
                    row.manifest.logPath === decision.logPath;
                  const chosen = row.pairing.ranked.find(
                    (ranked) => ranked.candidate.filePath === decision.logPath,
                  );
                  const browsed = rowLogSelections[row.id];

                  return (
                    <TableRow key={row.id} hover>
                      <TableCell padding="checkbox">
                        <Tooltip
                          title={
                            hasCandidates || browsed
                              ? ''
                              : 'This replay has no result log, so it cannot be imported.'
                          }
                        >
                          <span>
                            <Checkbox
                              checked={
                                !decision.skipped && Boolean(decision.logPath)
                              }
                              disabled={
                                isImporting || (!hasCandidates && !browsed)
                              }
                              onChange={(chooseEvent) =>
                                setDecision(row.id, {
                                  skipped: !chooseEvent.target.checked,
                                })
                              }
                              inputProps={{
                                'aria-label': `Import ${row.replayName}`,
                              }}
                            />
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>
                          {row.replayName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatSize(row.size)}
                          {row.alreadyImportedHash ? ' · already imported' : ''}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {sessionLabels[row.session] ?? row.session}
                      </TableCell>
                      <TableCell sx={{ minWidth: 320 }}>
                        {hasCandidates || browsed ? (
                          <Select
                            size="small"
                            fullWidth
                            disabled={isImporting}
                            value={decision.logPath || ''}
                            displayEmpty
                            onChange={(changeEvent) => {
                              const value = String(changeEvent.target.value);

                              if (value === BROWSE_VALUE) {
                                onChooseLogForRow(row.id);
                                return;
                              }

                              setDecision(row.id, {
                                logPath: value,
                                skipped: false,
                              });
                            }}
                            renderValue={(value) =>
                              value
                                ? String(value).split(/[\\/]/).pop()
                                : 'Choose a result log'
                            }
                          >
                            {row.pairing.ranked.map((ranked) => (
                              <MenuItem
                                key={ranked.candidate.filePath}
                                value={ranked.candidate.filePath}
                              >
                                {ranked.candidate.fileName}
                                {row.manifest?.logPath ===
                                ranked.candidate.filePath
                                  ? ' — named by the archive'
                                  : ` — ${ranked.intersection} of ${ranked.vcrCount} drivers`}
                              </MenuItem>
                            ))}
                            {browsed &&
                            !row.pairing.ranked.some(
                              (ranked) =>
                                ranked.candidate.filePath === browsed.filePath,
                            ) ? (
                              <MenuItem value={browsed.filePath}>
                                {browsed.fileName} — chosen by you
                              </MenuItem>
                            ) : null}
                            <MenuItem value={BROWSE_VALUE}>
                              Choose a different file…
                            </MenuItem>
                          </Select>
                        ) : (
                          <Stack spacing={0.5}>
                            <Typography variant="body2" color="text.secondary">
                              {unpairedReasons[row.pairing.reason] ??
                                'No result log could be matched to this replay.'}
                            </Typography>
                            <Button
                              size="small"
                              disabled={isImporting}
                              onClick={() => onChooseLogForRow(row.id)}
                              sx={{ alignSelf: 'flex-start' }}
                            >
                              Choose a log…
                            </Button>
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell>
                        {isManifestChoice ? (
                          <Chip
                            size="small"
                            color="success"
                            label="From archive"
                          />
                        ) : chosen ? (
                          <Chip
                            size="small"
                            color={
                              chosen.confidence >= 0.5 ? 'success' : 'warning'
                            }
                            label={`${Math.round(chosen.confidence * 100)}%`}
                          />
                        ) : decision.logPath ? (
                          <Chip size="small" label="Your choice" />
                        ) : (
                          <Chip size="small" color="warning" label="Unpaired" />
                        )}
                        {row.pairing.reason === 'ambiguous' &&
                        !isManifestChoice ? (
                          <Tooltip title={unpairedReasons.ambiguous}>
                            <Chip
                              size="small"
                              variant="outlined"
                              color="warning"
                              label="Ambiguous"
                              sx={{ ml: 0.5 }}
                            />
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Box sx={{ flexGrow: 1, pl: 2 }}>
          <Typography variant="body2" color="text.secondary">
            {selections.length} of {rows.length} will be imported
          </Typography>
        </Box>
        <Button onClick={onCancel} disabled={isImporting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={selections.length === 0 || isImporting}
          onClick={() => onConfirm(rows, selections)}
        >
          {isImporting
            ? 'Importing…'
            : `Import ${selections.length} ${
                selections.length === 1 ? 'replay' : 'replays'
              }`}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
