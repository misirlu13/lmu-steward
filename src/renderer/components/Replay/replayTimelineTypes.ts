export type ReplayIncidentType = 'track-limit' | 'collision' | 'penalty';

export interface ReplayIncidentDriver {
  carNumber: string;
  displayName: string;
  carClass: string;
  slotId?: string;
  driverSid?: string;
  isAiDriver?: boolean;
  hasLapData?: boolean;
}

export interface ReplayIncidentEvent {
  id: string;
  timestampLabel: string;
  timestampEstimated?: boolean;
  lapLabel: string;
  type: ReplayIncidentType;
  drivers: ReplayIncidentDriver[];
  description?: string;
  etSeconds?: number;
  jumpToSeconds?: number;
  heatmapSeverity?: 'minor' | 'serious' | 'critical';
  distanceMeters?: number;
}
