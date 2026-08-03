import { useState } from 'react';
import { Box, Button, Menu, MenuItem, Tooltip } from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { SessionExportFormat } from '../../utils/sessionExportFormats';

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
  /**
   * The session record, as opposed to the replay files. Deliberately a separate
   * control: one produces an archive for another LMU Steward install, the other
   * a report for a league's spreadsheet. Conflating them is how someone posts a
   * zip where they meant to post results.
   */
  sessionDataDisabledReason: string | null;
  onExportSessionData: (format: SessionExportFormat) => void;
  onCopySessionMarkdown: () => void;
}

const formatItems: { format: SessionExportFormat; label: string }[] = [
  { format: 'csv', label: 'CSV — spreadsheet' },
  { format: 'markdown', label: 'Markdown — document' },
  { format: 'json', label: 'JSON — league database' },
];

export const ReplayActions: React.FC<ReplayActionsProps> = ({
  onViewChat,
  canExport,
  exportDisabledReason,
  onExport,
  sessionDataDisabledReason,
  onExportSessionData,
  onCopySessionMarkdown,
}) => {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const closeMenu = () => setMenuAnchor(null);

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

      <Tooltip
        title={
          sessionDataDisabledReason ??
          'Export the session record — standings and incidents'
        }
      >
        <span>
          <Button
            onClick={(clickEvent) => setMenuAnchor(clickEvent.currentTarget)}
            disabled={Boolean(sessionDataDisabledReason)}
            variant="contained"
            startIcon={<DescriptionOutlinedIcon />}
            sx={{
              backgroundColor: 'background.alt',
              ':hover': { backgroundColor: 'background.paper' },
            }}
          >
            Export Data
          </Button>
        </span>
      </Tooltip>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
      >
        {formatItems.map((item) => (
          <MenuItem
            key={item.format}
            onClick={() => {
              closeMenu();
              onExportSessionData(item.format);
            }}
          >
            {item.label}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            closeMenu();
            onCopySessionMarkdown();
          }}
        >
          Copy Markdown to clipboard
        </MenuItem>
      </Menu>

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
              Export Replay
            </Button>
          </span>
        </Tooltip>
      ) : null}
    </Box>
  );
};
