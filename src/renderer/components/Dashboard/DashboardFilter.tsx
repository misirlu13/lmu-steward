import { useMemo, useState } from 'react';
import {
	Box,
	Button,
	Divider,
	ListSubheader,
	Menu,
	MenuItem,
} from '@mui/material';
import Badge from '@mui/material/Badge';
import FilterListIcon from '@mui/icons-material/FilterList';
import InputLabel from '@mui/material/InputLabel';
import FormControl from '@mui/material/FormControl';
import Select from '@mui/material/Select';
import { Dayjs } from 'dayjs';
import { DateRangePicker } from '../DateRangePicker/DateRangePicker';
import { CONSTANTS } from '@constants';

export type DateRange = [Dayjs | null, Dayjs | null];

export interface Filters {
	dateRange: DateRange;
	track: string | '';
	sessionType: string | '';
	sessionLength: string | '';
	carClass: string | '';
	fieldSize: string | '';
	multiSingleClass: string | '';
	incidentCount: string | '';
}

export const DEFAULT_FILTERS: Filters = {
	dateRange: [null, null],
	track: '',
	sessionType: '',
	sessionLength: '',
	carClass: '',
	fieldSize: '',
	multiSingleClass: '',
	incidentCount: '',
};

interface DashboardFilterProps {
	filters: Filters;
	onApplyFilters: (filters: Filters) => void;
}

const sessionTypeOptions = [
	{ label: 'Practice', value: 'PRACTICE' },
	{ label: 'Qualifying', value: 'QUALIFY' },
	{ label: 'Race', value: 'RACE' },
];

const sessionLengthOptions = [
	{ label: 'Short (~20 mins)', value: 'short' },
	{ label: 'Medium (~60 mins)', value: 'medium' },
	{ label: 'Long (>120 mins)', value: 'long' },
];

const fieldSizeOptions = [
	{ label: 'Small (1-10 cars)', value: 'small' },
	{ label: 'Medium (11-30 cars)', value: 'medium' },
	{ label: 'Large (31+ cars)', value: 'large' },
];

const multiSingleClassOptions = [
	{ label: 'Single Class', value: 'single' },
	{ label: 'Multi Class', value: 'multi' },
];

const incidentCountOptions = [
	{ label: 'Low (< 2 score per driver)', value: 'low' },
	{ label: 'Medium (2-5 score per driver)', value: 'medium' },
	{ label: 'High (5+ score per driver)', value: 'high' },
];

