import { useEffect } from 'react';
import { LMUReplay, SessionIncidents, SessionMetaData } from '@types';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { CONSTANTS } from '@constants';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useState } from 'react';
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
import { useNavigate } from 'react-router-dom';
import { getSessionIncidentScore } from '@/renderer/utils/incidentScore';
import { SessionIncidentSeverityLabel } from '../IncidentSeverityLabels/SessionIncidentSeverityLabel';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { getSessionCarClasses, getSessionIncidents, getSessionMetaData, getSessionDuration } from '../../utils/sessionUtils';
import { CarClassBadge } from '../CarClassBadge/CarClassBadge';
import { ReplaySubtitle } from '../Common/ReplaySubtitle';

interface DashboardReplayProps {
  replayGroup: LMUReplay[];
}

interface DashboardReplayTableRow {
  hash: string;
  sessionType: 'Race' | 'Qualifying' | 'Practice';
  incidents: SessionIncidents;
  duration: string;
  sessionMetaData: SessionMetaData;
}

export const DashboardReplay: React.FC<DashboardReplayProps> = ({
  replayGroup,
}) => {
  const replay = replayGroup[0];
  const metaData =
    CONSTANTS.TRACK_META_DATA[
      replay.metadata.sceneDesc as keyof typeof CONSTANTS.TRACK_META_DATA
    ];
  const title = metaData?.displayName;
  const location = metaData?.location;
  const backgroundImage = metaData?.background;
  const [isActive, setIsActive] = useState<boolean>(false);
  const [tableRows, setTableRows] = useState<DashboardReplayTableRow[]>([]);
  const navigate = useNavigate();
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

  useEffect(() => {
    const rows = [...replayGroup]
      .sort((a, b) => {
        const aOrder =
          sessionOrder[a.metadata.session] ?? Number.MAX_SAFE_INTEGER;
        const bOrder =
          sessionOrder[b.metadata.session] ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      })
      .map((replay) => ({
        hash: replay.hash,
        sessionType: sessionTypeLabelMap[replay.metadata.session] ?? 'Practice',
        incidents: getSessionIncidents(replay),
        duration: getSessionDuration(replay),
        sessionMetaData: getSessionMetaData(replay),
      }));

    setTableRows(rows);
  }, [replayGroup]);

  const onViewReplay = (replayHash: string) => {
    navigate(`/replay/${replayHash}`);
  };

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
            ></Box>
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
              <ReplaySubtitle timestamp={replay.timestamp} location={location} />
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
                <Box sx={{display: 'flex', flexDirection: 'row', mt: 0.5, gap: 0.75}}>
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
            </Box>
          </Box>
        </AccordionSummary>
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
                      <Button
                        onClick={() => onViewReplay(row.hash)}
                        size="small"
                        variant="contained"
                      >
                        View Replay
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

