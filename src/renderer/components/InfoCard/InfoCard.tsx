import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';

interface InfoCardProps {
  title: string;
  content: string | number | React.ReactNode;
  icon?: React.ReactNode;
  status?: 'normal' | 'warning' | 'error' | 'success';
}

export const InfoCard = ({
  title,
  content,
  icon,
  status = 'normal',
}: InfoCardProps) => {
  const statusColors: Record<string, Record<string, string>> = {
    normal: {
      title: 'text.secondary',
      content: 'text.primary',
      icon: 'primary.main',
    },
    warning: {
      title: 'text.secondary',
      content: 'warning.main',
      icon: 'warning.main',
    },
    error: {
      title: 'text.secondary',
      content: 'error.main',
      icon: 'error.main',
    },
    success: {
      title: 'text.secondary',
      content: 'success.main',
      icon: 'success.main',
    },
  };

  return (
    <Card variant="outlined" sx={{borderRadius: '4px'}}>
      <CardContent>
        <Grid
          container
          spacing={4}
          direction="row"
          sx={{ justifyContent: 'flex-start', alignItems: 'center' }}
        >
          <Grid size={3}>
            {icon && (
              <Box sx={{ color: statusColors[status].icon }}>{icon}</Box>
            )}
          </Grid>
          <Grid size={9}>
            <Typography
              variant="body2"
              sx={{
                color: statusColors[status].title,
                fontFamily: 'monospace',
                marginBottom: 1,
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="h4"
              sx={{ color: statusColors[status].content }}
            >
              {content}
            </Typography>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
};
