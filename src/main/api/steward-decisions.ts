import { CONSTANTS } from '@constants';
import {
  StewardDecision,
  StewardDecisionRevision,
  StewardDecisionStore,
} from '@types';
import { getMainPersistentStore } from '../storage/local-data-store';

/**
 * The decision layer.
 *
 * A decision is a record with revisions, not a row that gets overwritten.
 * Being able to show "we called it live, reviewed it after, and changed it for
 * this reason" is precisely what makes league stewarding defensible under
 * appeal — and it is expensive to retrofit once decisions are being written.
 *
 * Nothing here ever deletes. See plans/export-and-decisions-design.md.
 */

const STORE_KEY = 'stewardDecisions';

export const readStewardDecisions = (): StewardDecisionStore => {
  const stored = getMainPersistentStore().get(STORE_KEY);
  return stored && typeof stored === 'object'
    ? (stored as StewardDecisionStore)
    : {};
};

/**
 * A decision belongs to one incident and one target, so re-deciding the same
 * driver on the same incident revises the existing record rather than piling up
 * a second one. Two drivers penalised for one incident are two decisions, which
 * is correct — they are two calls.
 */
export const decisionId = (
  sessionKey: string,
  incidentId: string,
  target?: { steamId?: string; slotId?: number },
): string => {
  const targetKey =
    target?.steamId ??
    (target?.slotId !== undefined ? `slot-${target.slotId}` : 'incident');
  return `${sessionKey}|${incidentId}|${targetKey}`;
};

const revisionFrom = (
  decision: StewardDecision,
  revisionNumber: number,
): StewardDecisionRevision => ({
  revisionNumber,
  outcome: decision.outcome,
  reasoning: decision.reasoning,
  status: decision.status,
  stewardAuthor: decision.stewardAuthor,
  revisedAt: decision.decidedAt,
});

const isSubstantiveChange = (
  previous: StewardDecision,
  next: StewardDecision,
): boolean =>
  previous.outcome !== next.outcome ||
  previous.reasoning !== next.reasoning ||
  previous.status !== next.status ||
  previous.state !== next.state;

/**
 * Upserts a decision, appending a revision when the call actually changed.
 *
 * Re-saving an identical decision — which a polling UI will do — must not
 * manufacture revision history, or the audit trail becomes noise and stops
 * being usable as evidence.
 */
export const saveStewardDecision = (
  incoming: StewardDecision,
): StewardDecision => {
  const store = getMainPersistentStore();
  const decisions = readStewardDecisions();
  const previous = decisions[incoming.id];

  let saved: StewardDecision;

  if (!previous) {
    saved = {
      ...incoming,
      revisions: [revisionFrom(incoming, 1)],
    };
  } else if (!isSubstantiveChange(previous, incoming)) {
    saved = { ...previous, ...incoming, revisions: previous.revisions };
  } else {
    const revisions = previous.revisions?.length
      ? previous.revisions
      : [revisionFrom(previous, 1)];

    saved = {
      ...previous,
      ...incoming,
      revisions: [...revisions, revisionFrom(incoming, revisions.length + 1)],
    };
  }

  // Written as a single-entry map: the store upserts and never replaces the
  // collection, so this cannot disturb any other decision.
  store.set(STORE_KEY, { [saved.id]: saved });

  return saved;
};

export const getStewardDecisionsHandler = (event: Electron.IpcMainEvent) => {
  try {
    event.reply(CONSTANTS.API.GET_STEWARD_DECISIONS, {
      status: 'success',
      data: readStewardDecisions(),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_STEWARD_DECISIONS, {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

export const postStewardDecisionHandler = (
  event: Electron.IpcMainEvent,
  decision: StewardDecision,
) => {
  try {
    if (!decision?.id) {
      throw new Error('A decision must carry an id.');
    }

    saveStewardDecision(decision);

    // Reply with the whole collection so every open view converges on the same
    // record without a second round trip.
    event.reply(CONSTANTS.API.POST_STEWARD_DECISION, {
      status: 'success',
      data: readStewardDecisions(),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_STEWARD_DECISION, {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
