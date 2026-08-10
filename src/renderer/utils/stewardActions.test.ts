import {
  DEFAULT_STEWARD_ACTIONS,
  MAX_STEWARD_ACTION_LABEL_LENGTH,
  StewardAction,
  areStewardActionsDefault,
  isDriverScopedOutcome,
  outcomeForShortcut,
  resolveStewardActions,
  stewardActionShortcut,
  toStoredStewardActions,
  validateStewardActions,
} from './stewardActions';

const action = (over: Partial<StewardAction> = {}): StewardAction => ({
  id: 'a-1',
  label: 'Stop-Go',
  driverScoped: true,
  ...over,
});

describe('resolveStewardActions', () => {
  /*
    Absent is the shipped default and has to stay usable. The dossier draws its
    buttons from this, so an empty result is a screen with nothing to press.
  */
  it.each([
    ['never set', undefined],
    ['explicitly cleared', null],
    ['not a list', 'penalty-5s'],
    ['an empty list', []],
    ['a list of nothing usable', [{}, 42, { label: '   ' }]],
  ])(
    'should fall back to the shipped tariff when settings hold %s',
    (_case, stored) => {
      expect(resolveStewardActions(stored)).toEqual([
        ...DEFAULT_STEWARD_ACTIONS,
      ]);
    },
  );

  it('should return the configured list when there is one', () => {
    expect(
      resolveStewardActions([
        { id: 'x', label: 'DT', driverScoped: true },
        { id: 'y', label: 'Noted', driverScoped: false },
      ]),
    ).toEqual([
      { id: 'x', label: 'DT', driverScoped: true },
      { id: 'y', label: 'Noted', driverScoped: false },
    ]);
  });

  /*
    One bad row must not cost the user the rest of their tariff — a store that
    has been hand-edited, or written by an older shape, should degrade to what is
    still readable rather than silently reverting everything.
  */
  it('should drop unusable rows and keep the rest', () => {
    expect(
      resolveStewardActions([
        { id: 'a', label: 'DT', driverScoped: true },
        { id: 'b', label: '  ', driverScoped: true },
        { id: 'c', label: 'dt', driverScoped: false },
        'nonsense',
        { id: 'd', label: 'Warning', driverScoped: false },
      ]),
    ).toEqual([
      { id: 'a', label: 'DT', driverScoped: true },
      { id: 'd', label: 'Warning', driverScoped: false },
    ]);
  });

  it('should trim and cap a stored label', () => {
    const [only] = resolveStewardActions([
      { id: 'a', label: `  ${'x'.repeat(80)}  `, driverScoped: true },
    ]);

    expect(only.label).toHaveLength(MAX_STEWARD_ACTION_LABEL_LENGTH);
  });

  // Missing ids would collide as React keys and make rows swap under the cursor.
  it('should give every row an id, even when the store has none', () => {
    const resolved = resolveStewardActions([
      { label: 'DT', driverScoped: true },
      { label: 'Warning', driverScoped: false },
      { id: 'DT', label: 'Grid Drop', driverScoped: true },
      { id: 'DT', label: 'Reprimand', driverScoped: false },
    ]);

    const ids = resolved.map((entry) => entry.id);

    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    expect(ids.every(Boolean)).toBe(true);
  });

  /*
    The safe direction. An action wrongly marked driver-scoped asks for a target
    that was not needed; the other way round writes a penalty nobody can act on.
  */
  it('should treat an unreadable driver scope as driver-scoped', () => {
    expect(
      resolveStewardActions([{ id: 'a', label: 'DT' }])[0].driverScoped,
    ).toBe(true);
  });
});

describe('toStoredStewardActions', () => {
  /*
    Absent means "use the defaults", which is the whole mechanism behind revert:
    storing a copy of the five defaults would freeze them into the install, and a
    later change to the shipped set would never reach anyone who reverted.
  */
  it('should store nothing for the shipped tariff', () => {
    expect(toStoredStewardActions([...DEFAULT_STEWARD_ACTIONS])).toBeNull();
  });

  // Ids are editing scaffolding, so a list that matches on what is exported is
  // the shipped tariff whatever its rows are keyed by.
  it('should store nothing for the shipped tariff under different ids', () => {
    expect(
      toStoredStewardActions(
        DEFAULT_STEWARD_ACTIONS.map((entry, index) => ({
          ...entry,
          id: `whatever-${index}`,
        })),
      ),
    ).toBeNull();
  });

  it('should store a list that departs from the shipped tariff', () => {
    const custom = [...DEFAULT_STEWARD_ACTIONS].slice(0, 4);

    expect(toStoredStewardActions(custom)).toEqual(custom);
  });

  it('should store a reordered shipped tariff, which is a real change', () => {
    const reordered = [
      DEFAULT_STEWARD_ACTIONS[1],
      DEFAULT_STEWARD_ACTIONS[0],
      ...DEFAULT_STEWARD_ACTIONS.slice(2),
    ];

    expect(toStoredStewardActions(reordered)).toEqual(reordered);
  });

  /*
    The settings view hydrates through this and then compares the payload it
    would send against that same value. If it were not idempotent the view would
    autosave once on every load.
  */
  it('should be idempotent', () => {
    const messy = [
      { id: 'a', label: '  DT  ', driverScoped: true },
      { id: 'a', label: 'DT', driverScoped: false },
      { label: 'Warning' },
    ];

    const once = toStoredStewardActions(messy);

    expect(toStoredStewardActions(once)).toEqual(once);
  });
});

