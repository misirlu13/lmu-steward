import { LiveCaptureEvidence } from '@types';

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
  /**
   * The log's own text for this event, unparsed.
   *
   * Carried so live capture can be merged onto it without going back through
   * the display parsing above. Live capture records the identical string — it
   * comes from the same place — which makes it the one key that separates
   * incidents the parsed fields cannot: three records at one elapsed time for
   * one driver hitting one post, differing only in impact force.
   */
  sourceText?: string;
  /**
   * Live capture's evidence for this incident, when a captured session is
   * linked to this replay and recorded it.
   *
   * Enrichment only. The XML is authoritative and builds the list; nothing here
   * ever adds an incident, and its absence is the normal case.
   */
  liveIncidentId?: string;
  liveEvidence?: LiveCaptureEvidence;
  /** A trace window exists for this incident and can be loaded on demand. */
  hasLiveContext?: boolean;
}
