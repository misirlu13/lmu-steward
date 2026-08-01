import { useState } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  SelectChangeEvent,
  Button,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import FolderZipIcon from '@mui/icons-material/FolderZip';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
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
  /** The two-file dialog: one replay, one log, both picked by the user. */
  onImportReplays: () => void;
  onImportSource: (kind: 'folder' | 'zip') => void;
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
  onImportSource,
}) => {
  const [importMenuAnchor, setImportMenuAnchor] = useState<HTMLElement | null>(
    null,
  );

  const handleSortChange = (event: SelectChangeEvent) => {
    onSortByChange(event.target.value as DashboardSortByOptions);
  };

  const closeImportMenu = () => setImportMenuAnchor(null);

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
      {/*
        Three entry points behind one button rather than three buttons, because
        Windows cannot show a dialog that accepts either a file or a folder —
        Electron's own note is that asking for both silently gives a directory
        selector. The user has to say which before the dialog opens, so the
        choice belongs here.
      */}
      {canImport ? (
        <>
          <Button
            onClick={(clickEvent) =>
              setImportMenuAnchor(clickEvent.currentTarget)
            }
            variant="outlined"
            size="small"
            startIcon={<FileDownloadIcon />}
            endIcon={<ArrowDropDownIcon />}
            aria-label="Import replays menu"
          >
            Import Replays
          </Button>
          <Menu
            anchorEl={importMenuAnchor}
            open={Boolean(importMenuAnchor)}
            onClose={closeImportMenu}
          >
            <MenuItem
              onClick={() => {
                closeImportMenu();
                onImportReplays();
              }}
            >
              <ListItemIcon>
                <InsertDriveFileOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="One replay and its log…"
                secondary="Pick a .Vcr and its .xml yourself"
              />
            </MenuItem>
            <MenuItem
              onClick={() => {
                closeImportMenu();
                onImportSource('folder');
              }}
            >
              <ListItemIcon>
                <FolderOpenIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="A folder of replays…"
                secondary="Scan a hand-off and pair each replay"
              />
            </MenuItem>
            <MenuItem
              onClick={() => {
                closeImportMenu();
                onImportSource('zip');
              }}
            >
              <ListItemIcon>
                <FolderZipIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="An archive (.zip)…"
                secondary="Including one exported from LMU Steward"
              />
            </MenuItem>
          </Menu>
        </>
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
