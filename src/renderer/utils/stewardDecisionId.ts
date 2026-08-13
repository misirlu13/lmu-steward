/**
 * The id a decision is stored under.
 *
 * Shared by live stewarding and post-session review deliberately. A call made
 * under time pressure and the same call revised against the replay have to
 * resolve to one record — that is what produces "we called it live, reviewed it
 * after, and changed it for this reason" instead of two contradictory rows.
 *
 * Both parts have to be the durable ones. The session key is capture's own, not
 * one the renderer derives, and the incident id is the content-derived
 * `persistedId` rather than `live-{generation}-{seq}`, which changes whenever
 * the sidecar restarts.
 *
 * Mirrors `decisionId` in `src/main/api/steward-decisions.ts`; the two must
 * agree, and main is not importable from the renderer.
 */
export const buildStewardDecisionId = (
  sessionKey: string,
  incidentId: string,
  targetKey?: string,
): string => `${sessionKey}|${incidentId}|${targetKey ?? 'incident'}`;
