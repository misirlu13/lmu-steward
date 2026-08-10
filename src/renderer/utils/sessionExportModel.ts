import { StewardDecision } from '@types';
import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import {
  ReplayIncidentEvent,
  ReplayIncidentType,
} from '../components/Replay/replayTimelineTypes';
import { ReplaySessionLogDataLike } from './replayMetadata';

/**
 * The authoritative session record, normalized for export.
 *
 * This is deliberately a plain data shape with no formatting in it: the three
 * output formats all serialize this same model, so CSV, Markdown and JSON can
 * never disagree about what a session contained.
 *
 * Export is a property of the *complete* session record, which is why it lives
 * on the replay view — mid-race there are no final standings to export. See
 * docs/export-and-decisions-design.md.
 */

export interface SessionExportDriver {
  position: number;
  startingPosition?: number;
  driverName: string;
  /**
   * LMU's own driver id, **not** a Steam ID. Verified against a real export:
   * it is absent entirely for standings built from a session log, and a short
   * numeric id (e.g. `3532`) where it is present. A league joining on it must
   * know it is not the Steam identity the decision layer records.
   */
  driverId?: string;
  slotId?: string;
  teamName: string;
  carName: string;
  carClass: string;
  fastestLap: string;
  incidents: number;
  isAiDriver: boolean;
}

export interface SessionExportIncidentDriver {
  displayName: string;
  carNumber: string;
  carClass: string;
  /** LMU's driver id, not a Steam ID. See SessionExportDriver.driverId. */
  driverId?: string;
  slotId?: string;
  isAiDriver: boolean;
}

export interface SessionExportIncident {
  id: string;
  type: ReplayIncidentType;
  timestampLabel: string;
  lapLabel: string;
  etSeconds?: number;
  description: string;
  severity?: string;
  drivers: SessionExportIncidentDriver[];
}

export interface SessionExportSession {
  track: string;
  sessionType: string;
  /** ISO date of the session itself, not of the export. */
  date?: string;
  /**
   * The event name LMU gives the weekend — "6 Hours of Spa-Francorchamps".
   * Better than the track name for a published report, and populated in every
   * session log inspected.
   */
  event?: string;
  /** "Race Weekend" or "Multiplayer", straight from the log. */
  setting?: string;
  /**
   * Observed empty in every multiplayer log inspected — all of which were
   * `Dedicated=0`. The two co-vary, so this most likely only carries a value on
   * a hosted dedicated server, which is what a league would run. Carried rather
   * than relied on, and omitted from output when empty.
   */
  serverName?: string;
  /** Whether the session ran on a dedicated server. Explains an absent name. */
  dedicated?: boolean;
  replayName?: string;
  replayHash?: string;
  lapsCompleted: number;
  trackLengthMeters?: number;
  driverCount: number;
}

export interface SessionExportDecision {
  id: string;
  outcome?: string;
  /** Who the call was against. Absent for an incident-scoped finding. */
  driverName?: string;
  driverSteamId?: string;
  basis: string;
  state: string;
  status: string;
  reasoning?: string;
  stewardAuthor: string;
  decidedAt: number;
  lapLabel?: string;
  etSeconds?: number;
  classification?: string;
  /** Number of times the call was revised. 1 means it was never changed. */
  revisionCount: number;
}

export interface SessionExportCounts {
  collisions: number;
  trackLimits: number;
  penalties: number;
  total: number;
}

export interface SessionExport {
  /** ISO timestamp of when the export was produced. */
  generatedAt: string;
  session: SessionExportSession;
  standings: SessionExportDriver[];
  incidents: SessionExportIncident[];
  decisions: SessionExportDecision[];
  counts: SessionExportCounts;
}

/**
 * A decision belongs to this session if it was linked to the replay after sync,
 * or — for calls made live, before a replay hash existed — if it names the same
 * track and session type.
 */
export const decisionBelongsToSession = (
  decision: StewardDecision,
  session: { replayHash?: string; track: string; sessionType: string },
): boolean => {
  if (decision.replayHash && session.replayHash) {
    return decision.replayHash === session.replayHash;
  }

  return (
    decision.sessionKey === `${session.track}|${session.sessionType}` ||
    (decision.sessionTrack === session.track &&
      decision.sessionType === session.sessionType)
  );
};

/**
 * LMU reports an unpopulated id as `0` rather than omitting it, and the replay
 * path can carry an empty string. Neither is an identity.
 */
const UNSET_IDS = new Set(['', '0']);

export const toExportDriverId = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  return trimmed && !UNSET_IDS.has(trimmed) ? trimmed : undefined;
};

