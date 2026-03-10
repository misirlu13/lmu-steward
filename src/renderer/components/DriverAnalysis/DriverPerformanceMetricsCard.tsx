import { Box, Divider, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { StatDisplay } from '../Common/StatDisplay';

interface DriverPerformanceMetricsCardProps {
	fastestLap: string;
	incidents: number;
	riskIndex: number;
}

export const DriverPerformanceMetricsCard: React.FC<DriverPerformanceMetricsCardProps> = ({
	fastestLap,
	incidents,
	riskIndex,
}) => {
	const riskColor =
		riskIndex >= 70 ? 'error.main' : riskIndex >= 40 ? 'warning.main' : 'success.main';

	return (
		<Paper variant="outlined" sx={{ borderColor: 'divider', borderRadius: 2, overflow: 'hidden', minHeight: 360 }}>
			<Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
				<Typography variant="subtitle1" fontWeight={700}>
					Performance Metrics
				</Typography>
			</Box>
			<Stack spacing={1.5} sx={{ p: 2 }}>
				<Stack
					direction="row"
					spacing={0}
					divider={<Divider orientation="vertical" flexItem />}
				>
					<StatDisplay label="Fastest Lap" minWidth={100}>
						<Typography variant="h6" fontWeight={700}>{fastestLap}</Typography>
					</StatDisplay>
					<StatDisplay label="Incidents" minWidth={90}>
						<Typography variant="h6" fontWeight={700}>{incidents}</Typography>
					</StatDisplay>
					<StatDisplay label="Risk" minWidth={80}>
						<Typography variant="h6" fontWeight={700}>{riskIndex}</Typography>
					</StatDisplay>
				</Stack>

				<Box>
					<Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
						<Typography variant="caption" color="text.secondary">Risk Utilization</Typography>
						<Typography variant="caption" fontWeight={700} color={riskColor}>
							{riskIndex}%
						</Typography>
					</Stack>
					<LinearProgress
						variant="determinate"
						value={Math.max(0, Math.min(100, riskIndex))}
						color={riskIndex >= 70 ? 'error' : riskIndex >= 40 ? 'warning' : 'success'}
						sx={{ height: 8, borderRadius: 8 }}
					/>
				</Box>

				<Typography variant="caption" color="text.secondary">
					Session performance summary excluding live telemetry focus.
				</Typography>
			</Stack>
		</Paper>
	);
};
