import { useState } from 'react';
import { Box, Button, Snackbar, Typography } from '@mui/material';
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
import { useApi } from '../providers/ApiContext';
import { DeleteImportedConfirmDialog } from '../components/Dashboard/DeleteImportedConfirmDialog';

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

  const { experimentalFeaturesEnabled, selectImportSource } = useApi();
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

  const saveNote = (note: string) => {
    if (!pendingNote) {
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
            onImportReplays={selectImportSource}
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
        onCancel={() => setPendingNote(null)}
        onSave={saveNote}
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
