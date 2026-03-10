import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import GavelIcon from '@mui/icons-material/Gavel';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled';
import {
	Box,
	Button,
	Chip,
	Paper,
	Stack,
	Typography,
} from '@mui/material';
import { ReplayIncidentEvent, ReplayIncidentType } from '../Replay/ReplayMasterIncidentTimeline';
import { AiBadge } from '../Common/AiBadge';

interface DriverIncidentHistoryTimelineProps {
	filteredIncidents: ReplayIncidentEvent[];
	selectedIncidentTypes: ReplayIncidentType[];
	onToggleIncidentType: (type: ReplayIncidentType) => void;
	onSelectIncident: (incident: ReplayIncidentEvent) => void;
	onViewIncident: (incident: ReplayIncidentEvent) => void;
	activeIncidentId: string | null;
}

const incidentTypeLabel: Record<ReplayIncidentType, string> = {
	'track-limit': 'Track Limit',
	collision: 'Incident',
	penalty: 'Penalty',
};

const incidentTypeIcon: Record<ReplayIncidentType, React.ReactNode> = {
	'track-limit': <WarningAmberIcon fontSize="small" />,
	collision: <ReportProblemIcon fontSize="small" />,
	penalty: <GavelIcon fontSize="small" />,
};

const allIncidentTypes: ReplayIncidentType[] = ['track-limit', 'collision', 'penalty'];

export const DriverIncidentHistoryTimeline: React.FC<DriverIncidentHistoryTimelineProps> = ({
	filteredIncidents,
	selectedIncidentTypes,
	onToggleIncidentType,
	onSelectIncident,
	onViewIncident,
	activeIncidentId,
}) => {
	return (
		<Paper
			variant="outlined"
			sx={{
				borderColor: 'divider',
				borderRadius: 2,
				overflow: 'hidden',
				minHeight: 520,
				maxHeight: 760,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<Stack
				direction="row"
				spacing={1.5}
				alignItems="center"
				justifyContent="space-between"
				sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
			>
				<Typography variant="subtitle1" fontWeight={700}>Incident History Timeline</Typography>
				<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ ml: 'auto' }}>
					{allIncidentTypes.map((type) => {
						const selected = selectedIncidentTypes.includes(type);

						return (
							<Chip
								key={type}
								label={incidentTypeLabel[type]}
								color={
									type === 'track-limit'
										? 'warning'
										: type === 'penalty'
											? 'secondary'
											: 'error'
								}
								variant={selected ? 'filled' : 'outlined'}
								size="small"
								onClick={() => onToggleIncidentType(type)}
							/>
						);
					})}
				</Stack>
			</Stack>

			<Stack sx={{ p: 2, overflowY: 'auto' }} spacing={1.25}>
				{filteredIncidents.length ? (
					filteredIncidents.map((incident, index) => {
						const isActiveIncident = activeIncidentId === incident.id;

						return (
						<Stack
							key={incident.id}
							direction="row"
							spacing={1.25}
							alignItems="stretch"
							onClick={() => onSelectIncident(incident)}
							sx={{
								p: 1,
								borderRadius: 1,
								border: '1px solid',
								borderColor: 'divider',
								backgroundColor: isActiveIncident ? 'background.default' : 'transparent',
								borderLeft: isActiveIncident ? '2px solid' : '2px solid transparent',
								borderLeftColor: isActiveIncident ? 'text.disabled' : 'transparent',
								cursor: 'pointer',
								'&:hover': {
									backgroundColor: isActiveIncident ? 'background.default' : 'action.hover',
								},
							}}
						>
							<Box
								sx={{
									position: 'relative',
									width: 18,
									flexShrink: 0,
									display: 'flex',
									justifyContent: 'center',
									pt: 0.5,
								}}
							>
								{index !== filteredIncidents.length - 1 && (
									<Box
										sx={{
											position: 'absolute',
											top: 14,
											bottom: -20,
											width: 2,
											backgroundColor: 'divider',
										}}
									/>
								)}
								<Box
									sx={{
										zIndex: 1,
										width: 10,
										height: 10,
										borderRadius: '50%',
										backgroundColor:
											incident.type === 'collision'
												? 'error.main'
												: incident.type === 'penalty'
													? 'secondary.main'
													: 'warning.main',
									}}
								/>
							</Box>

							<Stack spacing={1} sx={{ flex: 1 }}>
								<Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
									<Box color="text.secondary">{incidentTypeIcon[incident.type]}</Box>
									<Stack spacing={0} sx={{ minWidth: 72 }}>
										<Typography className="incident-text" variant="caption" color="text.secondary">
											{incident.timestampLabel}
										</Typography>
										{incident.timestampEstimated ? (
											<Typography className="incident-text" variant="caption" color="text.secondary">
												(estimated)
											</Typography>
										) : null}
									</Stack>
									<Typography className="incident-text" variant="caption" sx={{ minWidth: 58 }} fontWeight={700}>
										{incident.lapLabel}
									</Typography>
									<Chip size="small" label={incidentTypeLabel[incident.type]} variant="outlined" />
								</Stack>
								<Stack direction="row" spacing={1} alignItems="center">
									<Stack direction="row" spacing={0.5} alignItems="center" useFlexGap sx={{ flex: 1, flexWrap: 'wrap' }}>
										{incident.drivers.map((entry, index) => (
											<Stack key={`${incident.id}-${entry.carNumber}-${index}`} direction="row" spacing={0.5} alignItems="center" useFlexGap>
												<Typography className="incident-text" variant="body2">
													{entry.displayName}
												</Typography>
												{entry.isAiDriver ? <AiBadge /> : null}
												{index < incident.drivers.length - 1 ? (
													<Typography className="incident-text" variant="body2" color="text.secondary">
														vs
													</Typography>
												) : null}
											</Stack>
										))}
									</Stack>
									<Button
										size="small"
										variant="contained"
										color={isActiveIncident ? 'secondary' : 'primary'}
										startIcon={<PlayCircleFilledIcon fontSize="small" />}
										onClick={(event) => {
											event.stopPropagation();
											onViewIncident(incident);
										}}
									>
										View
									</Button>
								</Stack>
								{incident.description ? (
									<Typography className="incident-text" variant="caption" color="text.secondary">
										{incident.description}
									</Typography>
								) : null}
							</Stack>
						</Stack>
						);
					})
				) : (
					<Typography variant="body2" color="text.secondary">
						No incidents for the selected filters.
					</Typography>
				)}
			</Stack>
		</Paper>
	);
};
