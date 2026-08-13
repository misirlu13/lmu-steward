import {
  MemoryRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
import './App.css';
import { Container, ThemeProvider } from '@mui/material';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { NavbarProvider } from './providers/NavbarContext';
import { DashboardView } from './views/Dashboard';
import { ApiProvider, useApi } from './providers/ApiContext';
import { NavBar } from './components/Navbar/NavBar';
import theme from './theme';
import { ReplayView } from './views/Replay';
import { DriverAnalysisView } from './views/DriverAnalysis';
import { LiveShell } from './views/Live/LiveShell';
import { LiveOverview } from './views/Live/LiveOverview';
import { LiveIncidents } from './views/Live/LiveIncidents';
import { LiveTiming } from './views/Live/LiveTiming';
import { CapturedSessionsView } from './views/CapturedSessions';
import { DriverDashboardView } from './views/DriverDashboard';
import { UserSettingsView } from './views/UserSettings';
import { LmuDisconnectedDialog } from './components/Common/LmuDisconnectedDialog';
import { AppExitConfirmDialog } from './components/Common/AppExitConfirmDialog';
import { ReplayProcessingSplash } from './components/Common/ReplayProcessingSplash';
import { RendererErrorBoundary } from './components/Common/RendererErrorBoundary';
import { LoadedReplayBar } from './components/Common/LoadedReplayBar';
import { useReplaySyncOnSessionEnd } from './hooks/useReplaySyncOnSessionEnd';

const AppRoutesShell = () => {
  const {
    isConnected,
    hasApiStatusResponse,
    isReplaySyncInProgress,
    replaySyncStatus,
  } = useApi();
  const location = useLocation();
  /*
    Mounted at the shell, not on the captured-sessions screen. A session ends
    while the steward is watching the live view; by the time they reach the
    screen that shows the link, the moment to go looking for the replay has
    passed.
  */
  useReplaySyncOnSessionEnd();
  const showDisconnectedDialog =
    hasApiStatusResponse &&
    !isConnected &&
    location.pathname !== '/user-settings';

  return (
    <>
      <NavBar />
      <Container
        sx={{
          backgroundColor: 'background.default',
          color: 'text.primary',
          flexGrow: 1,
          flexShrink: 1,
          display: 'flex',
          flexDirection: 'column',
          paddingY: 2,
          minHeight: '100vh',
          paddingTop: '98px',
          maxWidth: '1800px !important',
        }}
      >
        {/*
          Above the routes rather than fixed to an edge of the window. The live
          camera bar already owns the bottom, and a second fixed bar would sit
          on top of it the moment a steward opened the live view with a replay
          still loaded.
        */}
        <LoadedReplayBar />

        <Routes>
          {/*
            The driver dashboard is the landing page, with the replay list one
            click away at /replays. Existing links to "/" for the replay list
            keep working through the redirect below, and the dashboard sends a
            driver with no recorded sessions straight on to the replays it does
            have rather than opening on a page of zeros.
          */}
          <Route path="/" element={<DriverDashboardView />} />
          <Route path="/replays" element={<DashboardView />} />
          <Route path="/replay/:replayHash" element={<ReplayView />} />
          <Route
            path="/replay/:replayHash/driver/:driverId"
            element={<DriverAnalysisView />}
          />
          {/*
            The live view is a shell with its own left rail. `/live` stays the
            default child, so the navbar's sensor icon and every existing link
            to it still resolve. Later steps add their sections as further
            children — a section is routed once it has a screen behind it.
          */}
          <Route path="/live" element={<LiveShell />}>
            <Route index element={<LiveOverview />} />
            <Route path="incidents" element={<LiveIncidents />} />
            <Route path="timing" element={<LiveTiming />} />
          </Route>
          <Route path="/captured-sessions" element={<CapturedSessionsView />} />
          <Route path="/user-settings" element={<UserSettingsView />} />
        </Routes>
      </Container>
      <LmuDisconnectedDialog open={showDisconnectedDialog} />
      <ReplayProcessingSplash
        open={isReplaySyncInProgress}
        progressPercentage={replaySyncStatus.percentage}
        processedCount={replaySyncStatus.processed}
        totalCount={replaySyncStatus.total}
      />
      <AppExitConfirmDialog />
    </>
  );
};

const AppShell = () => {
  return (
    <Router>
      <AppRoutesShell />
    </Router>
  );
};

const App = () => {
  return (
    <ApiProvider>
      <NavbarProvider>
        <ThemeProvider theme={theme}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <RendererErrorBoundary>
              <AppShell />
            </RendererErrorBoundary>
          </LocalizationProvider>
        </ThemeProvider>
      </NavbarProvider>
    </ApiProvider>
  );
};

export default App;
