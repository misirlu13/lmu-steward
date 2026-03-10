import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { Refresh } from '@mui/icons-material';
import { DashboardFilter, Filters } from './DashboardFilter';
import { DashboardSortByOptions } from '../../hooks/useDashboardReplays';
import { SegmentedButtonGroup } from '../Common/SegmentedButtonGroup';

interface DashboardControlsProps {
  sortBy: DashboardSortByOptions;
  sortDirection: 'asc' | 'desc';
  filters: Filters;
  onSortByChange: (sortBy: DashboardSortByOptions) => void;
  onSortDirectionChange: (sortDirection: 'asc' | 'desc') => void;
  onApplyFilters: (filters: Filters) => void;
  onRefresh: () => void;
}

export const DashboardControls: React.FC<DashboardControlsProps> = ({
  sortBy,
  sortDirection,
  filters,
  onSortByChange,
  onSortDirectionChange,
  onApplyFilters,
  onRefresh,
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
