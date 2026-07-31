import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Button,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { DashboardViewMode } from '@types';
import { DashboardFilter, Filters } from './DashboardFilter';
import { DashboardSortByOptions } from '../../hooks/useDashboardReplays';
import { SegmentedButtonGroup } from '../Common/SegmentedButtonGroup';

interface DashboardControlsProps {
  sortBy: DashboardSortByOptions;
  sortDirection: 'asc' | 'desc';
  filters: Filters;
  dashboardView: DashboardViewMode;
  archivedCount: number;
  importedCount: number;
  /**
   * Import is gated on the experimental flag, but the Imported view is not
   * while any import exists — turning the flag off must never strand files the
   * user can no longer reach.
   */
  canImport: boolean;
  onSortByChange: (sortBy: DashboardSortByOptions) => void;
  onSortDirectionChange: (sortDirection: 'asc' | 'desc') => void;
  onApplyFilters: (filters: Filters) => void;
  onRefresh: () => void;
  onDashboardViewChange: (dashboardView: DashboardViewMode) => void;
  onImportReplays: () => void;
}

export const DashboardControls: React.FC<DashboardControlsProps> = ({
  sortBy,
  sortDirection,
  filters,
  dashboardView,
  archivedCount,
  importedCount,
  canImport,
  onSortByChange,
  onSortDirectionChange,
  onApplyFilters,
  onDashboardViewChange,
  onImportReplays,
}) => {
  const handleSortChange = (event: SelectChangeEvent) => {
    onSortByChange(event.target.value as DashboardSortByOptions);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        justifyContent: 'flex-end',
        flexDirection: 'row',
      }}
    >
      {canImport ? (
        <Button
          onClick={onImportReplays}
          variant="outlined"
          size="small"
          startIcon={<FileDownloadIcon />}
        >
          Import Replays
        </Button>
      ) : null}
      <SegmentedButtonGroup<DashboardViewMode>
        ariaLabel="replay dashboard view button group"
        value={dashboardView}
        onChange={(value) => onDashboardViewChange(value)}
        options={[
          { value: 'active', label: 'Active' },
          {
            value: 'archived',
            label:
              archivedCount > 0 ? `Archived (${archivedCount})` : 'Archived',
          },
          /*
           * Shown whenever an import exists, even with experimental features
           * off, so delete and export stay reachable for files already on disk.
           */
          ...(canImport || importedCount > 0
            ? [
                {
                  value: 'imported' as DashboardViewMode,
                  label:
                    importedCount > 0
                      ? `Imported (${importedCount})`
                      : 'Imported',
                },
              ]
            : []),
        ]}
      />
      <FormControl sx={{ minWidth: 180 }} size="small">
        <InputLabel id="sort-by-label">Sort By</InputLabel>
        <Select
          labelId="sort-by-label"
          id="sort-by-select"
          value={sortBy}
          label="Sort By"
          onChange={handleSortChange}
        >
          <MenuItem value="date">Session Date</MenuItem>
          <MenuItem value="track">Track Name</MenuItem>
          <MenuItem value="incidents">Total Incidents</MenuItem>
        </Select>
      </FormControl>
      <SegmentedButtonGroup
        ariaLabel="sort direction button group"
        value={sortDirection}
        onChange={onSortDirectionChange}
        options={[
          { value: 'asc', label: <ArrowUpwardIcon fontSize="small" /> },
          { value: 'desc', label: <ArrowDownwardIcon fontSize="small" /> },
        ]}
      />
      <DashboardFilter filters={filters} onApplyFilters={onApplyFilters} />
      {/* <Button
        variant="contained"
        startIcon={<Refresh />}
        onClick={onRefresh}
        sx={{
          backgroundColor: 'background.alt',
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        Refresh
      </Button> */}
    </Box>
  );
};
