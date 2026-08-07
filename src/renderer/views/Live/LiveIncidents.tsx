import { useMemo } from 'react';
import { Box } from '@mui/material';
import { LiveIncidentFilters } from '../../components/Live/LiveIncidentFilters';
import { LiveTriageQueue } from '../../components/Live/LiveTriageQueue';
import { LiveIncidentDossier } from '../../components/Live/LiveIncidentDossier';
import { matchesLiveIncidentFilters } from '../../components/Live/liveFixtures';
import { useLiveSession } from '../../providers/LiveSessionContext';

/**
 * The adjudication surface: the quick filters, the triage queue, and the
 * dossier for whatever is selected in it.
 *
 * The filter bar spans both columns because it scopes both — the dossier is
 * showing one of the incidents the bar decided are worth looking at. Below it,
 * the list takes about a third and the dossier the rest: the list rows are
 * fixed-height summaries that stop benefiting from width, while the dossier
 * carries a per-car measurements table and a trace chart that keep using it.
 */
export const LiveIncidents: React.FC = () => {
  const {
    incidents,
    selectedIncident,
    selectedIncidentId,
    stateFilter,
    incidentFilters,
    incidentFilterOptions,
    targetSteamId,
    onSelectIncident,
    onChangeStateFilter,
    onChangeIncidentFilters,
    onResetIncidentFilters,
    onSelectTarget,
    onFocusCar,
    onFlag,
    onDefer,
    onDecide,
  } = useLiveSession();

  /*
    The queue runs the same pass for itself. Deliberately not hoisted and
    threaded through: it is one linear scan of a list capped at 500, and paying
    for it twice costs less than a component that filters somewhere other than
    where it windows — which is the bug the plan warns about.
  */
  const matchCount = useMemo(
    () =>
      incidents.filter((incident) =>
        matchesLiveIncidentFilters(incident, incidentFilters),
      ).length,
    [incidentFilters, incidents],
  );

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: '1fr',
          lg: 'minmax(380px, 34%) minmax(0, 1fr)',
        },
        // Row one is the filter bar at whatever height it needs; everything
        // after it splits the remaining height on a wide screen and flows on a
        // narrow one.
        gridTemplateRows: { xs: 'auto', lg: 'auto minmax(0, 1fr)' },
        gridAutoRows: { xs: 'minmax(360px, auto)', lg: 'minmax(0, 1fr)' },
        height: { xs: 'auto', lg: '100%' },
        boxSizing: 'border-box',
      }}
    >
      <Box sx={{ gridColumn: '1 / -1' }}>
        <LiveIncidentFilters
          filters={incidentFilters}
          options={incidentFilterOptions}
          matchCount={matchCount}
          totalCount={incidents.length}
          onChange={onChangeIncidentFilters}
          onReset={onResetIncidentFilters}
        />
      </Box>

      <LiveTriageQueue
        incidents={incidents}
        selectedIncidentId={selectedIncidentId}
        stateFilter={stateFilter}
        filters={incidentFilters}
        onSelectIncident={onSelectIncident}
        onChangeStateFilter={onChangeStateFilter}
        onClearFilters={onResetIncidentFilters}
      />

      <LiveIncidentDossier
        incident={selectedIncident}
        targetSteamId={targetSteamId}
        onSelectTarget={onSelectTarget}
        onFocusCar={onFocusCar}
        onFlag={onFlag}
        onDefer={onDefer}
        onDecide={onDecide}
      />
    </Box>
  );
};
