import { useEffect, useRef, useState } from 'react';
import { Box, Button, Snackbar, Typography } from '@mui/material';
import { LMUReplay } from '@types';
import FolderOffIcon from '@mui/icons-material/FolderOff';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { DashboardReplay } from '../components/Dashboard/DashboardReplay';
import { ViewHeader } from '../components/Common/ViewHeader';
import { DashboardControls } from '../components/Dashboard/DashboardControls';
import { DashboardFooterSummary } from '../components/Dashboard/DashboardFooterSummary';
import { ArchiveConfirmDialog } from '../components/Dashboard/ArchiveConfirmDialog';
import { ArchiveNoteDialog } from '../components/Dashboard/ArchiveNoteDialog';
import { useDashboardReplays } from '../hooks/useDashboardReplays';
import { ExportReplayPayload, useApi } from '../providers/ApiContext';
import { DeleteImportedConfirmDialog } from '../components/Dashboard/DeleteImportedConfirmDialog';
import { ImportReplayDialog } from '../components/Dashboard/ImportReplayDialog';
import { ExportProgressDialog } from '../components/Dashboard/ExportProgressDialog';
import { ImportPreviewDialog } from '../components/Dashboard/ImportPreviewDialog';
import { ImportProgressDialog } from '../components/Dashboard/ImportProgressDialog';
import { useViewReplayDisabledReason } from '../hooks/useReplayGating';
import { useLiveCaptureIndex } from '../hooks/useLiveCaptureIndex';

interface PendingDelete {
  hashes: string[];
  targetLabel: string;
}

interface PendingArchive {
  hashes: string[];
  targetLabel?: string;
}

interface PendingNote {
  hash: string;
  note: string;
}

/**
 * Identifiers only. The main process resolves every path — a renderer building
 * one by string concatenation is how an escaping slip once broke every export.
 */
const toExportPayload = (replay: LMUReplay): ExportReplayPayload => ({
  hash: replay.hash,
  replayName: replay.replayName,
  sceneDesc: replay.metadata.sceneDesc,
  session: replay.metadata.session,
  timestamp: replay.timestamp,
  logDataFileName: replay.logDataFileName,
});

