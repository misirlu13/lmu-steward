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
import { UserSettingsView } from './views/UserSettings';
import { LmuDisconnectedDialog } from './components/Common/LmuDisconnectedDialog';
import { AppExitConfirmDialog } from './components/Common/AppExitConfirmDialog';
import { ReplayProcessingSplash } from './components/Common/ReplayProcessingSplash';
import { RendererErrorBoundary } from './components/Common/RendererErrorBoundary';

const AppRoutesShell = () => {
  const {
    isConnected,
    hasApiStatusResponse,
    isReplaySyncInProgress,
    replaySyncStatus,
  } = useApi();
  const location = useLocation();
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
        <Routes>
          <Route path="/" element={<DashboardView />} />
          <Route path="/replay/:replayHash" element={<ReplayView />} />
          <Route
            path="/replay/:replayHash/driver/:driverId"
            element={<DriverAnalysisView />}
          />
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
