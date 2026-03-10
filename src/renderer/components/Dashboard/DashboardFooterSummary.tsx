import { Box, Pagination, Typography } from '@mui/material';

interface DashboardFooterSummaryProps {
  totalReplays: number;
  totalSessions: number;
  filteredReplays: number;
  filteredSessions: number;
  isFiltered: boolean;
  isConnected: boolean;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const DashboardFooterSummary: React.FC<DashboardFooterSummaryProps> = ({
  totalReplays,
  totalSessions,
  filteredReplays,
  filteredSessions,
  isFiltered,
  isConnected,
  page,
  totalPages,
  onPageChange,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        flexWrap: 'wrap',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '4px',
        padding: '8px 16px',
        backgroundColor: 'background.paper',
        gap: 4,
        mt: 'auto'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          flexGrow: 0,
          gap: 0.5,
        }}
      >
        <Typography
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
            fontSize: '10px',
            fontWeight: '500',
          }}
        >
          Replays
        </Typography>
        <Typography sx={{ fontWeight: '700', fontSize: '16px' }}>
          {isFiltered
            ? `${filteredReplays} / ${totalReplays} Replays`
            : `${totalReplays} Replays`}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          flexGrow: 0,
          gap: 0.5,
        }}
      >
        <Typography
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
            fontSize: '10px',
            fontWeight: '500',
          }}
        >
          Sessions
        </Typography>
        <Typography sx={{ fontWeight: '700', fontSize: '16px' }}>
          {isFiltered
            ? `${filteredSessions} / ${totalSessions} Sessions`
            : `${totalSessions} Sessions`}
        </Typography>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          flexGrow: 0,
          gap: 0.5,
        }}
      >
        <Typography
          sx={{
            color: 'text.secondary',
            textTransform: 'uppercase',
            fontSize: '10px',
            fontWeight: '500',
          }}
        >
          API Status
        </Typography>
        <Typography
          sx={{
            fontWeight: '700',
            fontSize: '16px',
            color: isConnected ? 'success.main' : 'error.main',
          }}
        >
          {isConnected ? 'Connected' : 'Disconnected'}
        </Typography>
      </Box>
      <Box
        sx={{
          ml: 'auto',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Pagination
          shape="rounded"
          count={totalPages}
          page={page}
          onChange={(_event, value) => onPageChange(value)}
        />
      </Box>
    </Box>
  );
};
