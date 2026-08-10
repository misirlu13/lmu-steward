/**
 * @jest-environment node
 */
import { StewardDecision } from '@types';
import {
  decisionId,
  readStewardDecisions,
  saveStewardDecision,
} from './steward-decisions';

let stored: Record<string, StewardDecision> = {};

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({
    get: () => stored,
    // Mirrors the real store, which upserts the entries it is given and leaves
    // every other decision standing.
    set: (_key: string, value: Record<string, StewardDecision>) => {
      stored = { ...stored, ...value };
    },
  }),
}));

const decision = (
  overrides: Partial<StewardDecision> = {},
): StewardDecision => ({
  id: 'session|inc-1|76561198000000001',
  basis: 'incident',
  incidentId: 'inc-1',
  sessionKey: 'session',
  sessionTrack: 'Daytona',
  sessionType: 'RACE',
  target: {
    steamId: '76561198000000001',
    slotId: 19,
    driverName: 'Antares Au',
  },
  involvedParties: [],
  outcome: 'penalty-5s',
  stewardAuthor: 'Bradley',
  decidedAt: 1000,
  state: 'DECIDED',
  status: 'provisional',
  revisions: [],
  ...overrides,
});

beforeEach(() => {
  stored = {};
});

describe('decisionId', () => {
  // Two drivers penalised for one incident are two calls, not one.
  it('should give each target its own decision', () => {
    expect(decisionId('s', 'inc-1', { steamId: 'a' })).not.toBe(
      decisionId('s', 'inc-1', { steamId: 'b' }),
    );
  });

  it('should be stable for the same incident and target', () => {
    expect(decisionId('s', 'inc-1', { steamId: 'a' })).toBe(
      decisionId('s', 'inc-1', { steamId: 'a' }),
    );
  });

  it('should fall back to the slot when there is no steam id', () => {
    expect(decisionId('s', 'inc-1', { slotId: 19 })).toBe('s|inc-1|slot-19');
  });

  it('should key an incident-scoped call without a target', () => {
    expect(decisionId('s', 'inc-1')).toBe('s|inc-1|incident');
  });
});

describe('saveStewardDecision', () => {
  it('should record the original call as revision 1', () => {
    const saved = saveStewardDecision(decision());

    expect(saved.revisions).toHaveLength(1);
    expect(saved.revisions[0]).toMatchObject({
      revisionNumber: 1,
      outcome: 'penalty-5s',
    });
  });

  it('should append a revision when the call changes', () => {
    saveStewardDecision(decision());

    const revised = saveStewardDecision(
      decision({
        outcome: 'no-action',
        reasoning: 'replay shows he was squeezed',
        decidedAt: 2000,
      }),
    );

    expect(revised.revisions.map((r) => r.outcome)).toEqual([
      'penalty-5s',
      'no-action',
    ]);
    expect(revised.outcome).toBe('no-action');
  });

  // A polling UI re-saves constantly; manufacturing revisions from that would
  // turn the audit trail into noise and destroy its value as evidence.
  it('should not manufacture a revision when nothing changed', () => {
    saveStewardDecision(decision());
    const again = saveStewardDecision(decision());

    expect(again.revisions).toHaveLength(1);
  });

  it('should leave other decisions standing', () => {
    saveStewardDecision(decision());
    saveStewardDecision(decision({ id: 'session|inc-2|other' }));

    expect(Object.keys(readStewardDecisions())).toHaveLength(2);
  });

  it('should keep the full history across several revisions', () => {
    saveStewardDecision(decision());
    saveStewardDecision(decision({ outcome: 'penalty-10s', decidedAt: 2000 }));
    const third = saveStewardDecision(
      decision({ outcome: 'no-action', status: 'final', decidedAt: 3000 }),
    );

    expect(third.revisions.map((r) => r.revisionNumber)).toEqual([1, 2, 3]);
    expect(third.status).toBe('final');
  });
});
