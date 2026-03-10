import { Box, Button, Chip, Divider, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { ReplayIncidentEvent, ReplayIncidentType } from '../Replay/ReplayMasterIncidentTimeline';
import { StatDisplay } from '../Common/StatDisplay';

interface FaultIncidentSummary {
	'track-limit': number;
	collision: number;
	penalty: number;
}

interface DriverFaultAnalysisCardProps {
	activeIncident: ReplayIncidentEvent | null;
	onReset: () => void;
	faultIncidentSummary: FaultIncidentSummary;
	faultRiskIndex: number;
	faultDominantType: ReplayIncidentType;
	faultTotalIncidents: number;
	faultDominantPercent: number;
	subjectPct: number;
	secondaryPct: number;
	topCounterpartyText: string;
	topPenaltyReasonText: string;
}

const incidentTypeLabel: Record<ReplayIncidentType, string> = {
	'track-limit': 'Track Limit',
	collision: 'Incident',
	penalty: 'Penalty',
};

export const DriverFaultAnalysisCard: React.FC<DriverFaultAnalysisCardProps> = ({
	activeIncident,
	onReset,
	faultIncidentSummary,
	faultRiskIndex,
	faultDominantType,
	faultTotalIncidents,
	faultDominantPercent,
	subjectPct,
	secondaryPct,
	topCounterpartyText,
	topPenaltyReasonText,
}) => {
	return (
		<Paper variant="outlined" sx={{ borderColor: 'divider', borderRadius: 2, overflow: 'hidden', minHeight: 360 }}>
			<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
				<Typography variant="subtitle1" fontWeight={700}>
					Fault Analysis
				</Typography>
				<Stack direction="row" spacing={1} alignItems="center">
					<Chip
						size="small"
						label={activeIncident ? 'Focused Incident' : 'Session Summary'}
						variant={activeIncident ? 'filled' : 'outlined'}
						color={activeIncident ? 'primary' : 'default'}
					/>
					{activeIncident && (
						<Button size="small" onClick={onReset}>
							Reset
						</Button>
					)}
				</Stack>
			</Stack>
			<Stack spacing={1.5} sx={{ p: 2 }}>
				<Stack
					direction="row"
					spacing={0}
					divider={<Divider orientation="vertical" flexItem />}
				>
					<StatDisplay label="Track Limits" minWidth={95}>
						<Typography variant="h6" fontWeight={700}>{faultIncidentSummary['track-limit']}</Typography>
					</StatDisplay>
					<StatDisplay label="Incidents" minWidth={90}>
						<Typography variant="h6" fontWeight={700}>{faultIncidentSummary.collision}</Typography>
					</StatDisplay>
					<StatDisplay label="Penalties" minWidth={90}>
						<Typography variant="h6" fontWeight={700}>{faultIncidentSummary.penalty}</Typography>
					</StatDisplay>
					<StatDisplay label="Risk Index" minWidth={90}>
						<Typography variant="h6" fontWeight={700}>{faultRiskIndex}</Typography>
					</StatDisplay>
				</Stack>

				<Box>
					<Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
						<Typography variant="caption" color="text.secondary">Dominant Incident Type</Typography>
						<Chip size="small" variant="outlined" label={incidentTypeLabel[faultDominantType]} />
					</Stack>
					<LinearProgress
						variant="determinate"
						value={faultTotalIncidents ? faultDominantPercent : 0}
						sx={{ height: 8, borderRadius: 8 }}
					/>
				</Box>

				<Box>
					<Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
						<Typography variant="caption" color="text.secondary">Collision Role (Subject / Secondary)</Typography>
						<Typography variant="caption" fontWeight={700}>
							{subjectPct}% / {secondaryPct}%
						</Typography>
					</Stack>
					<Stack direction="row" spacing={1}>
						<Box sx={{ flex: 1 }}>
							<LinearProgress variant="determinate" value={subjectPct} sx={{ height: 8, borderRadius: 8 }} />
						</Box>
						<Box sx={{ flex: 1 }}>
							<LinearProgress variant="determinate" value={secondaryPct} color="warning" sx={{ height: 8, borderRadius: 8 }} />
						</Box>
					</Stack>
				</Box>

				<Typography variant="caption" color="text.secondary">
					{topCounterpartyText}
				</Typography>

				<Typography variant="caption" color="text.secondary">
					{topPenaltyReasonText}
				</Typography>
			</Stack>
		</Paper>
	);
};
