import { Box, Typography } from '@mui/material';

interface StatDisplayProps {
  label: string;
  children: React.ReactNode;
  minWidth?: number;
}

export const StatDisplay: React.FC<StatDisplayProps> = ({
  label,
  children,
  minWidth = 170,
}) => {
  return (
    <Box sx={{ px: 2, minWidth, flex: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: 0.8 }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
};
