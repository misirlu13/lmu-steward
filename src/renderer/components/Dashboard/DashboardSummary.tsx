import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import ReplayIcon from '@mui/icons-material/Replay';
import { InfoCard } from '../InfoCard/InfoCard';

interface DashboardSummaryProps {
  totalReplays: number;
}

export const DashboardSummary = ({ totalReplays }: DashboardSummaryProps) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      
    </Box>
  );
};
