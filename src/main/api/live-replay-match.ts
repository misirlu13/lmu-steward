import { stat } from 'fs/promises';
import log from 'electron-log';
import {
  LiveSessionMatchCandidate,
  LiveSessionMatchProposal,
  LiveSessionMatchResult,
  LiveSessionRecord,
  SessionType,
} from '@types';
import { listReplayMatchTargets, ReplayMatchTarget } from './replay';
import { readLogCandidate } from './replay-import';
import {
  DEFAULT_CONFIDENCE_MARGIN,
  LogCandidate,
  rankRosterCandidates,
} from './replay-import-match';
import { getTrackAliases, tracksLikelyMatch } from './track-matching';
import { readLiveSessions, setLiveSessionProposal } from './live-session-store';

/**
 * Pairs a captured live session with the replay of the same session.
 *
 * Deliberately not a second matcher. Ranking, the confidence floor and the
 * ambiguity margin all come from `replay-import-match`, which already solves
 * this shape of problem for .Vcr ↔ log pairing; only the candidate set and the
 * pre-filter are new. A divergence between the two would show up as a link the
 * import path would have refused to make.
 *
 * See plans/live-replay-reconciliation-design.md, "Matching a Live Session to a
 * Replay".
 */

/**
 * How far apart a replay and a captured session may be and still be the same
 * session.
 *
 * Generous on purpose. A replay's timestamp is its .Vcr's creation time, and a
 * weekend's practice, qualifying and race have been observed carrying the same
 * one — so this is a bound on the search, not a discriminator. 36 hours covers
 * a 24-hour race started before its replay was stamped, with slack.
 */
export const LIVE_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;

/** How closely a live incident's elapsed time must land on the log's. */
const INCIDENT_ET_TOLERANCE_SECONDS = 1.5;

/**
 * Live incidents needed before incident agreement is allowed to break a tie.
 *
 * Two or three coincidental matches in a busy race prove nothing. This only
 * ever runs when roster overlap has already failed to separate two candidates.
 */
const MIN_INCIDENTS_FOR_TIEBREAK = 4;

/** How far apart two agreement scores must be to be treated as decisive. */
const INCIDENT_AGREEMENT_MARGIN = 0.3;

/**
 * Multiplayer appends a discriminator to a driver's name — `Steve Davis#1924` —
 * and shared memory carries it while the log's `<Driver><Name>` does not.
 * Stripped on the live side only, because that is the only side it appears on.
 */
