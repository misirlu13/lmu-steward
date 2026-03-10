import { useState } from 'react';
import {
  ReplayIncidentEvent,
  ReplayIncidentType,
} from '../components/Replay/ReplayMasterIncidentTimeline';
import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import { jumpToIncidentInReplay } from '../utils/replayCommands';

interface DriverAnalysisRouteState {
  replayTitle?: string;
  replayLocation?: string;
  isPartialReplayData?: boolean;
  driver?: ReplayDriverStanding;
  incidents?: ReplayIncidentEvent[];
}

const allIncidentTypes: ReplayIncidentType[] = [
  'track-limit',
  'collision',
  'penalty',
];

interface UseDriverAnalysisViewStateArgs {
  driverId: string | undefined;
  routeState: DriverAnalysisRouteState | null;
  isQuickViewModeActive: boolean;
}

export const useDriverAnalysisViewState = ({
  driverId,
  routeState,
  isQuickViewModeActive,
}: UseDriverAnalysisViewStateArgs) => {
  const [selectedIncidentTypes, setSelectedIncidentTypes] =
    useState<ReplayIncidentType[]>(allIncidentTypes);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);

  const driver = routeState?.driver ?? {
    position: 2,
    driverName: 'L. Hamilton',
    driverId: driverId ?? '0044',
    teamName: 'Mercedes AMG',
    carName: 'BMW M4',
    carClass: 'HY',
    fastestLap: '1:44.552',
    incidents: 2,
    riskIndex: 65,
  };

  const replayLabel = routeState?.replayTitle || 'Replay Session';
  const isPartialReplayDataDetected = Boolean(routeState?.isPartialReplayData);

  const toggleIncidentType = (type: ReplayIncidentType) => {
    setSelectedIncidentTypes((previous) => {
      if (previous.includes(type)) {
        const next = previous.filter((entry) => entry !== type);
        return next.length ? next : previous;
      }

      return [...previous, type];
    });
  };

  const onViewIncident = (incident: ReplayIncidentEvent) => {
    setActiveIncidentId(incident.id);

    if (isQuickViewModeActive) {
      return;
    }

    jumpToIncidentInReplay(incident, {
      driverName: driver.driverName,
      driverId: driver.driverId,
      driverSid: driver.driverSid,
      slotId: driver.slotId,
    });
  };

  const onJumpToIncident = (incident: ReplayIncidentEvent) => {
    onViewIncident(incident);
  };

  const onSelectIncident = (incident: ReplayIncidentEvent) => {
    setActiveIncidentId(incident.id);
  };

  return {
    driver,
    replayLabel,
    isPartialReplayDataDetected,
    selectedIncidentTypes,
    activeIncidentId,
    setActiveIncidentId,
    toggleIncidentType,
    onViewIncident,
    onJumpToIncident,
    onSelectIncident,
  };
};
