import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Badge,
  List,
  ListItemButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';

export interface LiveNavItem {
  /** Absolute path, so it matches `pathname` without any base juggling. */
  to: string;
  label: string;
  icon: React.ReactNode;
  /** Longer explanation for the tooltip, when the label alone is thin. */
  hint?: string;
}

/**
 * The rail's sections, in order.
 *
 * Deliberately a plain exported array: Steps 4–9 each add a section, and the
 * only edit any of them should need here is one more entry. The rail
 * intentionally carries fewer sections than the mockups' rail — a section is
 * added when it has a screen behind it, not before.
 */
export const LIVE_NAV_ITEMS: LiveNavItem[] = [
  {
    to: '/live',
    label: 'Overview',
    icon: <SpaceDashboardOutlinedIcon fontSize="small" />,
    hint: 'Session at a glance',
  },
  {
    to: '/live/incidents',
    label: 'Incidents',
    icon: <ReportProblemOutlinedIcon fontSize="small" />,
    hint: 'Triage queue and incident dossier',
  },
  {
    to: '/live/timing',
    label: 'Timing',
    icon: <TimerOutlinedIcon fontSize="small" />,
    hint: 'Live timing, sectors and the class filter',
  },
];

/**
 * `/live` is the shell's index route, so it is only current when nothing
 * follows it. Every other section owns its subtree.
 */
const isCurrent = (pathname: string, to: string): boolean => {
  const current = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return to === '/live' ? current === '/live' : current.startsWith(to);
};

interface LiveNavRailProps {
  items?: LiveNavItem[];
  /**
   * Counts to show against a section, keyed by its path. Empty today; Step 5
   * puts the unreviewed incident count on `/live/incidents`.
   */
  badges?: Record<string, number | undefined>;
}

export const LiveNavRail: React.FC<LiveNavRailProps> = ({
  items = LIVE_NAV_ITEMS,
  badges,
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <Paper
      variant="outlined"
      component="nav"
      aria-label="Live session sections"
      sx={{
        borderColor: 'divider',
        borderRadius: 2,
        alignSelf: 'start',
        position: { lg: 'sticky' },
        top: { lg: 168 },
      }}
    >
      <List disablePadding sx={{ py: 0.5 }}>
        {items.map((item) => {
          const current = isCurrent(pathname, item.to);
          const badgeContent = badges?.[item.to];

          return (
            <Tooltip
              key={item.to}
              title={item.hint ?? ''}
              placement="right"
              disableHoverListener={!item.hint}
            >
              <ListItemButton
                selected={current}
                aria-current={current ? 'page' : undefined}
                onClick={() => navigate(item.to)}
                sx={{
                  flexDirection: 'column',
                  gap: 0.25,
                  px: 1,
                  py: 1.25,
                  borderRadius: 1.5,
                  mx: 0.5,
                  color: current ? 'primary.main' : 'text.secondary',
                  '&:hover': {
                    color: current ? 'primary.main' : 'text.primary',
                  },
                }}
              >
                <Badge
                  color="error"
                  badgeContent={badgeContent}
                  sx={{ '& .MuiBadge-badge': { top: 2, right: -2 } }}
                >
                  {item.icon}
                </Badge>
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: current ? 700 : 400,
                    letterSpacing: 0.4,
                    lineHeight: 1.2,
                  }}
                >
                  {item.label}
                </Typography>
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
    </Paper>
  );
};
