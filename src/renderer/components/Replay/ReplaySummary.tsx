import CloudIcon from '@mui/icons-material/Cloud';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import GrainIcon from '@mui/icons-material/Grain';
import ThunderstormIcon from '@mui/icons-material/Thunderstorm';
import WbSunnyIcon from '@mui/icons-material/WbSunny';
import {
	Box,
	Chip,
	Divider,
	Paper,
	Stack,
	Typography,
} from '@mui/material';
import { StatDisplay } from '../Common/StatDisplay';
import { SessionIncidentSeverityLabel } from '../IncidentSeverityLabels/SessionIncidentSeverityLabel';

export type WeatherCondition =
	| 'clear'
	| 'slightly-cloudy'
	| 'cloudy'
	| 'light-rain'
	| 'heavy-rain';

interface ReplaySummaryClassCount {
	label: string;
	value: number;
}

interface ReplaySummaryWeather {
	condition: WeatherCondition;
	lowTempC: number;
	highTempC: number;
	wind: string;
}

interface ReplaySummaryProps {
	lapsCompletedLabel: string;
	lapsCompletionPercent: number;
	durationLabel: string;
	totalDriversLabel: string;
	driverCoverageNote?: string;
	totalIncidents: number;
	incidentScorePerDriver: number;
	classCounts: ReplaySummaryClassCount[];
	weather: ReplaySummaryWeather;
	isQuickViewModeActive?: boolean;
}

const weatherConditionConfig: Record<
	WeatherCondition,
	{ label: string; icon: React.ReactNode }
> = {
	clear: { label: 'Clear Skies', icon: <WbSunnyIcon fontSize="small" /> },
	'slightly-cloudy': {
		label: 'Slightly Cloudy',
		icon: <CloudQueueIcon fontSize="small" />,
	},
	cloudy: { label: 'Cloudy', icon: <CloudIcon fontSize="small" /> },
	'light-rain': { label: 'Light Rain', icon: <GrainIcon fontSize="small" /> },
	'heavy-rain': {
		label: 'Heavy Rain',
		icon: <ThunderstormIcon fontSize="small" />,
	},
};

export const ReplaySummary: React.FC<ReplaySummaryProps> = ({
	lapsCompletedLabel,
	lapsCompletionPercent,
	durationLabel,
	totalDriversLabel,
	driverCoverageNote,
	totalIncidents,
	incidentScorePerDriver,
	classCounts,
	weather,
	isQuickViewModeActive = false,
}) => {
	const weatherConfig = weatherConditionConfig[weather.condition];

	return (
		<Paper
			variant="outlined"
			sx={{
				backgroundColor: 'background.paper',
				borderColor: 'divider',
				borderRadius: 2,
				px: 1,
				py: 2,
			}}
		>
			<Stack
				direction={{ xs: 'column', md: 'row' }}
				divider={<Divider orientation="vertical" flexItem />}
				spacing={{ xs: 2, md: 0 }}
			>
				<StatDisplay label="Laps Completed">
					<Stack direction="row" spacing={1} alignItems="baseline">
						<Typography variant="h5" fontWeight={700}>
							{lapsCompletedLabel}
						</Typography>
						<Typography variant="caption" color="success.main" fontWeight={700}>
							{Math.round(lapsCompletionPercent)}%
						</Typography>
					</Stack>
				</StatDisplay>

				<StatDisplay label="Duration">
					<Typography variant="h5" fontWeight={700}>
						{isQuickViewModeActive ? '--:--:--' : durationLabel}
					</Typography>
				</StatDisplay>

				<StatDisplay label="Total Drivers">
					<Typography variant="h6" fontWeight={700}>
						{isQuickViewModeActive ? '-- Drivers' : totalDriversLabel}
					</Typography>
					{isQuickViewModeActive ? (
						<Typography variant="caption" color="text.secondary" mt={0.5}>
							Load replay to view driver roster and class split.
						</Typography>
					) : (
						<>
							{driverCoverageNote ? (
								<Typography variant="caption" color="text.secondary" mt={0.5}>
									{driverCoverageNote}
								</Typography>
							) : null}
							<Stack direction="row" spacing={0.5} mt={0.5} flexWrap="wrap" useFlexGap>
								{classCounts.map((entry) => (
									<Chip
										key={entry.label}
										size="small"
										label={`${entry.value} ${entry.label}`}
										variant="outlined"
										sx={{ height: 18, fontSize: 10 }}
									/>
								))}
							</Stack>
						</>
					)}
				</StatDisplay>

				<StatDisplay label="Total Incidents">
					<SessionIncidentSeverityLabel
						scorePerDriver={incidentScorePerDriver}
						totalIncidents={totalIncidents}
						size="h5"
					/>
				</StatDisplay>

				<StatDisplay label="Weather Conditions">
					<Stack direction="row" spacing={1} alignItems="center">
						<Box color="text.secondary">{weatherConfig.icon}</Box>
						<Box>
							<Typography variant="body2" fontWeight={700}>
								{isQuickViewModeActive
									? '--°C / --°C'
									: `${weather.lowTempC}°C / ${weather.highTempC}°C`}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{isQuickViewModeActive
									? 'Weather telemetry unavailable in Quick View'
									: `${weatherConfig.label} | Wind: ${weather.wind}`}
							</Typography>
						</Box>
					</Stack>
				</StatDisplay>
			</Stack>
		</Paper>
	);
};
