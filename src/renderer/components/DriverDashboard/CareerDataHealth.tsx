import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Typography,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { CareerAggregate } from '@types';
import { formatCount } from './careerFormat';

interface CareerDataHealthProps {
  aggregate: CareerAggregate;
  scanning: boolean;
  onRescan: (options?: { rebuild?: boolean }) => void;
  onClaimIdentity: (name: string) => void;
}

const formatScannedAt = (scannedAt: number | undefined): string => {
  if (!scannedAt) {
    return 'not yet scanned';
  }

  const minutes = Math.round((Date.now() - scannedAt) / 60000);
  if (minutes < 1) return 'scanned just now';
  if (minutes < 60) return `scanned ${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  return hours < 24 ? `scanned ${hours} h ago` : 'scanned over a day ago';
};

/**
 * Makes the persistence guarantee visible rather than merely true.
 *
 * A user who deletes replays to reclaim disk needs to see that their history
 * survived it — "38 sessions whose files are gone" is the whole promise of the
 * feature, stated plainly.
 */
export const CareerDataHealth = ({
  aggregate,
  scanning,
  onRescan,
  onClaimIdentity,
}: CareerDataHealthProps) => {
  const { dataHealth, identity } = aggregate;
  const scan = dataHealth.lastScan;

  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        {identity.unclaimed.length > 0 ? (
          <Alert
            severity="info"
            sx={{ mb: 1.5 }}
            action={
              <Button
                size="small"
                onClick={() => onClaimIdentity(identity.unclaimed[0].name)}
                disabled={scanning}
              >
                That&apos;s me
              </Button>
            }
          >
            {formatCount(identity.unclaimed[0].sessionCount)} sessions were
            raced as <strong>{identity.unclaimed[0].name}</strong>, which
            isn&apos;t a name this career knows.
          </Alert>
        ) : null}

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {scan
              ? `Built from ${formatCount(scan.logsSeen)} result logs`
              : 'No scan yet'}
            {dataHealth.sessionsWithMissingFiles > 0
              ? ` · ${formatCount(dataHealth.sessionsWithMissingFiles)} sessions whose files are no longer on disk, kept anyway`
              : ''}
            {dataHealth.excludedSessions > 0
              ? ` · ${formatCount(dataHealth.excludedSessions)} excluded`
              : ''}
            {scan?.skippedImported
              ? ` · ${formatCount(scan.skippedImported)} imported logs ignored`
              : ''}
            {` · ${formatScannedAt(scan?.scannedAt)}`}
          </Typography>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<RefreshRoundedIcon />}
              onClick={() => onRescan()}
              disabled={scanning}
            >
              {scanning ? 'Scanning…' : 'Rescan'}
            </Button>
            <Button
              size="small"
              color="inherit"
              onClick={() => onRescan({ rebuild: true })}
              disabled={scanning}
            >
              Rebuild
            </Button>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};
