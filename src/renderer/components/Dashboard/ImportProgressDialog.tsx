import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ImportProgressState } from '../../providers/ApiContext';

interface ImportProgressDialogProps {
  progress: ImportProgressState | null;
}

const formatBytes = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(bytes / 1024 ** 2)} MB`;

const titles: Record<string, string> = {
  extracting: 'Unpacking archive',
  scanning: 'Reading replays',
  importing: 'Importing replays',
};

/**
 * Shown for every stage of a bulk import.
 *
 * The three stages measure different things and the bar has to say which:
 * unpacking counts bytes out of a multi-GB archive, scanning reads the trailer
 * off every .Vcr and cannot know how many there are until it is done, and
 * importing counts replays copied. Reporting any of them as the others would
 * misstate how far along it is.
 *
 * Scanning gets an indeterminate bar for exactly that reason — it is honest
 * about not knowing rather than inventing a percentage.
 */
export const ImportProgressDialog: React.FC<ImportProgressDialogProps> = ({
  progress,
}) => {
  const isRunning = progress?.status === 'in-progress';
  const phase = progress?.phase ?? 'importing';
  const isExtracting = phase === 'extracting';
  const isScanning = phase === 'scanning';

  const percent =
    progress && progress.total > 0
      ? Math.min(100, (progress.processed / progress.total) * 100)
      : 0;

  return (
    <Dialog open={isRunning} maxWidth="xs" fullWidth>
      <DialogTitle>{titles[phase] ?? 'Importing replays'}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" noWrap>
          {progress?.currentLabel || 'Preparing…'}
        </Typography>
        <Box sx={{ mt: 2 }}>
          <LinearProgress
            variant={isScanning ? 'indeterminate' : 'determinate'}
            value={percent}
            aria-label="Import progress"
          />
        </Box>
        {isScanning ? null : (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {isExtracting
                ? `${formatBytes(progress?.processed ?? 0)} of ${formatBytes(
                    progress?.total ?? 0,
                  )}`
                : `${progress?.processed ?? 0} of ${progress?.total ?? 0} replays`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {Math.round(percent)}%
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