describe('areStewardActionsDefault', () => {
  it('should be true for the shipped tariff', () => {
    expect(areStewardActionsDefault([...DEFAULT_STEWARD_ACTIONS])).toBe(true);
  });

  it('should be false once a label is changed', () => {
    expect(
      areStewardActionsDefault([
        { ...DEFAULT_STEWARD_ACTIONS[0], label: '5 Second Penalty' },
        ...DEFAULT_STEWARD_ACTIONS.slice(1),
      ]),
    ).toBe(false);
  });

  // Same words, different meaning: the record would stop naming a driver.
  it('should be false once a driver scope is changed', () => {
    expect(
      areStewardActionsDefault([
        { ...DEFAULT_STEWARD_ACTIONS[0], driverScoped: false },
        ...DEFAULT_STEWARD_ACTIONS.slice(1),
      ]),
    ).toBe(false);
  });
});

describe('shortcuts', () => {
  it('should number the first nine actions', () => {
    expect([0, 1, 8].map(stewardActionShortcut)).toEqual(['1', '2', '9']);
  });

  // A tenth action is still clickable; there is simply no key left for it.
  it('should give the tenth action no key', () => {
    expect(stewardActionShortcut(9)).toBeUndefined();
  });

  /*
    Derived from the configured order rather than assigned, from the same rule
    the buttons print — so a keystroke and the button beside it cannot come to
    mean different things.
  */
  it('should resolve a key to the outcome at that position', () => {
    const actions = [
      action({ id: 'a', label: 'DT' }),
      action({ id: 'b', label: 'Warning' }),
    ];

    expect(outcomeForShortcut(actions, '1')).toBe('DT');
    expect(outcomeForShortcut(actions, '2')).toBe('Warning');
  });

  it('should resolve nothing for a key past the end of the list', () => {
    expect(outcomeForShortcut([action()], '2')).toBeUndefined();
    expect(outcomeForShortcut([action()], 'f')).toBeUndefined();
  });

  // Reordering moves the shortcut with the row, which is why order is editable.
  it('should follow the configured order', () => {
    const actions = [
      action({ id: 'a', label: 'Warning' }),
      action({ id: 'b', label: 'DT' }),
    ];

    expect(outcomeForShortcut(actions, '1')).toBe('Warning');
  });
});

describe('isDriverScopedOutcome', () => {
  const actions = [
    action({ id: 'a', label: 'DT', driverScoped: true }),
    action({ id: 'b', label: 'Warning', driverScoped: false }),
  ];

  it('should follow the configured flag', () => {
    expect(isDriverScopedOutcome(actions, 'DT')).toBe(true);
    expect(isDriverScopedOutcome(actions, 'Warning')).toBe(false);
  });

  /*
    Unreachable in practice — every outcome originates from this same list — and
    permissive is the right direction for a guard that must never refuse a call
    the UI has just offered.
  */
  it('should not claim an unknown outcome needs a driver', () => {
    expect(isDriverScopedOutcome(actions, 'penalty-5s')).toBe(false);
  });

  // The shipped tariff's own answer, which the original fixed check gave too.
  it('should hold for the shipped tariff', () => {
    const shipped = [...DEFAULT_STEWARD_ACTIONS];

    expect(isDriverScopedOutcome(shipped, '5s Penalty')).toBe(true);
    expect(isDriverScopedOutcome(shipped, 'Drive-Through')).toBe(true);
    expect(isDriverScopedOutcome(shipped, 'No Action')).toBe(false);
    expect(isDriverScopedOutcome(shipped, 'Note Only')).toBe(false);
  });
});

describe('validateStewardActions', () => {
  it('should accept the shipped tariff', () => {
    expect(validateStewardActions([...DEFAULT_STEWARD_ACTIONS])).toEqual({
      errorByActionId: {},
      listError: undefined,
    });
  });

  it('should flag a row with no label', () => {
    const { errorByActionId } = validateStewardActions([
      action({ id: 'blank', label: '   ' }),
    ]);

    expect(errorByActionId.blank).toMatch(/label is needed/i);
  });

  /*
    Two rows exporting the same string are indistinguishable in the spreadsheet
    the labels exist to match, and a near-miss on case is a typo rather than a
    design.
  */
  it('should flag the second row using a label already taken', () => {
    const { errorByActionId } = validateStewardActions([
      action({ id: 'first', label: 'DT' }),
      action({ id: 'second', label: ' dt ' }),
    ]);

    expect(errorByActionId.first).toBeUndefined();
    expect(errorByActionId.second).toMatch(/already uses this label/i);
  });

  it('should flag an empty tariff', () => {
    expect(validateStewardActions([]).listError).toMatch(
      /at least one action/i,
    );
  });
});
