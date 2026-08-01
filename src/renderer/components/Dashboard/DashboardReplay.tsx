import { useEffect, useState } from 'react';
import {
  DashboardViewMode,
  LMUReplay,
  SessionIncidents,
  SessionMetaData,
} from '@types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CONSTANTS } from '@constants';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import RemoveRoadIcon from '@mui/icons-material/RemoveRoad';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import { Button } from '@mui/material';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ToolTip from '@mui/material/Tooltip';
import TireRepair from '@mui/icons-material/TireRepair';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import EditNoteIcon from '@mui/icons-material/EditNote';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useNavigate } from 'react-router-dom';
import { getSessionIncidentScore } from '@/renderer/utils/incidentScore';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { SessionIncidentSeverityLabel } from '../IncidentSeverityLabels/SessionIncidentSeverityLabel';
import {
  getSessionCarClasses,
  getSessionIncidents,
  getSessionMetaData,
  getSessionDuration,
} from '../../utils/sessionUtils';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { ReplaySubtitle } from '../Common/ReplaySubtitle';

interface DashboardReplayProps {
  replayGroup: LMUReplay[];
  dashboardView: DashboardViewMode;
  onArchive: (hashes: string[], targetLabel: string) => void;
  onRestore: (hashes: string[]) => void;
  onEditNote: (hash: string, note: string) => void;
  onDeleteImported: (hashes: string[], targetLabel: string) => void;
  onExportSession: (replay: LMUReplay) => void;
  onExportWeekend: (replays: LMUReplay[], weekendLabel: string) => void;
  canExport: boolean;
}

interface DashboardReplayTableRow {
  hash: string;
  sessionType: 'Race' | 'Qualifying' | 'Practice';
  incidents: SessionIncidents;
  duration: string;
  sessionMetaData: SessionMetaData;
  /**
   * The note shown on this row.
   *
   * Archived replays carry an archive note; imported ones carry the note
   * written at import. A replay is never both — the three views are mutually
   * exclusive — so one field renders either.
   */
  note: string;
  /**
   * The replay this row was built from, so row actions can work on it without
   * looking it back up out of the group by hash.
   */
  replay: LMUReplay;
}

const sessionOrder: Record<string, number> = {
  RACE: 0,
  QUALIFY: 1,
  PRACTICE: 2,
};

const sessionTypeLabelMap: Record<
  string,
  DashboardReplayTableRow['sessionType']
> = {
  RACE: 'Race',
  QUALIFY: 'Qualifying',
  PRACTICE: 'Practice',
};

const sessionColorMap: Record<string, string> = {
  Race: 'error.main',
  Qualifying: 'qualifying.main',
  Practice: 'success.main',
};

