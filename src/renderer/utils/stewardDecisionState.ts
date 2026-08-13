import { StewardDecision, StewardDecisionState } from '@types';

/**
 * Whether a decision record still says anything about its incident.
 *
 * A withdrawn call is kept — the decision layer never deletes — but it has been
 * taken back, so nothing that asks "what has been called here" may count it.
 * That question is asked in five places across the live provider and the replay
 * dossier, and the answer has to be the same in all of them: an incident that
 * reads as unreviewed in the queue but still shows a decision on its dossier is
 * worse than either state on its own.
 */
export const isStandingCall = (decision: StewardDecision): boolean =>
  decision.state !== 'WITHDRAWN';

/**
 * The records that still stand, of everything held against one incident.
 *
 * Returns the array it was given when nothing has been withdrawn, which is the
 * ordinary case — the live provider re-derives incident states on every poll
 * tick, and a fresh array there costs an identity the memoisation is built on.
 */
export const standingCalls = (
  decisions: StewardDecision[],
): StewardDecision[] =>
  decisions.every(isStandingCall)
    ? decisions
    : decisions.filter(isStandingCall);

/**
 * The state a button press should write, given what the incident already says.
 *
 * Pressing the action an incident is already under means "undo that" — the
 * toggle the pressure monitor's pins and every other control on this screen
 * behave like. Returning `WITHDRAWN` is what makes the second press take the
 * call back rather than re-record it.
 */
export const toggledState = (
  wanted: Exclude<StewardDecisionState, 'WITHDRAWN'>,
  isAlreadyInThatState: boolean,
): StewardDecisionState => (isAlreadyInThatState ? 'WITHDRAWN' : wanted);
