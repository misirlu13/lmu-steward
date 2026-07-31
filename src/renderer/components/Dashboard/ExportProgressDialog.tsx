import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ExportProgressState } from '../../providers/ApiContext';

interface ExportProgressDialogProps {
  progress: ExportProgressState | null;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  return `${Math.round(bytes / 1024 ** 2)} MB`;
};

/**
 * Shown while an archive is being written.
 *
 * A weekend is several hundred MB to several GB of already-packed replay data
 * copied byte for byte, which takes minutes on a spinning disk — long enough
 * that a window with nothing moving in it reads as a hang. Progress is by bytes
 * rather than by session because a 250 MB practice session sitting next to a
 * 1 MB race would otherwise leave the bar still for most of the wait and then
 * jump.
 *
 * Not cancellable, and deliberately modal: it is a copy the user asked for,
 * there is no partial archive worth keeping, and nothing else on the dashboard
 * is safe to act on while it runs.
 */
export const ExportProgressDialog: React.FC<ExportProgressDialogProps> = ({
  progress,
}) => {
  const isRunning = progress?.status === 'in-progress';
  const percent =
    progress && progress.totalBytes > 0
      ? Math.min(100, (progress.bytesWritten / progress.totalBytes) * 100)
      : 0;

  return (
    <Dialog open={isRunning} maxWidth="xs" fullWidth>
      <DialogTitle>
        {progress && progress.total > 1
          ? `Exporting weekend (${Math.min(
              progress.processed + 1,
              progress.total,
            )} of ${progress.total})`
          : 'Exporting replay'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" noWrap>
          {progress?.currentLabel || 'Preparing…'}
        </Typography>
        <Box sx={{ mt: 2 }}>
          <LinearProgress
            variant="determinate"
            value={percent}
            aria-label="Export progress"
          />
        </Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            mt: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {formatBytes(progress?.bytesWritten ?? 0)} of{' '}
            {formatBytes(progress?.totalBytes ?? 0)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {Math.round(percent)}%
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
