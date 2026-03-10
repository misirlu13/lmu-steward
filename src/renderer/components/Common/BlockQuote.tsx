import Box from '@mui/material/Box';

export type BlockQuoteType =
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'P2'
  | 'P3'
  | 'HY'
  | 'GT3'
  | 'GTE';

interface BlockQuoteProps {
  type: BlockQuoteType;
  children: React.ReactNode;
}

export const BlockQuote: React.FC<BlockQuoteProps> = ({ type, children }) => {
  const borderColorMap = {
    info: 'primary.main',
    warning: 'warning.main',
    error: 'error.main',
    success: 'success.main',
    P2: 'primary.dark', // Dark Blue
    P3: 'qualifying.main', // Purple
    HY: 'error.main', // Red
    GT3: 'success.alt', // Green
    GTE: 'warning.alt', // Yellow
  };

  return (
    <Box
      sx={{
        borderLeft: '4px solid',
        borderLeftColor: borderColorMap[type],
        backgroundColor: 'background.default',
        boxSizing: 'border-box',
        borderRadius: '4px',
        padding: 2,
        pl: 2,
        m: 0,
      }}
    >
      {children}
    </Box>
  );
};
