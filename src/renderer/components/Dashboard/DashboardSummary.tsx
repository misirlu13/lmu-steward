import Box from '@mui/material/Box';

interface DashboardSummaryProps {
  totalReplays: number;
}

export const DashboardSummary = (_props: DashboardSummaryProps) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    />
  );
};
