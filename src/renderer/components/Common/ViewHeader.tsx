import { ReactNode, useEffect, useRef, useState } from 'react';
import { alpha } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavbar } from '@/renderer/providers/NavbarContext';

const NAVBAR_HEIGHT = 64;

interface ViewHeaderProps {
  title: ReactNode | string;
  subtitle?: ReactNode | string;
  breadcrumb?: ReactNode | string;
  actions?: ReactNode;
  onBack?: () => void;
}

export const ViewHeader: React.FC<ViewHeaderProps> = ({
  title,
  subtitle,
  breadcrumb,
  actions,
  onBack,
}) => {
  const [isCompact, setIsCompact] = useState(false);
  const { setIsViewHeaderAttached } = useNavbar();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateCompactState = () => {
      const sentinel = sentinelRef.current;
      if (!sentinel) {
        return;
      }

      const isCompact = sentinel.getBoundingClientRect().top <= NAVBAR_HEIGHT;
      setIsCompact(isCompact);
      setIsViewHeaderAttached(isCompact);
    };

    updateCompactState();
    window.addEventListener('scroll', updateCompactState, { passive: true });
    window.addEventListener('resize', updateCompactState);

    return () => {
      window.removeEventListener('scroll', updateCompactState);
      window.removeEventListener('resize', updateCompactState);
    };
  }, []);

  return (
    <>
      <Box
        ref={sentinelRef}
        sx={{
          height: 1,
          width: '100%',
          pointerEvents: 'none',
          visibility: 'hidden',
        }}
      >
      </Box>

      <Box
        sx={{
          position: 'sticky',
          top: `${NAVBAR_HEIGHT}px`,
          zIndex: (theme) => theme.zIndex.appBar - 1,
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: isCompact ? 'center' : 'flex-start',
            flexWrap: 'wrap',
            gap: isCompact ? 1.5 : 2,
            px: isCompact ? 2 : 0,
            py: isCompact ? 1.25 : 0,
            mx: isCompact ? -2 : 0,
            borderBottom: 1,
            borderColor: isCompact ? 'divider' : 'transparent',
            backgroundColor: (theme) =>
              isCompact
                ? alpha(theme.palette.background.default, 0.94)
                : theme.palette.background.default,
            backdropFilter: isCompact ? 'blur(12px)' : 'none',
            transition: (theme) =>
              theme.transitions.create(
                ['padding', 'margin', 'gap', 'background-color', 'border-color', 'backdrop-filter'],
                {
                  duration: theme.transitions.duration.shorter,
                },
              ),
            '& .view-header-back': {
              fontSize: isCompact ? '1.25rem' : '1.5rem',
              transition: (theme) =>
                theme.transitions.create('font-size', {
                  duration: theme.transitions.duration.shorter,
                }),
            },
            '& .view-header-title .MuiTypography-h5': {
              fontSize: isCompact ? '1.3rem' : undefined,
              lineHeight: isCompact ? 1.2 : undefined,
            },
            '& .view-header-title .MuiTypography-h6': {
              fontSize: isCompact ? '1.1rem' : undefined,
              lineHeight: isCompact ? 1.2 : undefined,
            },
            '& .view-header-subtitle .MuiTypography-body2': {
              fontSize: isCompact ? '0.8rem' : undefined,
            },
            '& .view-header-breadcrumb .MuiTypography-caption': {
              fontSize: isCompact ? '0.7rem' : undefined,
            },
            '& .view-header-title .MuiTypography-root, & .view-header-subtitle .MuiTypography-root, & .view-header-breadcrumb .MuiTypography-root': {
              transition: (theme) =>
                theme.transitions.create(['font-size', 'line-height'], {
                  duration: theme.transitions.duration.shorter,
                }),
            },
            '& .view-header-actions': {
              transform: isCompact ? 'scale(0.94)' : 'scale(1)',
              transformOrigin: 'right center',
              transition: (theme) =>
                theme.transitions.create('transform', {
                  duration: theme.transitions.duration.shorter,
                }),
            },
          }}
        >
          {onBack && (
            <ArrowBackIcon
              className="view-header-back"
              sx={{ cursor: 'pointer', color: 'text.secondary', ':hover': { color: 'text.primary' } }}
              onClick={onBack}
            />
          )}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'flex-start',
              gap: isCompact ? 0.25 : 0.5,
              minWidth: 0,
              transition: (theme) =>
                theme.transitions.create('gap', {
                  duration: theme.transitions.duration.shorter,
                }),
            }}
          >
            <Box className="view-header-breadcrumb">
              {typeof breadcrumb === 'string' ? (
                <Typography color="text.secondary" variant="caption">
                  {breadcrumb}
                </Typography>
              ) : (
                breadcrumb
              )}
            </Box>
            <Box className="view-header-title">
              {typeof title === 'string' ? (
                <Typography variant="h5">{title}</Typography>
              ) : (
                title
              )}
            </Box>
            <Box className="view-header-subtitle">
              {typeof subtitle === 'string' ? (
                <Typography color="text.secondary" variant="body2">
                  {subtitle}
                </Typography>
              ) : (
                subtitle
              )}
            </Box>
          </Box>
          <Box className="view-header-actions" sx={{ ml: 'auto' }}>
            {actions}
          </Box>
        </Box>
      </Box>
    </>
  );
};
