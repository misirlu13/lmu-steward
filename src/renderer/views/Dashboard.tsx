import { useEffect } from 'react';
import { useNavbar } from '../providers/NavbarContext';
import { Box, Typography } from '@mui/material';
import { DashboardNavContent } from '../components/Dashboard/DashboardNavContent';
import { DashboardReplay } from '../components/Dashboard/DashboardReplay';
import { ViewHeader } from '../components/Common/ViewHeader';
import { DashboardControls } from '../components/Dashboard/DashboardControls';
import { DashboardFooterSummary } from '../components/Dashboard/DashboardFooterSummary';
import { useDashboardReplays } from '../hooks/useDashboardReplays';
import FolderOffIcon from '@mui/icons-material/FolderOff';

export const DashboardView: React.FC = () => {
  const { setContent } = useNavbar();
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
    setPage,
    setSortBy,
    setSortDirection,
    handleApplyFilters,
    handleRefreshReplays,
  } = useDashboardReplays();

  useEffect(() => {
    setContent(<DashboardNavContent />);
  }, []);

  if (!hasReplaysResponded) {
    return null;
  }

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
            onSortByChange={setSortBy}
            onSortDirectionChange={setSortDirection}
            onApplyFilters={handleApplyFilters}
            onRefresh={handleRefreshReplays}
          />
        }
      />
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
            <DashboardReplay key={replay[0].hash} replayGroup={replay} />
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
              mb: 2,
            }}
          >
            <FolderOffIcon sx={{ fontSize: 60, color: 'text.secondary' }} />
          </Box>
          <Typography variant="h5" fontWeight="bold">
            No replays found.
          </Typography>
          <Typography color="text.secondary" variant="body1" textAlign="center">
            We couldn’t find any replays to display. This could be because:
          </Typography>
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
          <Typography color="text.secondary" variant="body1" textAlign="center">
            Try adjusting your filters or checking again shortly.
          </Typography>
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
    </>
  );
};
