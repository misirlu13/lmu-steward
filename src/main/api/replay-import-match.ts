import { SessionType } from '@types';
import { VcrTrailer } from './vcr-metadata';
import { tracksLikelyMatch } from './track-matching';

/**
 * Pairs an imported .Vcr with the result log it belongs to.
 *
 * Timestamps cannot do this. A replay's timestamp is its .Vcr's creation time,
 * which Windows resets on copy, so every imported replay claims to have
 * happened the moment it was pasted. Modified time is no better — some transfer
 * paths rewrite it too.
 *
 * The driver roster can. Two events at the same track on the same evening share
 * a track, a session type and a date, but not a grid.
 *
 * Requiring both files at import removes the "imported with no log" state, but
 * not this problem: a hand-off is a folder, not a couple. The nine replays a
 * steward was sent arrived alongside 190 logs, six of which were relevant.
 */

/** Below this, a roster cannot meaningfully discriminate between logs. */
const MIN_ROSTER_SIZE = 3;

/** Overlap the best candidate must reach before it is proposed. */
export const DEFAULT_CONFIDENCE_FLOOR = 0.5;

/** How far clear of the runner-up the best candidate must be. */
export const DEFAULT_CONFIDENCE_MARGIN = 0.1;

export interface LogCandidate {
  fileName: string;
  filePath: string;
  session: SessionType | null;
  eventDateTime: number | null;
  trackVenue: string;
  trackCourse: string;
  trackEvent: string;
  driverNames: string[];
  /**
   * Session elapsed times of the log's `<Incident>` records, when the caller
   * asked for them. Live↔replay matching uses these as a confirming signal;
   * replay import never reads them.
   */
  incidentTimes?: number[];
}

export interface RankedLogCandidate {
  candidate: LogCandidate;
  confidence: number;
  intersection: number;
  vcrCount: number;
  logCount: number;
}

/** Every verdict scoring itself can reach. */
export type RosterRankingReason =
  | 'proposed'
  | 'only-candidate'
  | 'roster-too-small'
  | 'no-candidates'
  | 'below-floor'
  | 'ambiguous';

export interface PairingResult {
  ranked: RankedLogCandidate[];
  /** The candidate confident enough to propose without the user choosing. */
  proposed: RankedLogCandidate | null;
  /** `manifest` is set by the caller: a Steward export named the log outright. */
  reason: RosterRankingReason | 'manifest';
}

const normalizeDriverName = (value: string): string =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const toNameSet = (names: string[]): Set<string> =>
  new Set(names.map(normalizeDriverName).filter(Boolean));

/**
 * Jaccard overlap of the two rosters.
 *
 * Deliberately not an exact-set comparison. The recording player appears in the
 * .Vcr roster but not always in the log's driver list, and drivers who
 * disconnected can appear in one and not the other — real matches in the
 * fixture set land around 0.85, not 1.0.
 */
const scoreRosterOverlap = (
  vcrNames: Set<string>,
  logNames: Set<string>,
): { confidence: number; intersection: number } => {
  let intersection = 0;

  vcrNames.forEach((name) => {
    if (logNames.has(name)) {
      intersection += 1;
    }
  });

  const union = vcrNames.size + logNames.size - intersection;

  return {
    confidence: union > 0 ? intersection / union : 0,
    intersection,
  };
};

export interface ScoreOptions {
  confidenceFloor?: number;
  confidenceMargin?: number;
}

export interface RankedRosterCandidate<T> {
  candidate: T;
  confidence: number;
  intersection: number;
  /** Size of the roster being matched *from*. */
  sourceCount: number;
  /** Size of the candidate's roster. */
  candidateCount: number;
}

export interface RosterRanking<T> {
  ranked: RankedRosterCandidate<T>[];
  proposed: RankedRosterCandidate<T> | null;
  reason: RosterRankingReason;
}

interface RankRosterOptions<T> extends ScoreOptions {
  getNames: (candidate: T) => string[];
  /** Last-resort ordering, so ties do not depend on input order. */
  tieBreak: (candidate: T) => string;
  /**
   * Whether a lone candidate is proposed without being scored.
   *
   * True for replay import, where a single .Vcr handed over with a single log
   * is the user asserting they belong together. False everywhere the candidate
   * set was assembled by us — one replay at the right track is a coincidence,
   * not a claim, and proposing it unscored would be inventing confidence.
   */
  acceptSoleCandidate: boolean;
}

/**
 * The one place the floor, the margin and the minimum roster size are applied.
 *
 * Generic over the candidate so live↔replay matching reuses it rather than
 * growing a second matcher with its own idea of what "confident" means. A
 * divergence there would show up as a link the import path would have refused.
 */
export const rankRosterCandidates = <T>(
  sourceNames: string[],
  candidates: T[],
  options: RankRosterOptions<T>,
): RosterRanking<T> => {
  const confidenceFloor = options.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR;
  const confidenceMargin =
    options.confidenceMargin ?? DEFAULT_CONFIDENCE_MARGIN;

  if (candidates.length === 0) {
    return { ranked: [], proposed: null, reason: 'no-candidates' };
  }

  const sourceSet = toNameSet(sourceNames);

  const ranked = candidates
    .map((candidate) => {
      const candidateSet = toNameSet(options.getNames(candidate));
      const { confidence, intersection } = scoreRosterOverlap(
        sourceSet,
        candidateSet,
      );

      return {
        candidate,
        confidence,
        intersection,
        sourceCount: sourceSet.size,
        candidateCount: candidateSet.size,
      };
    })
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        options
          .tieBreak(a.candidate)
          .localeCompare(options.tieBreak(b.candidate)),
    );

  if (candidates.length === 1 && options.acceptSoleCandidate) {
    return { ranked, proposed: ranked[0], reason: 'only-candidate' };
  }

  if (sourceSet.size < MIN_ROSTER_SIZE) {
    return { ranked, proposed: null, reason: 'roster-too-small' };
  }

  const [best, runnerUp] = ranked;

  if (best.confidence < confidenceFloor) {
    return { ranked, proposed: null, reason: 'below-floor' };
  }

  if (runnerUp && best.confidence - runnerUp.confidence < confidenceMargin) {
    return { ranked, proposed: null, reason: 'ambiguous' };
  }

  return { ranked, proposed: best, reason: 'proposed' };
};

