import { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface ViewHeaderProps {
  title: ReactNode | string;
  subtitle?: ReactNode | string;
  breadcrumb?: ReactNode | string;
  actions?: ReactNode;
  onBack?: () => void;
}

export const ViewHeader: React.FC<ViewHeaderProps> = ({
  title,
  subtitle,
  breadcrumb,
  actions,
  onBack,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        mb: 3,
        justifyContent: 'flex-start',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 2,
      }}
    >
      {onBack && (
        <ArrowBackIcon
          sx={{ cursor: 'pointer', color: 'text.secondary', ':hover': { color: 'text.primary' } }}
          onClick={onBack}
        />
      )}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          gap: 0.5,
        }}
      >
        {typeof breadcrumb === 'string' ? (
          <Typography color="text.secondary" variant="caption">
            {breadcrumb}
          </Typography>
        ) : (
          breadcrumb
        )}
        {typeof title === 'string' ? (
          <Typography variant="h5">{title}</Typography>
        ) : (
          title
        )}
        {typeof subtitle === 'string' ? (
          <Typography color="text.secondary" variant="body2">
            {subtitle}
          </Typography>
        ) : (
          subtitle
        )}
      </Box>
      <Box sx={{ ml: 'auto' }}>{actions}</Box>
    </Box>
  );
};