const stripNameDiscriminator = (value: string): string =>
  String(value ?? '').replace(/#\d+\s*$/, '');

export const liveSessionRoster = (session: LiveSessionRecord): string[] =>
  (session.drivers ?? [])
    .map((driver) => stripNameDiscriminator(driver.driverName))
    .filter(Boolean);

/*
  Logs are read at most once per pass and reused while their size and mtime are
  unchanged, in the same shape as the results-directory index. A 62-car 24h
  result log is around 29 MB, and a user with several captured sessions from one
  weekend would otherwise read the same file once per session.
*/
interface CachedLogRead {
  fingerprint: string | null;
  candidate: LogCandidate | null;
}

let logReadCache = new Map<string, CachedLogRead>();

export const resetLiveMatchCacheForTests = (): void => {
  logReadCache = new Map();
};

const fingerprintFile = async (filePath: string): Promise<string | null> => {
  try {
    const { size, mtimeMs } = await stat(filePath);
    return `${size}:${mtimeMs}`;
  } catch {
    return null;
  }
};

const readReplayLog = async (
  filePath: string,
): Promise<LogCandidate | null> => {
  const fingerprint = await fingerprintFile(filePath);
  const cached = logReadCache.get(filePath.toLowerCase());

  if (cached && fingerprint !== null && cached.fingerprint === fingerprint) {
    return cached.candidate;
  }

  const candidate = await readLogCandidate(filePath, {
    includeIncidentTimes: true,
  });

  logReadCache.set(filePath.toLowerCase(), { fingerprint, candidate });
  return candidate;
};

/**
 * The coarse session type a raw `mSession` belongs to.
 *
 * Raw values are 0 test day, 1-4 practice, 5-8 qualifying, 9 warmup, 10-13
 * race. Warmup has no replay session type of its own, so it is read as practice
 * rather than dropped.
 */
export const sessionTypeForRawSession = (
  session: number,
  fallback?: SessionType,
): SessionType | null => {
  if (!Number.isFinite(session)) {
    return fallback ?? null;
  }

  if (session >= 10) {
    return 'RACE';
  }
  if (session >= 5 && session <= 8) {
    return 'QUALIFY';
  }
  if (session >= 0) {
    return 'PRACTICE';
  }

  return fallback ?? null;
};

/**
 * Replays that could plausibly be this session, before any scoring.
 *
 * Session type and track are the same pre-filter replay import applies, for the
 * same reason: roster overlap is meaningless across tracks, and scoring every
 * replay in a library would read every result log on disk.
 */
export const filterReplayTargets = (
  session: LiveSessionRecord,
  targets: ReplayMatchTarget[],
): ReplayMatchTarget[] => {
  const sessionType = sessionTypeForRawSession(
    session.session,
    session.sessionType,
  );

  const liveTrack = String(session.trackName ?? '').trim();

  return targets.filter((target) => {
    if (!target.logPath) {
      return false;
    }

    if (
      sessionType &&
      target.sessionType &&
      target.sessionType !== sessionType
    ) {
      return false;
    }

    if (
      Math.abs(target.timestamp * 1000 - session.startedAt) >
      LIVE_MATCH_WINDOW_MS
    ) {
      return false;
    }

    /*
      Live capture reports a full track name (`Daytona International Speedway
      Road Course`) while a replay carries a scene id (`DAYTONA_ROAD`), so the
      comparison goes through the same alias table replay sync and import use.
    */
    if (!liveTrack) {
      return true;
    }

    return tracksLikelyMatch(
      getTrackAliases(target.sceneDesc, target.replayName),
      liveTrack,
    );
  });
};

/**
 * Share of the session's live incidents that appear in the log at the same
 * elapsed time.
 *
 * Both sides quote `mCurrentET`, so a genuine pair agrees closely. Null when
 * either side has none — a session where nobody crashed has nothing to compare,
 * which is why this can only ever confirm and never carry a match on its own.
 */
export const scoreIncidentAgreement = (
  liveIncidentTimes: number[],
  logIncidentTimes: number[] | undefined,
): number | null => {
  if (liveIncidentTimes.length === 0 || !logIncidentTimes?.length) {
    return null;
  }

  const sorted = [...logIncidentTimes].sort((a, b) => a - b);

  const matched = liveIncidentTimes.filter((et) =>
    sorted.some(
      (logEt) => Math.abs(logEt - et) <= INCIDENT_ET_TOLERANCE_SECONDS,
    ),
  ).length;

  return matched / liveIncidentTimes.length;
};

export interface MatchLiveSessionArgs {
  session: LiveSessionRecord;
  targets: ReplayMatchTarget[];
  /** Elapsed times of the session's captured incidents. */
  liveIncidentTimes: number[];
  readLog?: (filePath: string) => Promise<LogCandidate | null>;
}

/**
 * Ranks the replays a captured session might belong to.
 *
 * Roster overlap is the score. Incident agreement is consulted in exactly one
 * place — separating two candidates the roster could not — because a restarted
 * race produces two replays with an identical grid at an identical track, and
 * nothing else can tell them apart.
 */
export const matchLiveSession = async ({
  session,
  targets,
  liveIncidentTimes,
  readLog = readReplayLog,
}: MatchLiveSessionArgs): Promise<LiveSessionMatchResult> => {
  const filtered = filterReplayTargets(session, targets);

  const withLogs = (
    await Promise.all(
      filtered.map(async (target) => ({
        target,
        logCandidate: target.logPath ? await readLog(target.logPath) : null,
      })),
    )
  ).filter((entry) => entry.logCandidate !== null) as Array<{
    target: ReplayMatchTarget;
    logCandidate: LogCandidate;
  }>;

  const ranking = rankRosterCandidates(liveSessionRoster(session), withLogs, {
    getNames: (entry) => entry.logCandidate.driverNames,
    tieBreak: (entry) => entry.target.replayName,
    /*
      A lone candidate is still scored. Import may accept one unscored because
      the user handed over both files and asserted they belong together; here
      the candidate set is one we assembled, and one replay at the right track
      on the right day is a coincidence, not a claim.
    */
    acceptSoleCandidate: false,
  });

  const toCandidate = (entry: (typeof ranking.ranked)[number]) => ({
    replayHash: entry.candidate.target.hash,
    replayIdentityKey: entry.candidate.target.identityKey,
    replayName: entry.candidate.target.replayName,
    sceneDesc: entry.candidate.target.sceneDesc,
    sessionType: (entry.candidate.target.sessionType ??
      'PRACTICE') as SessionType,
    timestamp: entry.candidate.target.timestamp,
    imported: entry.candidate.target.imported,
    confidence: entry.confidence,
    intersection: entry.intersection,
    liveDriverCount: entry.sourceCount,
    replayDriverCount: entry.candidateCount,
    incidentAgreement: scoreIncidentAgreement(
      liveIncidentTimes,
      entry.candidate.logCandidate.incidentTimes,
    ),
    linked: session.link?.replayHash === entry.candidate.target.hash,
  });

  const candidates = ranking.ranked.map(toCandidate);
  let { reason } = ranking;
  let proposed = ranking.proposed ? toCandidate(ranking.proposed) : null;

  /*
    The repeated-session case. Two candidates the roster cannot separate, but
    the incidents can: two independent captures of one session produce the same
    events at the same elapsed times, and a different session does not.

    Measured against a real store: two Laguna Seca practice sessions three hours
    apart, both with the same 38-car AI field, so both scored a roster overlap
    of exactly 1.00. Incident agreement read 1.00 for the right replay and 0.17
    for the wrong one.

    Reordering the tied group is the whole point — the roster ranking's own
    first place is arbitrary between candidates it scored identically, and
    reading agreement off that instead of off the group is how this first got it
    backwards for one of those two sessions.
  */
  if (
    reason === 'ambiguous' &&
    liveIncidentTimes.length >= MIN_INCIDENTS_FOR_TIEBREAK
  ) {
    const topConfidence = candidates[0]?.confidence ?? 0;
    const [top, next] = candidates
      .filter(
        (candidate) =>
          topConfidence - candidate.confidence < DEFAULT_CONFIDENCE_MARGIN,
      )
      .sort((a, b) => (b.incidentAgreement ?? 0) - (a.incidentAgreement ?? 0));

    /*
      Only when the winner is decisive, and only when there were enough
      incidents for agreement to mean anything — a couple of coincidental hits
      in a busy race prove nothing. Anything less stays ambiguous and goes to a
      human, which is the point of the whole exercise.
    */
    if (
      typeof top?.incidentAgreement === 'number' &&
      top.incidentAgreement - (next?.incidentAgreement ?? 0) >=
        INCIDENT_AGREEMENT_MARGIN
    ) {
      proposed = top;
      reason = 'proposed';
    }
  }

  return {
    sessionKey: session.sessionKey,
    candidates,
    proposed,
    reason,
  };
};

export const toMatchProposal = (
  candidate: LiveSessionMatchCandidate,
  now: number = Date.now(),
): LiveSessionMatchProposal => ({
  replayHash: candidate.replayHash,
  replayIdentityKey: candidate.replayIdentityKey,
  replayName: candidate.replayName,
  confidence: candidate.confidence,
  intersection: candidate.intersection,
  liveDriverCount: candidate.liveDriverCount,
  replayDriverCount: candidate.replayDriverCount,
  incidentAgreement: candidate.incidentAgreement,
  proposedAt: now,
});

/** Whether matching should look at this session at all. */
export const shouldMatchSession = (session: LiveSessionRecord): boolean =>
  !session.link?.replayHash && !session.matchDismissedAt;

export interface LiveMatchPassOptions {
  /** Incident elapsed times per session key, so the store is read once. */
  incidentTimesBySession: Map<string, number[]>;
  targets?: ReplayMatchTarget[];
  sessions?: LiveSessionRecord[];
}

/**
 * Refreshes proposals for every session still waiting for a replay.
 *
 * Nothing is ever linked here. A proposal is a suggestion sitting on the row
 * until a steward confirms it — a wrong link puts a driver's name against an
 * incident they were not in, in an export a league may publish.
 *
 * Also how a link appears retroactively: a replay imported or synced later is
 * simply a new candidate on the next pass.
 */
export const runLiveSessionMatchPass = async ({
  incidentTimesBySession,
  targets = listReplayMatchTargets(),
  sessions = Object.values(readLiveSessions()),
}: LiveMatchPassOptions): Promise<number> => {
  const pending = sessions.filter(shouldMatchSession);

  if (pending.length === 0 || targets.length === 0) {
    return 0;
  }

  let proposedCount = 0;

  for (const session of pending) {
    try {
      // Sequential on purpose: the pass runs behind a list load and reads
      // result logs, and a library-wide fan-out of those is what the shared
      // log index exists to avoid.
      // eslint-disable-next-line no-await-in-loop
      const result = await matchLiveSession({
        session,
        targets,
        liveIncidentTimes: incidentTimesBySession.get(session.sessionKey) ?? [],
      });

      const nextProposal = result.proposed
        ? toMatchProposal(result.proposed)
        : null;

      // Rewriting an unchanged proposal costs a session row write per list
      // load, so only a change is persisted.
      if (
        (session.proposal?.replayHash ?? null) !==
        (nextProposal?.replayHash ?? null)
      ) {
        setLiveSessionProposal(session.sessionKey, nextProposal);
      }

      if (nextProposal) {
        proposedCount += 1;
      }
    } catch (error) {
      log.error(
        'live-replay-match: failed to match session',
        session.sessionKey,
        error,
      );
    }
  }

  return proposedCount;
};
