import SearchIcon from '@mui/icons-material/Search';
import TimelineIcon from '@mui/icons-material/Timeline';
import {
	Box,
	Button,
	Chip,
	FormControl,
	InputAdornment,
	InputLabel,
	MenuItem,
	Paper,
	Select,
	Stack,
	TextField,
	Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import Divider from '@mui/material/Divider';
import { buildFilteredReplayTimelineEvents } from './replayMasterTimelineFilters';
import { ReplayTimelineIncidentRow } from './ReplayTimelineIncidentRow';

export type ReplayIncidentType = 'track-limit' | 'collision' | 'penalty';

export interface ReplayIncidentDriver {
	carNumber: string;
	displayName: string;
	carClass: string;
	slotId?: string;
	driverSid?: string;
	isAiDriver?: boolean;
	hasLapData?: boolean;
}

export interface ReplayIncidentEvent {
	id: string;
	timestampLabel: string;
	timestampEstimated?: boolean;
	lapLabel: string;
	type: ReplayIncidentType;
	drivers: ReplayIncidentDriver[];
	description?: string;
	etSeconds?: number;
	jumpToSeconds?: number;
	heatmapSeverity?: 'minor' | 'serious' | 'critical';
	distanceMeters?: number;
}

interface ReplayMasterIncidentTimelineProps {
	events: ReplayIncidentEvent[];
	availableClasses: string[];
	selectedIncidentId?: string;
	onJumpToIncident?: (event: ReplayIncidentEvent) => void;
	hideJumpButtons?: boolean;
	dataCoverageNote?: string;
}

const incidentTypeLabel: Record<ReplayIncidentType, string> = {
	'track-limit': 'Track Limit',
	collision: 'Incident',
	penalty: 'Penalty',
};

const incidentTypeColor: Record<
	ReplayIncidentType,
	'warning' | 'error' | 'secondary'
> = {
	'track-limit': 'warning',
	collision: 'error',
	penalty: 'secondary',
};

const allTypes: ReplayIncidentType[] = ['track-limit', 'collision', 'penalty'];

export const ReplayMasterIncidentTimeline: React.FC<
	ReplayMasterIncidentTimelineProps
> = ({
	events,
	availableClasses,
	selectedIncidentId,
	onJumpToIncident,
	hideJumpButtons = false,
	dataCoverageNote,
}) => {
	const [selectedTypes, setSelectedTypes] = useState<ReplayIncidentType[]>(allTypes);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedClass, setSelectedClass] = useState<string>('all');
	const [hideLimitedData, setHideLimitedData] = useState(false);
	const hasLimitedDataRecords = useMemo(
		() =>
			events.some((event) =>
				event.drivers.some((driver) => driver.hasLapData === false),
			),
		[events],
	);

	useEffect(() => {
		if (!hasLimitedDataRecords && hideLimitedData) {
			setHideLimitedData(false);
		}
	}, [hasLimitedDataRecords, hideLimitedData]);
	const timelineScrollContainerRef = useRef<HTMLDivElement | null>(null);
	const incidentRowRefs = useRef<Record<string, HTMLDivElement | null>>({});

	const toggleType = (type: ReplayIncidentType) => {
		setSelectedTypes((prev) => {
			if (prev.includes(type)) {
				const next = prev.filter((entry) => entry !== type);
				return next.length ? next : prev;
			}
			return [...prev, type];
		});
	};

	const filteredEvents = useMemo(() => {
		return buildFilteredReplayTimelineEvents({
			events,
			hideLimitedData,
			selectedTypes,
			selectedClass,
			searchQuery,
		});
	}, [events, hideLimitedData, searchQuery, selectedClass, selectedTypes]);

	useEffect(() => {
		if (!selectedIncidentId) {
			return;
		}

		const selectedIndex = filteredEvents.findIndex(
			(event) => event.id === selectedIncidentId,
		);
		if (selectedIndex < 0) {
			return;
		}

		const container = timelineScrollContainerRef.current;
		const activeRow = incidentRowRefs.current[selectedIncidentId];
		if (!container || !activeRow) {
			return;
		}

		const isLastFilteredIncident = selectedIndex >= filteredEvents.length - 1;
		const nextIncident = filteredEvents[selectedIndex + 1];
		const nextRow = nextIncident ? incidentRowRefs.current[nextIncident.id] : null;
		const containerRect = container.getBoundingClientRect();
		const activeRowRect = activeRow.getBoundingClientRect();

		const desiredBottomBuffer = isLastFilteredIncident
			? 0
			: nextRow?.offsetHeight ?? activeRow.offsetHeight;
		const activeRowTopWithinContainer =
			activeRowRect.top - containerRect.top + container.scrollTop;

		const targetScrollTop =
			activeRowTopWithinContainer -
			(container.clientHeight - activeRow.offsetHeight - desiredBottomBuffer);

		const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
		const clampedScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));

		container.scrollTo({ top: clampedScrollTop, behavior: 'smooth' });
	}, [filteredEvents, selectedIncidentId]);

	return (
		<Paper
			variant="outlined"
			sx={{
				borderColor: 'divider',
				borderRadius: 2,
				overflow: 'hidden',
			}}
		>
			<Stack
				direction="row"
				alignItems="center"
				justifyContent="space-between"
				sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
			>
				<Stack spacing={0.5}>
					<Stack direction="row" spacing={1} alignItems="center">
					<TimelineIcon color="primary" fontSize="small" />
					<Typography variant="subtitle1" fontWeight={700}>
						Master Incident Timeline
					</Typography>
					<Chip
						label={`${events.length} Events Total`}
						size="small"
						variant="outlined"
						sx={{ height: 20, fontSize: 10 }}
					/>
					</Stack>
					{dataCoverageNote ? (
						<Typography variant="caption" color="text.secondary">
							{dataCoverageNote}
						</Typography>
					) : null}
				</Stack>
			</Stack>

			<Stack
				direction={{ xs: 'column', lg: 'row' }}
				spacing={1.5}
				alignItems={{ xs: 'stretch', lg: 'center' }}
				sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
			>
				<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
					{allTypes.map((type) => {
						const selected = selectedTypes.includes(type);
						return (
							<Chip
								key={type}
								label={incidentTypeLabel[type]}
								color={incidentTypeColor[type]}
								variant={selected ? 'filled' : 'outlined'}
								size="small"
								onClick={() => toggleType(type)}
							/>
						);
					})}
				</Stack>
        <Divider orientation='vertical' flexItem />
				<TextField
					size="small"
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder="Search driver / car #"
					sx={{ minWidth: 220 }}
					InputProps={{
						startAdornment: (
							<InputAdornment position="start">
								<SearchIcon fontSize="small" />
							</InputAdornment>
						),
					}}
				/>

				<FormControl size="small" sx={{ minWidth: 150 }}>
					<InputLabel id="replay-timeline-class-label">Class</InputLabel>
					<Select
						labelId="replay-timeline-class-label"
						label="Class"
						value={selectedClass}
						onChange={(event) => setSelectedClass(event.target.value)}
					>
						<MenuItem value="all">All Classes</MenuItem>
						{availableClasses.map((carClass) => (
							<MenuItem key={carClass} value={carClass}>
								{carClass}
							</MenuItem>
						))}
					</Select>
				</FormControl>

				{hasLimitedDataRecords ? (
					<Chip
						size="small"
						label="Hide Limited Data"
						variant={hideLimitedData ? 'filled' : 'outlined'}
						color={hideLimitedData ? 'primary' : 'default'}
						onClick={() => setHideLimitedData((previous) => !previous)}
					/>
				) : null}

				<Button
					sx={{ ml: 'auto !important' }}
					size="small"
					onClick={() => {
						setSelectedTypes(allTypes);
						setSearchQuery('');
						setSelectedClass('all');
						setHideLimitedData(false);
					}}
				>
					Reset Filters
				</Button>
			</Stack>

			<Box ref={timelineScrollContainerRef} sx={{ maxHeight: 280, overflowY: 'auto' }}>
				<Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>
					{filteredEvents.map((event) => {
						const isActiveIncident = selectedIncidentId === event.id;

						return (
						<ReplayTimelineIncidentRow
							ref={(node) => {
								incidentRowRefs.current[event.id] = node;
							}}
							key={event.id}
							event={event}
							isActiveIncident={isActiveIncident}
							hideJumpButtons={hideJumpButtons}
							incidentTypeLabel={incidentTypeLabel}
							incidentTypeColor={incidentTypeColor}
							onJumpToIncident={onJumpToIncident}
						/>
						);
					})}

					{!filteredEvents.length && (
						<Box sx={{ px: 2, py: 3 }}>
							<Typography variant="body2" color="text.secondary">
								No incidents match the active filters.
							</Typography>
						</Box>
					)}
				</Stack>
			</Box>
		</Paper>
	);
};