export const DashboardFilter: React.FC<DashboardFilterProps> = ({
	filters,
	onApplyFilters,
}) => {
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const [pendingFilters, setPendingFilters] = useState<Filters>(filters);

	const isFilterMenuOpen = Boolean(anchorEl);

	const trackKeys = useMemo(
		() =>
			Array.from(
				new Set(
					Object.keys(CONSTANTS.TRACK_META_DATA) as Array<
						keyof typeof CONSTANTS.TRACK_META_DATA
					>,
				),
			),
		[],
	);

	const activeFilterCount = useMemo(() => {
		let count = 0;
		const [startDate, endDate] = filters.dateRange;

		if (startDate || endDate) count += 1;
		if (filters.track) count += 1;
		if (filters.sessionType) count += 1;
		if (filters.sessionLength) count += 1;
		if (filters.carClass) count += 1;
		if (filters.fieldSize) count += 1;
		if (filters.multiSingleClass) count += 1;
		if (filters.incidentCount) count += 1;

		return count;
	}, [filters]);

	type FilterValue =
		| Filters['track']
		| Filters['sessionType']
		| Filters['sessionLength']
		| Filters['carClass']
		| Filters['fieldSize']
		| Filters['multiSingleClass']
		| Filters['incidentCount']
		| Filters['dateRange'];

	const handlePendingFilterChange = (filterKey: keyof Filters, value: FilterValue) => {
		setPendingFilters((previous) => ({ ...previous, [filterKey]: value }));
	};

	const handlePendingDateRangeChange = (dateRange: DateRange) => {
		handlePendingFilterChange('dateRange', dateRange);
	};

	const handleOnFilterMenuClick = (
		event: React.MouseEvent<HTMLButtonElement>,
	) => {
		setAnchorEl(event.currentTarget);
		setPendingFilters(filters);
	};

	const handleOnFilterMenuClose = () => {
		setAnchorEl(null);
	};

	const handleApplyFilters = () => {
		onApplyFilters(pendingFilters);
		handleOnFilterMenuClose();
	};

	const handleCancelFilters = () => {
		setPendingFilters(filters);
		handleOnFilterMenuClose();
	};

	const handleClearFilters = () => {
		setPendingFilters(DEFAULT_FILTERS);
	};

	return (
		<>
			<Button
				id="filter-replay-button"
				aria-controls={isFilterMenuOpen ? 'filter-replay-menu' : undefined}
				aria-haspopup="true"
				aria-expanded={isFilterMenuOpen ? 'true' : undefined}
				onClick={handleOnFilterMenuClick}
				variant="contained"
				startIcon={
					<Badge badgeContent={activeFilterCount} color="primary">
						<FilterListIcon />
					</Badge>
				}
				sx={{
					backgroundColor: 'background.alt',
					border: '1px solid',
					borderColor: 'divider',
				}}
			>
				Filters
			</Button>
			<Menu
				id="filter-replay-menu"
				anchorEl={anchorEl}
				open={isFilterMenuOpen}
				onClose={handleOnFilterMenuClose}
				anchorOrigin={{
					vertical: 'bottom',
					horizontal: 'left',
				}}
				transformOrigin={{
					vertical: 'top',
					horizontal: 'left',
				}}
				slotProps={{
					paper: {
						style: {
							marginTop: '8px',
							marginLeft: '-40px',
							maxHeight: '650px',
						},
					},
					list: {
						'aria-labelledby': 'filter-replay-button',
					},
				}}
			>
				<ListSubheader>Session Filters</ListSubheader>
				<Divider />
				<Box
					sx={{ px: 2, py: 1 }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<DateRangePicker onDateRangeChange={handlePendingDateRangeChange} />
				</Box>
				<Box
					sx={{ px: 2, py: 1 }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<FormControl fullWidth size="small">
						<InputLabel id="track-select-label">Track</InputLabel>
						<Select
							labelId="track-select-label"
							id="track-select"
							label="Track"
							value={pendingFilters.track}
							onChange={(event) =>
								handlePendingFilterChange('track', event.target.value)
							}
						>
							<MenuItem value="">All Tracks</MenuItem>
							{trackKeys.map((key) => (
								<MenuItem key={key} value={key}>
									{CONSTANTS.TRACK_META_DATA[key].displayName}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</Box>
				<Box
					sx={{ px: 2, py: 1 }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<FormControl fullWidth size="small">
						<InputLabel id="session-type-select-label">Session Type</InputLabel>
						<Select
							labelId="session-type-select-label"
							id="session-type-select"
							label="Session Type"
							value={pendingFilters.sessionType}
							onChange={(event) =>
								handlePendingFilterChange('sessionType', event.target.value)
							}
						>
							<MenuItem value="">All Types</MenuItem>
							{sessionTypeOptions.map(({ label, value }) => (
								<MenuItem key={value} value={value}>
									{label}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</Box>
				<Box
					sx={{ px: 2, py: 1 }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<FormControl fullWidth size="small">
						<InputLabel id="session-length-select-label">Session Length</InputLabel>
						<Select
							labelId="session-length-select-label"
							id="session-length-select"
							label="Session Length"
							value={pendingFilters.sessionLength}
							onChange={(event) =>
								handlePendingFilterChange('sessionLength', event.target.value)
							}
						>
							<MenuItem value="">All Lengths</MenuItem>
							{sessionLengthOptions.map(({ label, value }) => (
								<MenuItem key={value} value={value}>
									{label}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</Box>
				<ListSubheader>Competition Filters</ListSubheader>
				<Divider />
				<Box
					sx={{ px: 2, py: 1 }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<FormControl fullWidth size="small">
						<InputLabel id="car-class-select-label">Car Class</InputLabel>
						<Select
							labelId="car-class-select-label"
							id="car-class-select"
							label="Car Class"
							value={pendingFilters.carClass}
							onChange={(event) =>
								handlePendingFilterChange('carClass', event.target.value)
							}
						>
							<MenuItem value="">All Car Classes</MenuItem>
							{Object.entries(CONSTANTS.CAR_CLASS_MAPPINGS).map(
								([key, value]) => (
									<MenuItem key={key} value={key}>
										{value}
									</MenuItem>
								),
							)}
						</Select>
					</FormControl>
				</Box>
				<Box
					sx={{ px: 2, py: 1 }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<FormControl fullWidth size="small">
						<InputLabel id="field-size-select-label">Field Size</InputLabel>
						<Select
							labelId="field-size-select-label"
							id="field-size-select"
							label="Field Size"
							value={pendingFilters.fieldSize}
							onChange={(event) =>
								handlePendingFilterChange('fieldSize', event.target.value)
							}
						>
							<MenuItem value="">All Field Sizes</MenuItem>
							{fieldSizeOptions.map(({ label, value }) => (
								<MenuItem key={value} value={value}>
									{label}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</Box>
				<Box
					sx={{ px: 2, py: 1 }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<FormControl fullWidth size="small">
						<InputLabel id="multi-single-class-select-label">
							Multi / Single Class
						</InputLabel>
						<Select
							labelId="multi-single-class-select-label"
							id="multi-single-class-select"
							label="Multi / Single Class"
							value={pendingFilters.multiSingleClass}
							onChange={(event) =>
								handlePendingFilterChange('multiSingleClass', event.target.value)
							}
						>
							<MenuItem value="">All Classes</MenuItem>
							{multiSingleClassOptions.map(({ label, value }) => (
								<MenuItem key={value} value={value}>
									{label}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</Box>
				<Box
					sx={{ px: 2, py: 1 }}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<FormControl fullWidth size="small">
						<InputLabel id="incident-severity-select-label">
							Incident Severity
						</InputLabel>
						<Select
							labelId="incident-severity-select-label"
							id="incident-severity-select"
							label="Incident Severity"
							value={pendingFilters.incidentCount}
							onChange={(event) =>
								handlePendingFilterChange('incidentCount', event.target.value)
							}
						>
							<MenuItem value="">All Severities</MenuItem>
							{incidentCountOptions.map(({ label, value }) => (
								<MenuItem key={value} value={value}>
									{label}
								</MenuItem>
							))}
						</Select>
					</FormControl>
				</Box>
				<Box
					sx={{
						display: 'flex',
						gap: 1,
						px: 2,
						py: 1.5,
						justifyContent: 'space-between',
						borderTop: '1px solid',
						borderColor: 'divider',
						backgroundColor: 'background.paper',
						position: 'sticky',
						bottom: 0,
					}}
					onClick={(event) => event.stopPropagation()}
					onKeyDown={(event) => event.stopPropagation()}
				>
					<Button
						size="small"
						variant="text"
						onClick={handleClearFilters}
						sx={{ color: 'text.secondary' }}
					>
						Clear Filters
					</Button>
					<Box sx={{ display: 'flex', gap: 1 }}>
						<Button size="small" variant="outlined" onClick={handleCancelFilters}>
							Cancel
						</Button>
						<Button size="small" variant="contained" onClick={handleApplyFilters}>
							Apply
						</Button>
					</Box>
				</Box>
			</Menu>
		</>
	);
};
