import PersonIcon from '@mui/icons-material/Person';
import { Avatar, Box, Paper, Stack, Typography } from '@mui/material';
import { ReplayDriverStanding } from '../Replay/ReplayDriverStandings';
import { StatDisplay } from '../Common/StatDisplay';
import { AiBadge } from '../Common/AiBadge';

interface DriverOverviewCardProps {
	driver: ReplayDriverStanding;
}

export const DriverOverviewCard: React.FC<DriverOverviewCardProps> = ({ driver }) => {
	const startingPosition =
		Number.isFinite(driver.startingPosition) && Number(driver.startingPosition) > 0
			? Number(driver.startingPosition)
			: Math.max(1, driver.position - 1);

	return (
		<Paper variant="outlined" sx={{ borderColor: 'divider', p: 2, borderRadius: 2 }}>
			<Stack direction="row" spacing={2} alignItems="center">
				<Avatar sx={{ width: 64, height: 64, bgcolor: 'background.alt' }}>
					<PersonIcon />
				</Avatar>
				<Box sx={{ flex: 1 }}>
					<Stack direction="row" spacing={0.75} alignItems="center" useFlexGap>
						<Typography variant="h6" fontWeight={700}>{driver.driverName}</Typography>
						{driver.isAiDriver ? <AiBadge /> : null}
					</Stack>
					<Typography variant="body2" color="text.secondary">
						#{driver.driverId} {driver.teamName}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Car: {driver.carName}
					</Typography>
				</Box>

				<Stack
					direction="row"
					spacing={0}
					divider={
						<Box
							sx={{
								width: 1,
								height: 'auto',
								backgroundColor: 'divider',
							}}
						/>
					}
					sx={{ width: 'auto', minWidth: 520 }}
				>
					<StatDisplay label="Starting Position" minWidth={150}>
						<Typography variant="h6" fontWeight={700}>
							{startingPosition}
						</Typography>
					</StatDisplay>
					<StatDisplay label="Finishing Position" minWidth={150}>
						<Typography variant="h6" fontWeight={700}>
							{driver.position}
						</Typography>
					</StatDisplay>
					<StatDisplay label="Class" minWidth={150}>
						<Typography variant="h6" fontWeight={700}>
							{driver.carClass}
						</Typography>
					</StatDisplay>
				</Stack>
			</Stack>
		</Paper>
	);
};
