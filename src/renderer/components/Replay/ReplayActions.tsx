import { Box, Button, Tooltip } from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';

interface ReplayActionsProps {
  onViewChat: () => void;
  /**
   * Hidden entirely when experimental features are off. Disabled, rather than
   * hidden, when the replay has no matched log: a .Vcr on its own is exactly
   * the half-a-hand-off that makes an import guess at which race it belongs to.
   */
  canExport: boolean;
  exportDisabledReason: string | null;
  onExport: () => void;
}

export const ReplayActions: React.FC<ReplayActionsProps> = ({
  onViewChat,
  canExport,
  exportDisabledReason,
  onExport,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        justifyContent: 'flex-end',
        flexDirection: 'row',
      }}
    >
      <Button
        onClick={onViewChat}
        variant="contained"
        sx={{
          backgroundColor: 'background.alt',
          ':hover': { backgroundColor: 'background.paper' },
        }}
      >
        View Chat
      </Button>
      {canExport ? (
        <Tooltip
          title={
            exportDisabledReason ?? 'Export this replay with its result log'
          }
        >
          <span>
            <Button
              onClick={onExport}
              disabled={Boolean(exportDisabledReason)}
              variant="contained"
              startIcon={<FileUploadIcon />}
              sx={{
                backgroundColor: 'background.alt',
                ':hover': { backgroundColor: 'background.paper' },
              }}
            >
              Export
            </Button>
          </span>
        </Tooltip>
      ) : null}
    </Box>
  );
};
