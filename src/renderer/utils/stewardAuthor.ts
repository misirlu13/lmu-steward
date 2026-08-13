/**
 * Who a steward decision is recorded as.
 *
 * One definition, deliberately. The name reaches records from two places — the
 * live shell and the replay dossier — and a second copy of either the fallback
 * or the trim rule is how the two drift apart. Both read the resolved value off
 * `useApi()`; this is what resolves it, exactly once, in `ApiContext`.
 */

/**
 * Used when the setting is blank, which is its shipped default. Generic beats
 * empty: `StewardDecision.stewardAuthor` is required and is what a call is
 * defended by under appeal, so a record must never carry an empty one.
 */
export const DEFAULT_STEWARD_AUTHOR = 'Steward';

/** Anything non-string, blank, or whitespace-only resolves to the fallback. */
export const resolveStewardAuthor = (value: unknown): string =>
  (typeof value === 'string' ? value.trim() : '') || DEFAULT_STEWARD_AUTHOR;