const firstString = (
  source: Record<string, unknown> | null | undefined,
  keys: string[],
): string | undefined => {
  if (!source) {
    return undefined;
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const finiteNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export interface BuildSessionExportArgs {
  replay?: {
    replayName?: string;
    hash?: string;
    timestamp?: number;
    metadata?: { sceneDesc?: string; session?: string };
  } | null;
  sessionLogData?: ReplaySessionLogDataLike | null;
  /**
   * The whole log, not the session sub-node. Event name, setting and track
   * length live at the root — `resolveReplaySessionLogData` returns only the
   * session's own branch, so reading them from it silently yields nothing.
   */
  rootLogData?: Record<string, unknown> | null;
  standings: ReplayDriverStanding[];
  incidents: ReplayIncidentEvent[];
  lapsCompleted: number;
  /** Resolved display name for the track, when the view has one. */
  trackDisplayName?: string;
  /** Injectable so the output is deterministic under test. */
  generatedAt?: Date;
  /** Every decision held; the builder selects the ones for this session. */
  decisions?: StewardDecision[];
}

export const buildSessionExport = ({
  replay,
  sessionLogData,
  rootLogData,
  standings,
  incidents,
  lapsCompleted,
  trackDisplayName,
  generatedAt = new Date(),
  decisions = [],
}: BuildSessionExportArgs): SessionExport => {
  const exportStandings: SessionExportDriver[] = [...standings]
    .sort((a, b) => a.position - b.position)
    .map((standing) => ({
      position: standing.position,
      startingPosition: standing.startingPosition,
      driverName: standing.driverName,
      driverId: toExportDriverId(standing.driverSid),
      slotId: standing.slotId,
      teamName: standing.teamName,
      carName: standing.carName,
      carClass: standing.carClass,
      fastestLap: standing.fastestLap,
      incidents: standing.incidents,
      isAiDriver: Boolean(standing.isAiDriver),
    }));

  // Every incident is exported, including ones nobody acted on. A stewarding
  // report that silently omits what was not reviewed is not a record of the
  // session.
  const exportIncidents: SessionExportIncident[] = [...incidents]
    .sort((a, b) => (a.etSeconds ?? 0) - (b.etSeconds ?? 0))
    .map((incident) => ({
      id: incident.id,
      type: incident.type,
      timestampLabel: incident.timestampLabel,
      lapLabel: incident.lapLabel,
      etSeconds: incident.etSeconds,
      description: incident.description ?? '',
      severity: incident.heatmapSeverity,
      drivers: incident.drivers.map((driver) => ({
        displayName: driver.displayName,
        carNumber: driver.carNumber,
        carClass: driver.carClass,
        driverId: toExportDriverId(driver.driverSid),
        slotId: driver.slotId,
        isAiDriver: Boolean(driver.isAiDriver),
      })),
    }));

  const counts = exportIncidents.reduce<SessionExportCounts>(
    (acc, incident) => {
      if (incident.type === 'collision') {
        acc.collisions += 1;
      } else if (incident.type === 'track-limit') {
        acc.trackLimits += 1;
      } else if (incident.type === 'penalty') {
        acc.penalties += 1;
      }
      acc.total += 1;
      return acc;
    },
    { collisions: 0, trackLimits: 0, penalties: 0, total: 0 },
  );

  const logData = sessionLogData as Record<string, unknown> | null | undefined;
  const root = rootLogData ?? undefined;
  const track = trackDisplayName ?? replay?.metadata?.sceneDesc ?? '';
  const sessionType = replay?.metadata?.session ?? '';

  const exportDecisions: SessionExportDecision[] = decisions
    .filter((decision) =>
      decisionBelongsToSession(decision, {
        replayHash: replay?.hash,
        track,
        sessionType,
      }),
    )
    .sort((a, b) => a.decidedAt - b.decidedAt)
    .map((decision) => ({
      id: decision.id,
      outcome: decision.outcome,
      driverName: decision.target?.driverName,
      driverSteamId: decision.target?.steamId,
      basis: decision.basis,
      state: decision.state,
      status: decision.status,
      reasoning: decision.reasoning,
      stewardAuthor: decision.stewardAuthor,
      decidedAt: decision.decidedAt,
      lapLabel: decision.lapLabel,
      etSeconds: decision.etSeconds,
      classification: decision.classification,
      revisionCount: decision.revisions?.length ?? 0,
    }));

  return {
    generatedAt: generatedAt.toISOString(),
    session: {
      track,
      sessionType,
      // Replay timestamps are Unix **seconds**, as replay-export.ts also has
      // to account for. Treating them as milliseconds dates every export to
      // January 1970.
      date: replay?.timestamp
        ? new Date(replay.timestamp * 1000).toISOString()
        : undefined,
      event: firstString(root, ['TrackEvent']),
      setting: firstString(root, ['Setting']),
      serverName: firstString(root, ['ServerName']),
      dedicated:
        root?.Dedicated === undefined
          ? undefined
          : String(root.Dedicated).trim() === '1',
      replayName: replay?.replayName,
      replayHash: replay?.hash,
      lapsCompleted,
      trackLengthMeters:
        finiteNumber(root?.TrackLength) ?? finiteNumber(logData?.TrackLength),
      driverCount: exportStandings.length,
    },
    standings: exportStandings,
    incidents: exportIncidents,
    decisions: exportDecisions,
    counts,
  };
};
