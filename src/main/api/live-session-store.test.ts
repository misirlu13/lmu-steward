import { LiveCaptureIncident, LiveIncidentContext } from '@types';
import {
  LIVE_SESSION_START_QUANTUM_MS,
  buildLiveIncidentRecord,
  deriveLiveSessionKey,
  startedAtFromLiveSessionKey,
} from './live-session-store';

jest.mock('../storage/local-data-store', () => ({
  getMainPersistentStore: () => ({ get: () => ({}), set: () => {} }),
}));

const NOW = 1_800_000_000_000;

describe('deriveLiveSessionKey', () => {
  it('reconstructs the same start from any point in the session', () => {
    // The whole point: a sidecar attaching 10 minutes late must land on the key
    // the original process derived, not open a second session.
    const atStart = deriveLiveSessionKey('Daytona', 10, 0, NOW);
    const tenMinutesLater = deriveLiveSessionKey(
      'Daytona',
      10,
      600,
      NOW + 600_000,
    );

    expect(tenMinutesLater).toBe(atStart);
  });

  it('absorbs clock jitter smaller than the quantum', () => {
    const a = deriveLiveSessionKey('Daytona', 10, 100, NOW);
    const b = deriveLiveSessionKey('Daytona', 10, 100.2, NOW + 900);

    expect(b).toBe(a);
  });

  it('separates a restarted race from the original', () => {
    const first = deriveLiveSessionKey('Daytona', 10, 300, NOW);
    const restarted = deriveLiveSessionKey('Daytona', 10, 0, NOW + 300_000);

    expect(restarted).not.toBe(first);
  });

  it('separates sessions of different types at the same track', () => {
    expect(deriveLiveSessionKey('Daytona', 1, 0, NOW)).not.toBe(
      deriveLiveSessionKey('Daytona', 10, 0, NOW),
    );
  });

  it('keeps practice 1 distinct from practice 4', () => {
    expect(deriveLiveSessionKey('Daytona', 1, 0, NOW)).not.toBe(
      deriveLiveSessionKey('Daytona', 4, 0, NOW),
    );
  });

  it('round-trips the quantised start', () => {
    const key = deriveLiveSessionKey('Daytona', 10, 0, NOW);
    const startedAt = startedAtFromLiveSessionKey(key);

    expect(startedAt % LIVE_SESSION_START_QUANTUM_MS).toBe(0);
    expect(Math.abs(startedAt - NOW)).toBeLessThanOrEqual(
      LIVE_SESSION_START_QUANTUM_MS,
    );
  });

  it('tolerates a missing elapsed time rather than producing NaN', () => {
    const key = deriveLiveSessionKey('Daytona', 10, Number.NaN, NOW);

    expect(key).not.toContain('NaN');
    expect(startedAtFromLiveSessionKey(key)).toBeGreaterThan(0);
  });
});

describe('buildLiveIncidentRecord', () => {
  const context = {
    seq: 1,
    et: 12,
    trackLength: 5000,
    anchorErrorSeconds: 0,
    sectorFlags: [0, 0, 0],
    cars: [{ slotId: 1, frames: [{ t: 0 }] }],
  } as unknown as LiveIncidentContext;

  const incident = {
    id: 'live-1-1',
    kind: 'incident',
    etSeconds: 12,
    raw: 'Contact',
    parties: [],
    context,
    evidence: { offTrackSlotIds: [], cars: [] },
  } as unknown as LiveCaptureIncident;

  const key = deriveLiveSessionKey('Daytona', 10, 12, NOW);

  it('strips the context window but keeps the evidence', () => {
    const record = buildLiveIncidentRecord(key, incident);

    expect(record.incident.context).toBeUndefined();
    expect(record.incident.evidence).toBeDefined();
    expect(record.hasContext).toBe(true);
  });

  it('anchors the incident to wall clock via the session start', () => {
    const record = buildLiveIncidentRecord(key, incident);

    expect(record.occurredAt).toBe(startedAtFromLiveSessionKey(key) + 12_000);
  });

  /*
    Regression. The in-memory id is `live-{generation}-{seq}` and the generation
    counter restarts at 1 with every app launch, so persisting under it made two
    unrelated incidents in one session collide and silently overwrite each other.
  */
  it('does not key on the per-process incident id', () => {
    const record = buildLiveIncidentRecord(key, incident);

    expect(record.id).not.toBe(incident.id);
    expect(record.id.startsWith(key)).toBe(true);
  });

  it('gives the same incident the same id after an app restart', () => {
    const beforeRestart = buildLiveIncidentRecord(key, incident);
    // Same real incident, re-observed by a sidecar whose counters reset.
    const afterRestart = buildLiveIncidentRecord(key, {
      ...incident,
      id: 'live-1-1',
      seq: 1,
    });

    expect(afterRestart.id).toBe(beforeRestart.id);
  });

  it('gives two different incidents in one session different ids', () => {
    const a = buildLiveIncidentRecord(key, incident);
    const b = buildLiveIncidentRecord(key, {
      ...incident,
      id: 'live-1-1',
      etSeconds: 924.7,
      raw: 'Contact elsewhere',
    });

    expect(b.id).not.toBe(a.id);
  });

  it('reports no context when none arrived', () => {
    const record = buildLiveIncidentRecord(key, {
      ...incident,
      context: undefined,
    });

    expect(record.hasContext).toBe(false);
  });
});
