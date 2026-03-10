import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import VideocamIcon from '@mui/icons-material/Videocam';
import {
	Box,
	Chip,
	IconButton,
	LinearProgress,
	Paper,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableRow,
	Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { CarClassBadge, getCarClassBadgeColor } from '../CarClassBadge/CarClassBadge';
import { SegmentedButtonGroup } from '../Common/SegmentedButtonGroup';
import { AiBadge } from '../Common/AiBadge';

export interface ReplayDriverStanding {
	position: number;
	startingPosition?: number;
	driverName: string;
	driverId: string;
	teamName: string;
	carName: string;
	carClass: string;
	fastestLap: string;
	incidents: number;
	riskIndex: number;
	teamColor?: string;
	isAiDriver?: boolean;
	slotId?: string;
	driverSid?: string;
	hasLapData?: boolean;
}

interface ReplayDriverStandingsProps {
	standings: ReplayDriverStanding[];
	onSelectDriver?: (driver: ReplayDriverStanding) => void;
	onFocusDriver?: (driver: ReplayDriverStanding) => void;
	dataCoverageNote?: string;
	canShowLimitedDataFilter?: boolean;
}

const classOrder = [
	'HYPERCAR',
	'HY',
	'LMP2',
	'P2',
	'LMP3',
	'GT3',
	'GTE',
];

const normalizeClassValue = (value: string) => value.trim().toUpperCase();

const getClassSortIndex = (value: string) => {
	const index = classOrder.indexOf(normalizeClassValue(value));
	return index === -1 ? classOrder.length : index;
};

const parseLapTimeToSeconds = (lapTime: string): number | null => {
	if (!lapTime) {
		return null;
	}

	const normalized = lapTime.trim();
	if (!normalized) {
		return null;
	}

	if (normalized.includes(':')) {
		const [minutesPart, secondsPart] = normalized.split(':');
		const minutes = Number(minutesPart);
		const seconds = Number(secondsPart);
		if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
			return null;
		}

		const total = minutes * 60 + seconds;
		return total > 0 ? total : null;
	}

	const raw = Number(normalized);
	if (!Number.isFinite(raw) || raw <= 0) {
		return null;
	}

	return raw;
};

