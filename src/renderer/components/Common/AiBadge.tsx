import { Box } from '@mui/material';

export const AiBadge: React.FC = () => {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 0.5,
        py: '1px',
        borderRadius: '4px',
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.alt',
        color: 'text.secondary',
        fontSize: '0.625rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        lineHeight: 1,
      }}
    >
      AI
    </Box>
  );
};