export const DashboardReplay: React.FC<DashboardReplayProps> = ({
  replayGroup,
  dashboardView,
  onArchive,
  onRestore,
  onEditNote,
  onDeleteImported,
  onExportSession,
  onExportWeekend,
  canExport,
}) => {
  const replay = replayGroup[0];
  const isArchivedView = dashboardView === 'archived';
  const isImportedView = dashboardView === 'imported';
  const weekendMenuLabel = isImportedView
    ? 'Weekend delete menu'
    : isArchivedView
      ? 'Weekend restore menu'
      : 'Weekend archive menu';
  const metaData =
    CONSTANTS.TRACK_META_DATA[
      replay.metadata.sceneDesc as keyof typeof CONSTANTS.TRACK_META_DATA
    ];
  const title = metaData?.displayName;
  const location = metaData?.location;
  const backgroundImage = metaData?.background;
  const [isActive, setIsActive] = useState<boolean>(false);
  const [tableRows, setTableRows] = useState<DashboardReplayTableRow[]>([]);
  const [weekendMenuAnchor, setWeekendMenuAnchor] =
    useState<HTMLElement | null>(null);
  const [rowMenu, setRowMenu] = useState<{
    anchor: HTMLElement;
    row: DashboardReplayTableRow;
  } | null>(null);
  const navigate = useNavigate();
  const groupHashes = replayGroup.map((groupReplay) => groupReplay.hash);
  /*
   * A session with no matched log is left out of the weekend rather than
   * blocking it. A .Vcr on its own is half a hand-off, but one unmatched
   * practice session is no reason to withhold the other four — so the count
   * here is what will actually be written, and the item only disappears when
   * that is nothing.
   */
  const exportableSessions = replayGroup.filter(
    (groupReplay) => groupReplay.logDataFileName,
  );

  useEffect(() => {
    const rows = [...replayGroup]
      .sort((a, b) => {
        const aOrder =
          sessionOrder[a.metadata.session] ?? Number.MAX_SAFE_INTEGER;
        const bOrder =
          sessionOrder[b.metadata.session] ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      })
      .map((groupReplay) => ({
        hash: groupReplay.hash,
        sessionType:
          sessionTypeLabelMap[groupReplay.metadata.session] ?? 'Practice',
        incidents: getSessionIncidents(groupReplay),
        duration: getSessionDuration(groupReplay),
        sessionMetaData: getSessionMetaData(groupReplay),
        note: groupReplay.archiveNote ?? groupReplay.importNote ?? '',
        replay: groupReplay,
      }));

    setTableRows(rows);
  }, [replayGroup]);

  const onViewReplay = (replayHash: string) => {
    navigate(`/replay/${replayHash}`);
  };

  const closeRowMenu = () => setRowMenu(null);

  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      <Accordion
        onChange={(event, expanded: boolean) => setIsActive(expanded)}
        sx={{ border: '1px solid', borderColor: 'divider' }}
      >
        <AccordionSummary
          expandIcon={<ExpandMoreIcon sx={{ color: 'text.secondary' }} />}
          sx={{
            borderBottom: '1px solid',
            borderBottomColor: `${isActive ? 'divider' : 'transparent'}`,
            backgroundColor: `${isActive ? 'background.alt' : 'transparent'}`,
            m: 0,
          }}
        >
          <Box
            sx={{
              width: '100%',
              display: 'flex',
              flexDirection: 'row',
              height: '96px',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '56px',
                height: '56px',
                backgroundColor: 'background.default',
                borderRadius: '4px',
                backgroundImage: `url(${CONSTANTS.LMU_API_BASE_URL}${backgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                justifyContent: 'center',
                alignItems: 'flex-start',
                gap: 0.5,
              }}
            >
              <Box>
                <Typography variant="h6">{title}</Typography>
              </Box>
              <ReplaySubtitle
                timestamp={replay.timestamp}
                location={location}
                gameType={replay.multiplayer ? 'Multiplayer' : 'Race Weekend'}
              />
              {/* <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  flexDirection: 'row',
                  gap: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LocationOnIcon
                    sx={{
                      width: '16px',
                      height: '16px',
                      color: 'text.secondary',
                    }}
                  />
                  <Typography color="text.secondary" variant="body2">
                    {location}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CalendarMonthIcon
                    sx={{
                      width: '16px',
                      height: '16px',
                      color: 'text.secondary',
                    }}
                  />
                  <Typography color="text.secondary" variant="body2">
                    {localizedDate}
                  </Typography>
                </Box>
              </Box> */}
            </Box>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-end',
                gap: 3,
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.25,
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  Car Class
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'row',
                    mt: 0.5,
                    gap: 0.75,
                  }}
                >
                  {getSessionCarClasses(replay)?.map((carClass) => (
                    <CarClassBadge key={carClass} carClass={carClass} />
                  ))}
                </Box>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.25,
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  Game Version
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: '700' }}>
                  {replay.logData?.GameVersion || 'Unknown'}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.25,
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  Replays
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: '700' }}>
                  {replayGroup.length}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.25,
                  mr: 3,
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <Typography
                  sx={{
                    color: 'text.secondary',
                    textTransform: 'uppercase',
                    fontSize: '12px',
                    fontWeight: '500',
                  }}
                >
                  Total Incidents
                </Typography>
                <SessionIncidentSeverityLabel
                  scorePerDriver={getSessionIncidentScore(
                    tableRows.reduce(
                      (total, row) => ({
                        trackLimits:
                          total.trackLimits + row.incidents.trackLimits,
                        incidents: total.incidents + row.incidents.incidents,
                        penalties: total.penalties + row.incidents.penalties,
                      }),
                      { trackLimits: 0, incidents: 0, penalties: 0 },
                    ),
                    replayGroup.find((r) => r.metadata.session === 'RACE')
                      ?.logData?.Race?.Driver?.length ||
                      replayGroup.find((r) => r.metadata.session === 'QUALIFY')
                        ?.logData?.Qualify?.Driver?.length ||
                      replayGroup.find((r) => r.metadata.session === 'PRACTICE')
                        ?.logData?.Practice1?.Driver?.length ||
                      1,
                  )}
                  totalIncidents={tableRows.reduce((total, row) => {
                    return (
                      total +
                      row.incidents.incidents +
                      row.incidents.trackLimits +
                      row.incidents.penalties
                    );
                  }, 0)}
                />
              </Box>
              <IconButton
                aria-label={weekendMenuLabel}
                size="small"
                // The button sits inside the accordion header, so the click has
                // to be kept from toggling the panel open.
                onClick={(event) => {
                  event.stopPropagation();
                  setWeekendMenuAnchor(event.currentTarget);
                }}
                onFocus={(event) => event.stopPropagation()}
                sx={{ alignSelf: 'center', color: 'text.secondary' }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </AccordionSummary>
        <Menu
          anchorEl={weekendMenuAnchor}
          open={Boolean(weekendMenuAnchor)}
          onClose={() => setWeekendMenuAnchor(null)}
        >
          {isImportedView ? (
            <MenuItem
              key="delete-weekend"
              onClick={() => {
                setWeekendMenuAnchor(null);
                onDeleteImported(groupHashes, title ?? 'this weekend');
              }}
            >
              <ListItemIcon>
                <DeleteForeverIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>
                Delete weekend from disk ({groupHashes.length})
              </ListItemText>
            </MenuItem>
          ) : isArchivedView ? (
            <MenuItem
              key="restore-weekend"
              onClick={() => {
                setWeekendMenuAnchor(null);
                onRestore(groupHashes);
              }}
            >
              <ListItemIcon>
                <UnarchiveIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>
                Restore weekend ({groupHashes.length})
              </ListItemText>
            </MenuItem>
          ) : (
            <MenuItem
              key="archive-weekend"
              onClick={() => {
                setWeekendMenuAnchor(null);
                onArchive(groupHashes, 'this weekend');
              }}
            >
              <ListItemIcon>
                <ArchiveIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>
                Archive weekend ({groupHashes.length})
              </ListItemText>
            </MenuItem>
          )}
          {/*
            One archive holding every session of the weekend, a directory each.
            Offered alongside per-session export rather than instead of it: a
            steward reviewing one incident wants the one session, and a steward
            handing a protest to another league wants the lot.
          */}
          {canExport ? (
            <MenuItem
              key="export-weekend"
              disabled={exportableSessions.length === 0}
              onClick={() => {
                setWeekendMenuAnchor(null);
                onExportWeekend(exportableSessions, title ?? 'Race weekend');
              }}
            >
              <ListItemIcon>
                <FileUploadIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>
                {exportableSessions.length === 0
                  ? 'Export weekend (no result logs)'
                  : `Export weekend (${exportableSessions.length})`}
              </ListItemText>
            </MenuItem>
          ) : null}
        </Menu>
        <AccordionDetails sx={{ m: 0, p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell
                    sx={{
                      paddingLeft: '24px',
                      fontSize: '11px',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Session Type
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: '11px',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Duration
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: '11px',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Track Limits
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: '11px',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Incidents
                  </TableCell>
                  <TableCell
                    sx={{
                      fontSize: '11px',
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    Penalties
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {tableRows.map((row) => (
                  <TableRow
                    key={row.hash}
                    sx={{
                      '&:last-child td, &:last-child th': { border: 0 },
                      ':hover': { backgroundColor: 'background.alt' },
                    }}
                  >
                    <TableCell sx={{ paddingLeft: '24px' }}>
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'row',
                          gap: 0.5,
                          justifyContent: 'flex-start',
                          alignItems: 'center',
                        }}
                      >
                        <Box
                          sx={{
                            height: '40px',
                            borderRadius: '16px',
                            mr: '8px',
                            width: '4px',
                            backgroundColor: sessionColorMap[row.sessionType],
                          }}
                        />
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'center',
                            flexDirection: 'column',
                            gap: 0.5,
                          }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: '700', fontSize: '16px' }}
                          >
                            {row.sessionType}
                          </Typography>
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              flexDirection: 'row',
                              color: 'text.secondary',
                            }}
                          >
                            <ToolTip
                              title={`Fuel Multiplier: ${row.sessionMetaData.fuelMultiplier}x`}
                            >
                              <LocalGasStationIcon
                                sx={{ width: '14px', height: '14px' }}
                              />
                            </ToolTip>
                            <ToolTip
                              title={`Tire Multiplier: ${row.sessionMetaData.tireMultiplier}x`}
                            >
                              <TireRepair
                                sx={{ width: '14px', height: '14px' }}
                              />
                            </ToolTip>
                            <ToolTip
                              title={`Tire Warmers: ${row.sessionMetaData.tireWarmers ? 'Yes' : 'No'}`}
                            >
                              <LocalFireDepartmentIcon
                                sx={{
                                  width: '14px',
                                  height: '14px',
                                  color: row.sessionMetaData.tireWarmers
                                    ? 'success.main'
                                    : 'text.secondary',
                                }}
                              />
                            </ToolTip>
                          </Box>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography
                        sx={{ fontFamily: 'monospace', fontSize: '14px' }}
                      >
                        {row.duration}
                      </Typography>
                    </TableCell>
                    <TableCell
                      sx={{
                        color: row.incidents.trackLimits
                          ? 'warning.main'
                          : 'text.secondary',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-start',
                          alignItems: 'center',
                          gap: 0.75,
                        }}
                      >
                        {row.incidents.trackLimits ? (
                          <>
                            <RemoveRoadIcon
                              sx={{ width: '16px', height: '16px' }}
                            />{' '}
                            {row.incidents.trackLimits}
                          </>
                        ) : (
                          '-'
                        )}
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        color: row.incidents.incidents
                          ? 'error.main'
                          : 'text.secondary',
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-start',
                          alignItems: 'center',
                          gap: 0.75,
                        }}
                      >
                        {row.incidents.incidents ? (
                          <>
                            <ReportProblemIcon
                              sx={{ width: '16px', height: '16px' }}
                            />{' '}
                            {row.incidents.incidents}
                          </>
                        ) : (
                          '-'
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ color: 'text.secondary' }}>
                      {row.incidents.penalties
                        ? `${row.incidents.penalties} Applied`
                        : '-'}
                    </TableCell>
                    <TableCell align="right">
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 1,
                        }}
                      >
                        {row.note ? (
                          <ToolTip title={row.note}>
                            <StickyNote2Icon
                              aria-label={`Note: ${row.note}`}
                              sx={{
                                width: '18px',
                                height: '18px',
                                color: 'text.secondary',
                              }}
                            />
                          </ToolTip>
                        ) : null}
                        <Button
                          onClick={() => onViewReplay(row.hash)}
                          size="small"
                          variant="contained"
                        >
                          View Replay
                        </Button>
                        <IconButton
                          aria-label={`Actions for ${row.sessionType}`}
                          size="small"
                          onClick={(event) =>
                            setRowMenu({ anchor: event.currentTarget, row })
                          }
                          sx={{ color: 'text.secondary' }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AccordionDetails>
      </Accordion>
      <Menu
        anchorEl={rowMenu?.anchor ?? null}
        open={Boolean(rowMenu)}
        onClose={closeRowMenu}
      >
        {isImportedView
          ? [
              <MenuItem
                key="delete-imported"
                onClick={() => {
                  closeRowMenu();
                  if (rowMenu) {
                    onDeleteImported(
                      [rowMenu.row.hash],
                      rowMenu.row.sessionType,
                    );
                  }
                }}
              >
                <ListItemIcon>
                  <DeleteForeverIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Delete from disk</ListItemText>
              </MenuItem>,
              /*
                Imported replays get note editing too. Without it the note
                written at import would be permanent, since an imported replay
                is never in the archived view where this action otherwise
                lives.
              */
              <MenuItem
                key="imported-note"
                onClick={() => {
                  closeRowMenu();
                  if (rowMenu) {
                    onEditNote(rowMenu.row.hash, rowMenu.row.note);
                  }
                }}
              >
                <ListItemIcon>
                  <EditNoteIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>
                  {rowMenu?.row.note ? 'Edit note' : 'Add note'}
                </ListItemText>
              </MenuItem>,
            ]
          : isArchivedView
            ? [
                <MenuItem
                  key="restore"
                  onClick={() => {
                    closeRowMenu();
                    if (rowMenu) {
                      onRestore([rowMenu.row.hash]);
                    }
                  }}
                >
                  <ListItemIcon>
                    <UnarchiveIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Restore session</ListItemText>
                </MenuItem>,
                <MenuItem
                  key="note"
                  onClick={() => {
                    closeRowMenu();
                    if (rowMenu) {
                      onEditNote(rowMenu.row.hash, rowMenu.row.note);
                    }
                  }}
                >
                  <ListItemIcon>
                    <EditNoteIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>
                    {rowMenu?.row.note ? 'Edit note' : 'Add note'}
                  </ListItemText>
                </MenuItem>,
              ]
            : [
                <MenuItem
                  key="archive"
                  onClick={() => {
                    closeRowMenu();
                    if (rowMenu) {
                      onArchive(
                        [rowMenu.row.hash],
                        `this ${rowMenu.row.sessionType}`,
                      );
                    }
                  }}
                >
                  <ListItemIcon>
                    <ArchiveIcon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText>Archive session</ListItemText>
                </MenuItem>,
              ]}
        {/*
          Offered in every view, and per session rather than per weekend: one
          replay and one result log is a pairing with nothing to resolve. A
          weekend can hold several races from restarts, which are only telling
          apart at all because each replay already knows its own log.
        */}
        {canExport ? (
          <MenuItem
            disabled={!rowMenu?.row.replay.logDataFileName}
            onClick={() => {
              closeRowMenu();
              if (rowMenu) {
                onExportSession(rowMenu.row.replay);
              }
            }}
          >
            <ListItemIcon>
              <FileUploadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>
              {rowMenu?.row.replay.logDataFileName
                ? 'Export session'
                : 'Export session (no result log)'}
            </ListItemText>
          </MenuItem>
        ) : null}
      </Menu>
    </Box>
  );
};
