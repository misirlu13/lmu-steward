import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Tooltip,
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
            <Tooltip
              title="Reads any result logs that are new or have changed since the last scan. Sessions already recorded are left as they are."
              placement="top"
            >
              <span>
                <Button
                  size="small"
                  startIcon={<RefreshRoundedIcon />}
                  onClick={() => onRescan()}
                  disabled={scanning}
                >
                  {scanning ? 'Scanning…' : 'Rescan'}
                </Button>
              </span>
            </Tooltip>
            {/*
              "Rebuild" sounds destructive, and the button most needing
              reassurance is the one people will not press without it. The
              tooltip leads with what it does not do.
            */}
            <Tooltip
              title="Re-reads every result log still on disk, including ones that have not changed. Nothing is removed — sessions whose logs are gone are kept, as is anything you have excluded. Use it if a figure looks wrong."
              placement="top"
            >
              <span>
                <Button
                  size="small"
                  color="inherit"
                  onClick={() => onRescan({ rebuild: true })}
                  disabled={scanning}
                >
                  Rebuild
                </Button>
              </span>
            </Tooltip>
          </Box>
        </Box>

        {/*
          Stated in the footer rather than only in a tooltip. That a session
          survives the deletion of the log it came from is the promise the whole
          feature rests on, and a promise nobody can find is not one.
        */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          Your career is built from the result logs LMU writes after every
          session, and it keeps them: a session stays on record even once you
          delete its log or its replay. <strong>Rescan</strong> picks up logs
          that are new or changed, which also happens automatically whenever
          replays are synced. <strong>Rebuild</strong> re-reads every log still
          on disk, for when a figure looks wrong. Neither removes a session.
        </Typography>
      </CardContent>
    </Card>
  );
};
