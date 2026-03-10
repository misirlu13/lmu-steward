import { Box, Button } from '@mui/material';

interface ReplayActionsProps {
  onViewChat: () => void;
}

export const ReplayActions: React.FC<ReplayActionsProps> = ({ onViewChat }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        justifyContent: 'flex-end',
        flexDirection: 'row',
      }}
    >
      <Button
        onClick={onViewChat}
        variant="contained"
        sx={{
          backgroundColor: 'background.alt',
          ':hover': { backgroundColor: 'background.paper' },
        }}
      >
        View Chat
      </Button>
    </Box>
  );
};
