import {
	Backdrop,
	Box,
	CircularProgress,
	LinearProgress,
	Paper,
	Stack,
	Typography,
} from '@mui/material';

interface ReplayLoadingScreenProps {
	progressDecimal: number;
	trackLabel?: string;
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

export const ReplayLoadingScreen: React.FC<ReplayLoadingScreenProps> = ({
	progressDecimal,
	trackLabel,
}) => {
	const normalizedProgress = clamp(
		Number.isFinite(progressDecimal) ? progressDecimal : 0,
		0,
		1,
	);
	const progressPercent = Math.round(normalizedProgress * 100);

	return (
		<Backdrop
			open
			sx={{
				zIndex: (theme) => theme.zIndex.modal + 1,
				backgroundColor: 'rgba(11, 18, 24, 0.82)',
				backdropFilter: 'blur(4px)',
			}}
		>
			<Paper
				variant="outlined"
				sx={{
					borderColor: 'divider',
					borderRadius: 2,
					px: { xs: 2.5, md: 4 },
					py: { xs: 2.5, md: 3 },
					width: '100%',
					maxWidth: 560,
				}}
			>
				<Stack spacing={2.25}>
					<Stack direction="row" spacing={1.5} alignItems="center">
						<CircularProgress size={22} thickness={5} />
						<Typography variant="h6" fontWeight={700}>
							Processing replays, this may take a minute
						</Typography>
					</Stack>

					<Typography variant="body2" color="text.secondary">
						LMU Steward is analyzing and loading replay data. Please keep this window open
						 until processing completes.
					</Typography>

					{trackLabel ? (
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ textTransform: 'uppercase', letterSpacing: 1 }}
						>
							{trackLabel}
						</Typography>
					) : null}

					<LinearProgress
						variant="determinate"
						value={progressPercent}
						sx={{
							height: 8,
							borderRadius: 999,
							backgroundColor: 'background.default',
						}}
					/>

					<Typography variant="caption" color="primary.main" fontWeight={700}>
						{progressPercent}%
					</Typography>
				</Stack>
			</Paper>
		</Backdrop>
	);
};
