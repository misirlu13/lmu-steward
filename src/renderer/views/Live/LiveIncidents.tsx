import { Box } from '@mui/material';
import { LiveTriageQueue } from '../../components/Live/LiveTriageQueue';
import { LiveIncidentDossier } from '../../components/Live/LiveIncidentDossier';
import { useLiveSession } from '../../providers/LiveSessionContext';

/**
 * The adjudication surface: the triage queue and the dossier for whatever is
 * selected in it.
 *
 * Both components are the ones that were squeezed into the old three-column
 * page; the only change here is that they now have the width. Step 5a
 * redesigns what is inside them — filters, the `DEFERRED` state, the nav badge.
 */
export const LiveIncidents: React.FC = () => {
  const {
    incidents,
    selectedIncident,
    selectedIncidentId,
    stateFilter,
    targetSteamId,
    onSelectIncident,
    onChangeStateFilter,
    onSelectTarget,
    onFocusCar,
    onFlag,
    onDecide,
  } = useLiveSession();

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: { xs: '1fr', lg: '420px minmax(0, 1fr)' },
        gridAutoRows: { xs: 'minmax(360px, auto)', lg: 'minmax(0, 1fr)' },
        height: { xs: 'auto', lg: '100%' },
        boxSizing: 'border-box',
      }}
    >
      <LiveTriageQueue
        incidents={incidents}
        selectedIncidentId={selectedIncidentId}
        stateFilter={stateFilter}
        onSelectIncident={onSelectIncident}
        onChangeStateFilter={onChangeStateFilter}
      />
      <LiveIncidentDossier
        incident={selectedIncident}
        targetSteamId={targetSteamId}
        onSelectTarget={onSelectTarget}
        onFocusCar={onFocusCar}
        onFlag={onFlag}
        onDecide={onDecide}
      />
    </Box>
  );
};