/**
 * Ranks candidate logs for one replay. Candidates are expected to be
 * pre-filtered to the same session type and track — this scores the grid.
 */
export const scoreLogCandidates = (
  trailer: VcrTrailer,
  candidates: LogCandidate[],
  options: ScoreOptions = {},
): PairingResult => {
  const ranking = rankRosterCandidates(
    trailer.drivers.map((driver) => driver.name),
    candidates,
    {
      ...options,
      getNames: (candidate) => candidate.driverNames,
      tieBreak: (candidate) => candidate.fileName,
      acceptSoleCandidate: true,
    },
  );

  const toLogRanked = (
    entry: RankedRosterCandidate<LogCandidate>,
  ): RankedLogCandidate => ({
    candidate: entry.candidate,
    confidence: entry.confidence,
    intersection: entry.intersection,
    vcrCount: entry.sourceCount,
    logCount: entry.candidateCount,
  });

  return {
    ranked: ranking.ranked.map(toLogRanked),
    proposed: ranking.proposed ? toLogRanked(ranking.proposed) : null,
    reason: ranking.reason,
  };
};

/**
 * A problem found when checking a replay against the log the user paired it
 * with. `error` blocks the import; `warning` is shown but overridable, because
 * these checks are heuristics and a steward may know better than we do.
 */
export interface ImportPairIssue {
  severity: 'error' | 'warning';
  code:
    | 'session-mismatch'
    | 'track-mismatch'
    | 'no-event-date'
    | 'roster-mismatch'
    | 'roster-too-small';
  message: string;
}

export interface ImportPairValidation {
  issues: ImportPairIssue[];
  /** Roster overlap, or null when the grid is too small to mean anything. */
  confidence: number | null;
  rosterOverlap: {
    intersection: number;
    vcrCount: number;
    logCount: number;
  } | null;
  canImport: boolean;
}

/**
 * Checks a pairing the user made themselves.
 *
 * When the user picks both files, there is nothing to propose — but plenty to
 * verify. Pointing at the wrong XML is easy: a steward handed a weekend has
 * several logs from one track on one evening, and picking the neighbouring
 * event produces a replay whose every incident and lap belongs to a different
 * race. Cheap to catch, expensive to miss.
 */
export const validateImportPair = (
  trailer: VcrTrailer,
  candidate: LogCandidate,
  trackAliases: string[],
  options: ScoreOptions = {},
): ImportPairValidation => {
  const confidenceFloor = options.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR;
  const issues: ImportPairIssue[] = [];

  if (candidate.session !== trailer.session) {
    issues.push({
      severity: 'error',
      code: 'session-mismatch',
      message: `This replay is a ${trailer.session.toLowerCase()} session, but the log is a ${String(
        candidate.session ?? 'unknown',
      ).toLowerCase()} session.`,
    });
  }

  // Without an event date there is nothing to stamp, so the import cannot work.
  if (!candidate.eventDateTime) {
    issues.push({
      severity: 'error',
      code: 'no-event-date',
      message: 'This log has no session date, so the replay cannot be dated.',
    });
  }

  if (
    !tracksLikelyMatch(
      trackAliases,
      candidate.trackVenue,
      candidate.trackCourse,
      candidate.trackEvent,
    )
  ) {
    issues.push({
      severity: 'warning',
      code: 'track-mismatch',
      message: `The replay is from a different track than the log (${
        candidate.trackVenue || 'unknown'
      }).`,
    });
  }

  const vcrNames = toNameSet(trailer.drivers.map((driver) => driver.name));
  const logNames = toNameSet(candidate.driverNames);
  const { confidence, intersection } = scoreRosterOverlap(vcrNames, logNames);

  const rosterOverlap = {
    intersection,
    vcrCount: vcrNames.size,
    logCount: logNames.size,
  };

  if (vcrNames.size < MIN_ROSTER_SIZE) {
    /*
     * A solo or two-driver session cannot be checked this way, and saying so is
     * more honest than reporting a confidence that means nothing.
     */
    issues.push({
      severity: 'warning',
      code: 'roster-too-small',
      message:
        'This replay has too few drivers to check against the log. Make sure it is the right one.',
    });

    return {
      issues,
      confidence: null,
      rosterOverlap,
      canImport: !issues.some((issue) => issue.severity === 'error'),
    };
  }

  if (confidence < confidenceFloor) {
    issues.push({
      severity: 'warning',
      code: 'roster-mismatch',
      message: `Only ${intersection} of ${vcrNames.size} drivers in this replay appear in the log. This may be a different race.`,
    });
  }

  return {
    issues,
    confidence,
    rosterOverlap,
    canImport: !issues.some((issue) => issue.severity === 'error'),
  };
};
