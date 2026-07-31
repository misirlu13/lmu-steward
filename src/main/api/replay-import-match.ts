import { SessionType } from '@types';
import { VcrTrailer } from './vcr-metadata';

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
}

export interface RankedLogCandidate {
  candidate: LogCandidate;
  confidence: number;
  intersection: number;
  vcrCount: number;
  logCount: number;
}

export interface PairingResult {
  ranked: RankedLogCandidate[];
  /** The candidate confident enough to propose without the user choosing. */
  proposed: RankedLogCandidate | null;
  reason:
    | 'proposed'
    | 'only-candidate'
    | 'roster-too-small'
    | 'no-candidates'
    | 'below-floor'
    | 'ambiguous';
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

/**
 * Ranks candidate logs for one replay. Candidates are expected to be
 * pre-filtered to the same session type and track — this scores the grid.
 */
export const scoreLogCandidates = (
  trailer: VcrTrailer,
  candidates: LogCandidate[],
  options: ScoreOptions = {},
): PairingResult => {
  const confidenceFloor = options.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR;
  const confidenceMargin =
    options.confidenceMargin ?? DEFAULT_CONFIDENCE_MARGIN;

  if (candidates.length === 0) {
    return { ranked: [], proposed: null, reason: 'no-candidates' };
  }

  const vcrNames = toNameSet(trailer.drivers.map((driver) => driver.name));

  const ranked = candidates
    .map((candidate) => {
      const logNames = toNameSet(candidate.driverNames);
      const { confidence, intersection } = scoreRosterOverlap(
        vcrNames,
        logNames,
      );

      return {
        candidate,
        confidence,
        intersection,
        vcrCount: vcrNames.size,
        logCount: logNames.size,
      };
    })
    .sort(
      (a, b) =>
        b.confidence - a.confidence ||
        a.candidate.fileName.localeCompare(b.candidate.fileName),
    );

  /*
   * One candidate and nothing to choose between: a single .Vcr handed over with
   * a single log. Scoring it would only invent a reason to reject an import the
   * user has already told us belongs together.
   */
  if (candidates.length === 1) {
    return { ranked, proposed: ranked[0], reason: 'only-candidate' };
  }

  if (vcrNames.size < MIN_ROSTER_SIZE) {
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