export const ReplayDriverStandings: React.FC<ReplayDriverStandingsProps> = ({
	standings,
	onSelectDriver,
	onFocusDriver,
	dataCoverageNote,
	canShowLimitedDataFilter = true,
}) => {
	const carClasses = useMemo(
		() =>
			[...new Set(standings.map((entry) => entry.carClass).filter(Boolean))].sort(
				(left, right) => getClassSortIndex(left) - getClassSortIndex(right),
			),
		[standings],
	);

	const isMultiClass = carClasses.length > 1;
	const [selectedClass, setSelectedClass] = useState<string>('all');
	const [hideLimitedData, setHideLimitedData] = useState(false);
	const hasLimitedDataRecords = useMemo(
		() => standings.some((entry) => entry.hasLapData === false),
		[standings],
	);

	useEffect(() => {
		if ((!hasLimitedDataRecords || !canShowLimitedDataFilter) && hideLimitedData) {
			setHideLimitedData(false);
		}
	}, [canShowLimitedDataFilter, hasLimitedDataRecords, hideLimitedData]);

	const visibleStandings = useMemo(() => {
		const byClass = standings.filter((entry) => {
			if (selectedClass !== 'all' && entry.carClass !== selectedClass) {
				return false;
			}

			if (hideLimitedData && entry.hasLapData === false) {
				return false;
			}

			return true;
		});

		return [...byClass].sort((left, right) => {
			if (selectedClass === 'all') {
				const classDiff = getClassSortIndex(left.carClass) - getClassSortIndex(right.carClass);
				if (classDiff !== 0) {
					return classDiff;
				}
			}

			const positionDiff = left.position - right.position;
			if (positionDiff !== 0) {
				return positionDiff;
			}

			return left.driverName.localeCompare(right.driverName);
		});
	}, [hideLimitedData, selectedClass, standings]);

	const fastestLapByClass = useMemo(() => {
		const classFastest = new Map<string, number>();

		standings.forEach((entry) => {
			const lapSeconds = parseLapTimeToSeconds(entry.fastestLap);
			if (lapSeconds === null) {
				return;
			}

			const current = classFastest.get(entry.carClass);
			if (current === undefined || lapSeconds < current) {
				classFastest.set(entry.carClass, lapSeconds);
			}
		});

		return classFastest;
	}, [standings]);

	return (
		<Paper
			variant="outlined"
			sx={{
				borderColor: 'divider',
				borderRadius: 2,
				height: '100%',
				maxHeight: '428px',
				overflow: 'hidden',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<Stack
				direction={{ xs: 'column', md: 'row' }}
				spacing={1.5}
				alignItems={{ xs: 'flex-start', md: 'center' }}
        justifyContent={{ xs: 'space-between', md: 'space-between' }}
				sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
			>
				<Stack spacing={0.5}>
					<Stack direction="row" spacing={1} alignItems="center">
						<FormatListNumberedIcon color="primary" fontSize="small" />
						<Typography variant="subtitle1" fontWeight={700}>
							Driver Standings & Risk Index
						</Typography>
					</Stack>
					{dataCoverageNote ? (
						<Typography variant="caption" color="text.secondary">
							{dataCoverageNote}
						</Typography>
					) : null}
				</Stack>

				<Stack direction="row" spacing={1} alignItems="center" sx={{ ml: { md: 'auto' } }}>
					{isMultiClass && (
						<SegmentedButtonGroup
							ariaLabel="driver class filter button group"
							value={selectedClass}
							onChange={(value) => setSelectedClass(value)}
							size="small"
							options={[
								{ value: 'all', label: 'All' },
								...carClasses.map((carClass) => ({
									value: carClass,
									label: carClass,
									sx: {
										fontSize: '0.75rem',
										fontWeight: 700,
										textTransform: 'uppercase',
									},
									activeSx: {
										backgroundColor: getCarClassBadgeColor(carClass),
										color: '#fff',
										borderColor: getCarClassBadgeColor(carClass),
										'&:hover': {
											backgroundColor: getCarClassBadgeColor(carClass),
										},
									},
								})),
							]}
							sx={{
								'& .MuiButton-root': {
									fontSize: '0.75rem',
									fontWeight: 700,
									textTransform: 'uppercase',
								},
							}}
						/>
					)}
					{canShowLimitedDataFilter && hasLimitedDataRecords ? (
						<Chip
							size="small"
							label="Hide Limited Data"
							variant={hideLimitedData ? 'filled' : 'outlined'}
							color={hideLimitedData ? 'primary' : 'default'}
							onClick={() => setHideLimitedData((previous) => !previous)}
						/>
					) : null}
				</Stack>
			</Stack>

			<Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
				<Table
					size="small"
					stickyHeader
					sx={{
						minWidth: 680,
						'& .MuiTableCell-stickyHeader': {
							backgroundColor: 'background.paper',
						},
					}}
				>
					<TableHead>
						<TableRow>
							<TableCell>Pos</TableCell>
							<TableCell>Driver</TableCell>
							<TableCell>Car / Team</TableCell>
							<TableCell>Class</TableCell>
							<TableCell>Fastest</TableCell>
							<TableCell>Inc</TableCell>
							<TableCell>Risk Index</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{visibleStandings.map((entry) => {
						const lapSeconds = parseLapTimeToSeconds(entry.fastestLap);
						const classFastest = fastestLapByClass.get(entry.carClass);
						const isClassFastest =
							lapSeconds !== null &&
							classFastest !== undefined &&
							lapSeconds === classFastest;

						return (
							<TableRow
							hover
							key={`${entry.driverId}-${entry.position}`}
							onClick={() => onSelectDriver?.(entry)}
							sx={
								onSelectDriver
									? {
										cursor: 'pointer',
										'&:hover .driver-name': { color: 'primary.main' },
									}
									: undefined
							}
							>
							<TableCell sx={{ fontWeight: 700 }}>{entry.position}</TableCell>
							<TableCell>
								<Stack spacing={0.25}>
									<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
										<Stack direction="row" spacing={0.5} alignItems="center" useFlexGap>
											<Typography className="driver-name" variant="body2" fontWeight={700}>
												{entry.driverName}
											</Typography>
											{entry.isAiDriver ? <AiBadge /> : null}
										</Stack>
										<IconButton
											size="small"
											onClick={(event) => {
												event.stopPropagation();
												onFocusDriver?.(entry);
											}}
											disabled={!entry.slotId && !entry.driverSid}
											sx={{ p: 0.25, ml: 1 }}
										>
											<VideocamIcon fontSize="inherit" />
										</IconButton>
									</Stack>
									<Typography variant="caption" color="text.secondary">
										ID: {entry.driverId}
									</Typography>
									{entry.hasLapData === false ? (
										<Typography variant="caption" color="text.secondary">
											Limited lap-level data
										</Typography>
									) : null}
								</Stack>
							</TableCell>
							<TableCell>
								<Stack direction="row" spacing={1} alignItems="center">
									<Box
										sx={{
											width: 3,
											height: 30,
											borderRadius: 1,
											backgroundColor: entry.teamColor || 'primary.main',
										}}
									/>
									<Stack spacing={0.25}>
										<Typography variant="body2">{entry.teamName}</Typography>
										<Typography variant="caption" color="text.secondary">
											{entry.carName}
										</Typography>
									</Stack>
								</Stack>
							</TableCell>
							<TableCell>
								<CarClassBadge carClass={entry.carClass} />
							</TableCell>
							<TableCell>
								<Typography
									variant="body2"
									sx={{
										fontFamily: 'monospace',
										fontWeight: isClassFastest ? 700 : 400,
										color: isClassFastest ? 'qualifying.main' : 'text.primary',
									}}
								>
									{entry.fastestLap}
								</Typography>
							</TableCell>
							<TableCell>
								<Typography
									variant="body2"
									fontWeight={700}
									color={entry.incidents > 0 ? 'warning.main' : 'text.primary'}
								>
									{entry.incidents}
								</Typography>
							</TableCell>
							<TableCell>
								<Stack direction="row" spacing={1} alignItems="center">
									<LinearProgress
										variant="determinate"
										value={Math.max(0, Math.min(100, entry.riskIndex))}
										sx={{ width: 120, height: 8, borderRadius: 8 }}
										color={
											entry.riskIndex >= 70
												? 'error'
												: entry.riskIndex >= 40
													? 'warning'
													: 'success'
										}
									/>
									<Typography variant="caption" fontWeight={700}>
										{entry.riskIndex}
									</Typography>
								</Stack>
							</TableCell>
							</TableRow>
						);
						})}
					</TableBody>
				</Table>
			</Box>
		</Paper>
	);
};