export const DashboardView: React.FC = () => {
  const {
    isConnected,
    hasReplaysResponded,
    page,
    totalPages,
    totalReplayCount,
    totalSessionCount,
    filteredReplayCount,
    hasActiveFilters,
    currentReplays,
    replayGroups,
    sortBy,
    sortDirection,
    filters,
    dashboardView,
    archivedCount,
    importedCount,
    filteredReplayHashes,
    setPage,
    setSortBy,
    setSortDirection,
    handleApplyFilters,
    handleRefreshReplays,
    handleChangeDashboardView,
    handleArchiveReplays,
    handleRestoreReplays,
    handleSetArchiveNote,
    handleDeleteImportedReplays,
  } = useDashboardReplays();

  const {
    experimentalFeaturesEnabled,
    exportReplay,
    exportWeekend,
    exportProgress,
    exportResult,
    clearExportResult,
    importReplayFile,
    importLogFile,
    importPairValidation,
    importPairError,
    isImportingPair,
    selectImportFile,
    importReplayPair,
    setImportedNote,
    resetImportPair,
    selectImportSource,
    importPreview,
    importProgress,
    importRowLogSelections,
    importOutcomes,
    clearImportOutcomes,
    clearImportPreview,
    importSelectedReplays,
  } = useApi();
  const viewReplayDisabledReason = useViewReplayDisabledReason();
  /*
    Fetched once for the whole list rather than per accordion. The dashboard
    draws one of these per weekend and the answer is the same small array for
    all of them.
  */
  const liveCaptureByReplay = useLiveCaptureIndex();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [lastImportedName, setLastImportedName] = useState('');
  const wasImportingRef = useRef(false);

  /*
   * Close on success only. A failed import leaves the dialog open with its
   * error, so the user can correct the pairing rather than start over.
   */
  useEffect(() => {
    const finished = wasImportingRef.current && !isImportingPair;
    wasImportingRef.current = isImportingPair;

    if (finished && !importPairError && !importReplayFile && !importLogFile) {
      setIsImportDialogOpen(false);
      setLastImportedName('Replay imported');
    }
  }, [isImportingPair, importPairError, importReplayFile, importLogFile]);
  const [pendingArchive, setPendingArchive] = useState<PendingArchive | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [pendingNote, setPendingNote] = useState<PendingNote | null>(null);
  const [lastArchivedHashes, setLastArchivedHashes] = useState<string[]>([]);

  const confirmArchive = (note: string) => {
    if (!pendingArchive) {
      return;
    }

    handleArchiveReplays(pendingArchive.hashes, note);
    setLastArchivedHashes(pendingArchive.hashes);
    setPendingArchive(null);
  };

  const undoLastArchive = () => {
    handleRestoreReplays(lastArchivedHashes);
    setLastArchivedHashes([]);
  };

  /*
   * The two note stores are separate on purpose: an imported replay is never
   * archived, so its note has nowhere to live in the archive store. The view
   * the user is in says which one this edit belongs to.
   */
  const saveNote = (note: string) => {
    if (!pendingNote) {
      return;
    }

    if (dashboardView === 'imported') {
      setImportedNote([pendingNote.hash], note);
      setPendingNote(null);
      return;
    }

    handleSetArchiveNote([pendingNote.hash], note);
    setPendingNote(null);
  };

  if (!hasReplaysResponded) {
    return null;
  }

  const emptyStateCopy =
    dashboardView === 'imported'
      ? {
          icon: <Inventory2OutlinedIcon sx={{ fontSize: 60 }} />,
          title: 'Nothing imported.',
          body: 'Replays you import from another PC are kept here, separately from your own recordings.',
        }
      : dashboardView === 'archived'
        ? {
            icon: <Inventory2OutlinedIcon sx={{ fontSize: 60 }} />,
            title: 'Nothing archived.',
            body: 'Replays you archive are kept here so you can restore them later. Your replay files are never deleted.',
          }
        : {
            icon: <FolderOffIcon sx={{ fontSize: 60 }} />,
            title: 'No replays found.',
            body: 'We couldn’t find any replays to display.',
          };

  return (
    <>
      <ViewHeader
        title="Session Replays"
        subtitle="Review and analyze your recorded race data."
        actions={
          <DashboardControls
            sortBy={sortBy}
            sortDirection={sortDirection}
            filters={filters}
            dashboardView={dashboardView}
            archivedCount={archivedCount}
            importedCount={importedCount}
            canImport={experimentalFeaturesEnabled}
            onSortByChange={setSortBy}
            onSortDirectionChange={setSortDirection}
            onApplyFilters={handleApplyFilters}
            onRefresh={handleRefreshReplays}
            onDashboardViewChange={handleChangeDashboardView}
            onImportReplays={() => setIsImportDialogOpen(true)}
            onImportSource={selectImportSource}
          />
        }
      />
      {/* Bulk actions are gated on an active filter: the whole point is to act
          on a reviewed subset, and an ungated button here would be a one-click
          "archive everything". */}
      {hasActiveFilters && filteredReplayHashes.length > 0 ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            mt: 3,
            px: 2,
            py: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '4px',
            backgroundColor: 'background.alt',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {filteredReplayCount}{' '}
            {filteredReplayCount === 1 ? 'session matches' : 'sessions match'}{' '}
            your filters.
          </Typography>
          {dashboardView === 'imported' ? null : dashboardView ===
            'archived' ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<UnarchiveIcon />}
              onClick={() => handleRestoreReplays(filteredReplayHashes)}
            >
              Restore these {filteredReplayCount}
            </Button>
          ) : (
            <Button
              size="small"
              variant="outlined"
              startIcon={<ArchiveIcon />}
              onClick={() =>
                setPendingArchive({ hashes: filteredReplayHashes })
              }
            >
              Archive these {filteredReplayCount}
            </Button>
          )}
        </Box>
      ) : null}
      {currentReplays.length > 0 ? (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            flexWrap: 'nowrap',
            mt: 3,
          }}
        >
          {currentReplays.map((replay) => (
            <DashboardReplay
              key={replay[0].hash}
              replayGroup={replay}
              dashboardView={dashboardView}
              onArchive={(hashes, targetLabel) =>
                setPendingArchive({ hashes, targetLabel })
              }
              onRestore={handleRestoreReplays}
              onEditNote={(hash, note) => setPendingNote({ hash, note })}
              onDeleteImported={(hashes, targetLabel) =>
                setPendingDelete({ hashes, targetLabel })
              }
              canExport={experimentalFeaturesEnabled}
              viewReplayDisabledReason={viewReplayDisabledReason}
              liveCaptureByReplay={liveCaptureByReplay}
              onExportSession={(sessionReplay) =>
                exportReplay(toExportPayload(sessionReplay))
              }
              onExportWeekend={(sessionReplays, weekendLabel) =>
                exportWeekend({
                  weekendLabel,
                  timestamp: sessionReplays[0]?.timestamp ?? 0,
                  sessions: sessionReplays.map(toExportPayload),
                })
              }
            />
          ))}
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            my: 'auto',
            flexDirection: 'column',
            height: '100%',
            gap: 2,
          }}
        >
          <Box
            sx={{
              height: '128px',
              width: '128px',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: '50%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'background.paper',
              color: 'text.secondary',
              mb: 2,
            }}
          >
            {emptyStateCopy.icon}
          </Box>
          <Typography variant="h5" fontWeight="bold">
            {emptyStateCopy.title}
          </Typography>
          <Typography color="text.secondary" variant="body1" textAlign="center">
            {emptyStateCopy.body}
          </Typography>
          {dashboardView === 'active' ? (
            <>
              <Box
                component="ul"
                sx={{
                  color: 'text.secondary',
                  variant: 'body1',
                  textAlign: 'left',
                }}
              >
                <li style={{ marginBottom: '10px' }}>
                  Your filters returned no results
                </li>
                <li>No replays are available yet</li>
              </Box>
              <Typography
                color="text.secondary"
                variant="body1"
                textAlign="center"
              >
                Try adjusting your filters or checking again shortly.
              </Typography>
            </>
          ) : null}
        </Box>
      )}
      <DashboardFooterSummary
        totalReplays={totalReplayCount}
        totalSessions={totalSessionCount}
        filteredReplays={filteredReplayCount}
        filteredSessions={replayGroups.length}
        isFiltered={hasActiveFilters}
        isConnected={isConnected}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
      <ArchiveConfirmDialog
        open={Boolean(pendingArchive)}
        replayCount={pendingArchive?.hashes.length ?? 0}
        targetLabel={pendingArchive?.targetLabel}
        onCancel={() => setPendingArchive(null)}
        onConfirm={confirmArchive}
      />
      <ArchiveNoteDialog
        open={Boolean(pendingNote)}
        initialNote={pendingNote?.note ?? ''}
        viewLabel={dashboardView === 'imported' ? 'Imported' : 'Archived'}
        onCancel={() => setPendingNote(null)}
        onSave={saveNote}
      />
      <ImportReplayDialog
        open={isImportDialogOpen}
        replayFile={importReplayFile}
        logFile={importLogFile}
        validation={importPairValidation}
        isImporting={isImportingPair}
        errorMessage={importPairError}
        onChooseReplay={() => selectImportFile('replay')}
        onChooseLog={() => selectImportFile('log')}
        onCancel={() => {
          setIsImportDialogOpen(false);
          resetImportPair();
        }}
        onConfirm={importReplayPair}
      />
      <DeleteImportedConfirmDialog
        open={Boolean(pendingDelete)}
        targetLabel={pendingDelete?.targetLabel ?? 'this replay'}
        replays={
          pendingDelete
            ? currentReplays
                .flat()
                .filter((replay) => pendingDelete.hashes.includes(replay.hash))
            : []
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            handleDeleteImportedReplays(pendingDelete.hashes);
          }
          setPendingDelete(null);
        }}
      />
      <ImportPreviewDialog
        preview={importPreview}
        rowLogSelections={importRowLogSelections}
        isImporting={importProgress?.phase === 'importing'}
        onChooseLogForRow={(rowId) => selectImportFile('log', rowId)}
        onCancel={clearImportPreview}
        onConfirm={importSelectedReplays}
      />
      <ImportProgressDialog progress={importProgress} />
      <ExportProgressDialog progress={exportProgress} />
      {/*
        A cancelled save dialog is not an outcome worth reporting, so only a
        finished or failed export raises this. The path is named because a
        weekend takes minutes and the user will have looked away.
      */}
      <Snackbar
        open={Boolean(exportResult && !exportResult.canceled)}
        autoHideDuration={exportResult?.status === 'error' ? 12000 : 8000}
        onClose={clearExportResult}
        message={
          exportResult?.status === 'error'
            ? `Export failed. ${exportResult.message}`
            : exportResult
              ? `Exported ${exportResult.exported} ${
                  exportResult.exported === 1 ? 'session' : 'sessions'
                } to ${exportResult.filePath}${
                  exportResult.omitted.length > 0
                    ? `. ${exportResult.omitted.length} left out for having no result log.`
                    : ''
                }`
              : ''
        }
      />
      {/*
        Per-row outcomes, not a single verdict. A row that fails rolls itself
        back and the rest carry on, so "imported 5" would be half the story
        when the sixth did not make it.
      */}
      <Snackbar
        open={Boolean(importOutcomes && importOutcomes.length > 0)}
        autoHideDuration={10000}
        onClose={clearImportOutcomes}
        message={(() => {
          const outcomes = importOutcomes ?? [];
          const imported = outcomes.filter(
            (outcome) => outcome.status === 'imported',
          ).length;
          const failed = outcomes.filter(
            (outcome) => outcome.status === 'failed',
          );

          return failed.length > 0
            ? `Imported ${imported} of ${outcomes.length}. ${failed[0].replayName} failed: ${
                failed[0].message ?? 'unknown reason'
              }`
            : `Imported ${imported} ${imported === 1 ? 'replay' : 'replays'}. They are in the Imported view.`;
        })()}
      />
      <Snackbar
        open={Boolean(lastImportedName)}
        autoHideDuration={6000}
        onClose={() => setLastImportedName('')}
        message="Replay imported. It is in the Imported view."
      />
      <Snackbar
        open={lastArchivedHashes.length > 0}
        autoHideDuration={8000}
        onClose={() => setLastArchivedHashes([])}
        message={`Archived ${lastArchivedHashes.length} ${
          lastArchivedHashes.length === 1 ? 'session' : 'sessions'
        }`}
        action={
          <Button color="primary" size="small" onClick={undoLastArchive}>
            Undo
          </Button>
        }
      />
    </>
  );
};
