import { SessionIncidents } from "@types";


export const getSessionIncidentScore = (incidents: SessionIncidents, driverCount: number): number => {
  const trackLimits = incidents.trackLimits || 0;
  const incidentsCount = incidents.incidents || 0;
  const penalties = incidents.penalties || 0;
  const incidentScore =
  (trackLimits * 1) +
  (incidentsCount * 3) +
  (penalties * 5);
  return incidentScore / driverCount;
};

export const getDriverIncidentScore = (
  incidents: SessionIncidents,
  lapsCompleted: number
): number => {
  const trackLimits = incidents.trackLimits || 0;
  const incidentsCount = incidents.incidents || 0;
  const penalties = incidents.penalties || 0;

  const incidentScore =
    (trackLimits * 1) +
    (incidentsCount * 3) +
    (penalties * 5);

  if (!lapsCompleted) return incidentScore; // fallback for DNFs / edge cases

  return incidentScore / lapsCompleted;
};

