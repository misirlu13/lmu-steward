import { StewardDecisionOutcome } from '@types';

/**
 * The actions a steward can record against an incident — the penalty tariff.
 *
 * League-defined rather than shipped. A fixed vocabulary makes the feature
 * unusable for a large share of the audience, which
 * `plans/export-and-decisions-design.md:290` had already called out: leagues run
 * drive-throughs, stop-gos, time penalties, grid drops, licence points,
 * reprimands, warnings and DSQs in whatever combination their rulebook says.
 *
 * One definition, deliberately. The vocabulary reaches three places — both
 * dossiers' buttons and the two decide paths that guard them — and a second copy
 * of the defaults, the shortcut rule or the driver-scope rule is how those drift
 * apart. Everything below is resolved exactly once, in `ApiContext`, and read
 * off `useApi()` by every consumer; nothing downstream knows a fallback exists.
 * Same shape as `stewardAuthor.ts`, for the same reason.
 */

export interface StewardAction {
  /**
   * Editing identity, and nothing else. It gives the editor stable React keys
   * so renaming a row does not reorder the list under the user's cursor.
   *
   * **It never reaches a decision record.** The ids of the shipped defaults are
   * deliberately not the outcome strings any past decision was written with.
   */
  id: string;
  /**
   * What the button says *and* what the decision stores.
   *
   * The label is the value. A league writes `10s Penalty` — or `DT`, or whatever
   * their spreadsheet already uses — once, and it flows through the record into
   * every export verbatim. Beyond saving a keystroke this removes the class of
   * confusion where the UI shows one string and the export carries another, and
   * it makes the record self-describing for free: deleting or renaming an action
   * next season cannot orphan the decisions made under it, because they already
   * carry their own text.
   */
  label: string;
  /**
   * Whether this action is a call against one driver rather than a finding about
   * the incident as a whole.
   *
   * Not optional, and not inferable. It is what stops a penalty being recorded
   * against a two-car incident with no indication of who it was for — a call
   * nobody can act on, which is the bug the original check was written for. A
   * user-defined penalty that skipped this would reintroduce it.
   */
  driverScoped: boolean;
}

/**
 * The shipped tariff, and the only copy of it.
 *
 * "Revert to default" stores nothing rather than a copy of this array — see
 * `toStoredStewardActions` — so a later change here reaches everyone who never
 * customised.
 */
export const DEFAULT_STEWARD_ACTIONS: readonly StewardAction[] = [
  { id: 'sa-5s', label: '5s Penalty', driverScoped: true },
  { id: 'sa-10s', label: '10s Penalty', driverScoped: true },
  { id: 'sa-drive-through', label: 'Drive-Through', driverScoped: true },
  { id: 'sa-no-action', label: 'No Action', driverScoped: false },
  { id: 'sa-note', label: 'Note Only', driverScoped: false },
];

/**
 * A label has to fit a button in a three-column dossier and a spreadsheet cell.
 * Long enough for "Drive-Through + 2 Points", short enough that the tariff row
 * does not wrap to four lines.
 */
export const MAX_STEWARD_ACTION_LABEL_LENGTH = 40;

/**
 * How many actions get a number key. `1`–`9`; a tenth action is still clickable.
 *
 * Shortcuts are derived from the configured order rather than user-assigned,
 * which trades nothing real for not having to validate collisions.
 */
export const STEWARD_ACTION_SHORTCUT_LIMIT = 9;

/** The key that calls the action at this position, if it has one. */
export const stewardActionShortcut = (index: number): string | undefined =>
  index < STEWARD_ACTION_SHORTCUT_LIMIT ? String(index + 1) : undefined;

/**
 * Two labels are the same label if they differ only in case or padding. Two
 * actions exporting strings that close are indistinguishable in a spreadsheet
 * and are a typo rather than a design.
 */
const labelKey = (label: string): string => label.trim().toLowerCase();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Everything usable in `value`, in order, with ids made present and unique.
 *
 * Unusable *entries* are dropped rather than rejecting the whole list: a store
 * hand-edited into one bad row should not cost the user their other four
 * actions. Idempotent — running it over its own output changes nothing, which is
 * what lets the settings view compare a hydrated list against the payload it
 * would send without autosaving on load.
 */
