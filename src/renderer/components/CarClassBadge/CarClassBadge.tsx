import Box from "@mui/material/Box";

const carClassColorMap: Record<string, string> = {
  'P2': 'primary.dark',
  'P3': 'qualifying.main',
  'HY': 'error.main',
  'GT3': 'success.alt',
  'GTE': 'warning.alt',
};

export const getCarClassBadgeColor = (carClass: string) => {
  return carClassColorMap[carClass] || '#808080';
};

export const CarClassBadge: React.FC<{ carClass: string }> = ({ carClass }) => {
  const backgroundColor = getCarClassBadgeColor(carClass);

  return (
    <Box
      sx={{
        backgroundColor,
        color: '#fff',
        borderRadius: '4px',
        padding: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.75rem',
        lineHeight: '0.75rem',
        fontWeight: 'bold',
      }}
    >
      {carClass}
    </Box>
  );
};