const sanitizeStewardActions = (value: unknown): StewardAction[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenLabels = new Set<string>();
  const seenIds = new Set<string>();

  return value.reduce<StewardAction[]>((actions, entry, index) => {
    if (!isPlainObject(entry) || typeof entry.label !== 'string') {
      return actions;
    }

    const label = entry.label.trim().slice(0, MAX_STEWARD_ACTION_LABEL_LENGTH);
    if (!label || seenLabels.has(labelKey(label))) {
      return actions;
    }
    seenLabels.add(labelKey(label));

    /*
      Synthesised from the position when absent or already taken. Deterministic
      so the result is stable across reads; a list that already carries good ids
      keeps them.
    */
    const id =
      typeof entry.id === 'string' && entry.id && !seenIds.has(entry.id)
        ? entry.id
        : `sa-stored-${index}`;
    seenIds.add(id);

    actions.push({
      id,
      label,
      /*
        Defaults to a call against a driver when the stored value is not a
        boolean. The safe direction: an action wrongly marked driver-scoped asks
        for a target that was not needed, where the other way round writes a
        penalty nobody can act on.
      */
      driverScoped: entry.driverScoped !== false,
    });

    return actions;
  }, []);
};

/** Whether this list is the shipped tariff, so storing it would say nothing. */
export const areStewardActionsDefault = (
  actions: readonly StewardAction[],
): boolean =>
  actions.length === DEFAULT_STEWARD_ACTIONS.length &&
  actions.every(
    (action, index) =>
      labelKey(action.label) ===
        labelKey(DEFAULT_STEWARD_ACTIONS[index].label) &&
      action.driverScoped === DEFAULT_STEWARD_ACTIONS[index].driverScoped,
  );

/**
 * What belongs in user settings for this list, which is `null` unless the user
 * has actually departed from the shipped tariff.
 *
 * Absent means "use the defaults", so reverting deletes rather than writing a
 * copy — and a list edited back to the shipped one is the same thing as never
 * having customised. Ids are excluded from that comparison: they are editing
 * scaffolding, not part of the value.
 */
export const toStoredStewardActions = (
  value: unknown,
): StewardAction[] | null => {
  const sanitized = sanitizeStewardActions(value);

  return sanitized.length === 0 || areStewardActionsDefault(sanitized)
    ? null
    : sanitized;
};

/**
 * The tariff to draw and to guard against. Never empty, whatever settings hold.
 */
export const resolveStewardActions = (value: unknown): StewardAction[] =>
  toStoredStewardActions(value) ?? [...DEFAULT_STEWARD_ACTIONS];

/**
 * Whether recording this outcome needs a target driver.
 *
 * Asked of the configured list, and only ever about a call being made *now* —
 * the buttons the dossier draws and the keystrokes that stand in for them. It is
 * deliberately not how a *past* call is read back: a record carries its own
 * `target`, which answers "was this against a driver" without consulting a
 * settings entry that may since have been renamed or deleted.
 *
 * An outcome absent from the list is not driver-scoped. Unreachable in practice
 * — every outcome originates from this same list — and the permissive direction
 * is the right one for a guard that must never refuse a call the UI offered.
 */
export const isDriverScopedOutcome = (
  actions: readonly StewardAction[],
  outcome: StewardDecisionOutcome,
): boolean =>
  actions.some((action) => action.label === outcome && action.driverScoped);

/**
 * The outcome a number key calls, derived from the same positions the buttons
 * print. One rule, so a keystroke and the button beside it cannot disagree.
 */
export const outcomeForShortcut = (
  actions: readonly StewardAction[],
  key: string,
): StewardDecisionOutcome | undefined =>
  actions.find((_action, index) => stewardActionShortcut(index) === key)?.label;

/**
 * What is wrong with a list being edited, per row and for the list as a whole.
 *
 * Separate from `toStoredStewardActions`, which silently drops what it cannot
 * use. That is the right behaviour for a value on its way to the store — a
 * half-typed label should not be written — and the wrong behaviour for a person,
 * who needs to be told why their row is not taking effect.
 */
export interface StewardActionsValidation {
  errorByActionId: Record<string, string>;
  listError?: string;
}

export const validateStewardActions = (
  actions: readonly StewardAction[],
): StewardActionsValidation => {
  const errorByActionId: Record<string, string> = {};
  const seen = new Set<string>();

  actions.forEach((action) => {
    const label = action.label.trim();

    if (!label) {
      errorByActionId[action.id] =
        'A label is needed — it is what gets stored.';
      return;
    }

    if (seen.has(labelKey(label))) {
      errorByActionId[action.id] =
        'Another action already uses this label. Two rows exporting the same text cannot be told apart.';
      return;
    }

    seen.add(labelKey(label));
  });

  return {
    errorByActionId,
    listError:
      actions.length === 0 ? 'At least one action is needed.' : undefined,
  };
};
