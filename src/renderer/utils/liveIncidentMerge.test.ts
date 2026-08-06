import { ReplayIncidentEvent } from '../components/Replay/replayTimelineTypes';
import { attachLiveEvidenceToEvents } from './liveIncidentMerge';

const evidence = { offTrackSlotIds: [], cars: [] } as never;

const event = (
  overrides: Partial<ReplayIncidentEvent> = {},
): ReplayIncidentEvent => ({
  id: 'collision-0-120.2',
  type: 'collision',
  timestampLabel: '2:00.2',
  lapLabel: 'Lap 3',
  drivers: [],
  etSeconds: 120.2,
  sourceText:
    'Tadeas Lycka(2) reported contact (1065.03) with another vehicle Francesco Truscelli(6)',
  ...overrides,
});

const live = (overrides = {}) => ({
  id: 'session#abc123',
  etSeconds: 120.2,
  raw: '<Incident et="120.2">Tadeas Lycka(2) reported contact (1065.03) with another vehicle Francesco Truscelli(6)</Incident>',
  parties: [
    { displayName: 'Tadeas Lycka', slotId: 2 },
    { displayName: 'Francesco Truscelli', slotId: 6 },
  ],
  evidence,
  hasContext: true,
  ...overrides,
});

describe('attachLiveEvidenceToEvents', () => {
  it('attaches evidence to the incident it belongs to', () => {
    const [merged] = attachLiveEvidenceToEvents([event()], [live()]);

    expect(merged.liveIncidentId).toBe('session#abc123');
    expect(merged.liveEvidence).toBe(evidence);
    expect(merged.hasLiveContext).toBe(true);
  });

  /*
    The XML is authoritative. A live incident with no counterpart is dropped
    rather than added, or the replay view's incident count stops being the log's.
  */
  it('never adds, removes or reorders an incident', () => {
    const events = [
      event({
        id: 'a',
        etSeconds: 10,
        sourceText: 'A(1) reported contact (5.0) with Immovable',
      }),
      event({
        id: 'b',
        etSeconds: 20,
        sourceText: 'B(2) reported contact (5.0) with Immovable',
      }),
    ];

    const merged = attachLiveEvidenceToEvents(events, [
      live({
        id: 'unrelated',
        etSeconds: 999,
        raw: '<Incident et="999">Nobody(9) reported contact (1.0) with Immovable</Incident>',
        parties: [],
      }),
    ]);

    expect(merged.map((e) => e.id)).toEqual(['a', 'b']);
    expect(merged.every((e) => e.liveIncidentId === undefined)).toBe(true);
  });

  /*
    Measured on a real log: `Bradley Drake(0) reported contact (20.56) with
    Immovable` appears seven times across one session, minutes apart. Matching
    on text alone would put one incident's evidence on all seven.
  */
  it('does not attach the same text at a different elapsed time', () => {
    const text = 'Bradley Drake(0) reported contact (20.56) with Immovable';
    const events = [
      event({ id: 'first', etSeconds: 20.0, sourceText: text }),
      event({ id: 'later', etSeconds: 647.4, sourceText: text }),
    ];

    const merged = attachLiveEvidenceToEvents(events, [
      live({
        id: 'live-at-20',
        etSeconds: 20.0,
        raw: `<Incident et="20.0">${text}</Incident>`,
        parties: [{ displayName: 'Bradley Drake', slotId: 0 }],
      }),
    ]);

    expect(merged[0].liveIncidentId).toBe('live-at-20');
    expect(merged[1].liveIncidentId).toBeUndefined();
  });

  /*
    Measured on a real multiplayer log: three records at et 122.3 for one driver
    hitting one post, identical but for the impact force. Elapsed time and
    participants are both the same, so only the text separates them.
  */
  it('separates records that differ only in impact force', () => {
    const events = [
      event({
        id: 'force-28',
        etSeconds: 122.3,
        sourceText: 'Gildas BEN(7) reported contact (28.72) with Post',
      }),
      event({
        id: 'force-41',
        etSeconds: 122.3,
        sourceText: 'Gildas BEN(7) reported contact (41.90) with Post',
      }),
    ];

    const merged = attachLiveEvidenceToEvents(events, [
      live({
        id: 'live-force-41',
        etSeconds: 122.3,
        raw: '<Incident et="122.3">Gildas BEN(7) reported contact (41.90) with Post</Incident>',
        parties: [{ displayName: 'Gildas BEN', slotId: 7 }],
      }),
    ]);

    expect(merged[0].liveIncidentId).toBeUndefined();
    expect(merged[1].liveIncidentId).toBe('live-force-41');
  });

  /*
    ⚠️ The mirrored collision. LMU writes one contact twice, once from each
    driver's seat, at the same elapsed time with different impact forces — the
    sidecar folds them into one live incident, so the mirrored row's text can
    never match. Both rows must still carry the evidence, which is why the merge
    is one-to-many.

    Format taken from a real multiplayer log; the offline captures contain no
    mirrors at all, so this case is invisible to them.
  */
  it('attaches one live incident to both records of a mirrored collision', () => {
    const events = [
      event({
        id: 'perspective-a',
        sourceText:
          'Tadeas Lycka(2) reported contact (1065.03) with another vehicle Francesco Truscelli(6)',
      }),
      event({
        id: 'perspective-b',
        sourceText:
          'Francesco Truscelli(6) reported contact (1076.29) with another vehicle Tadeas Lycka(2)',
      }),
    ];

    const merged = attachLiveEvidenceToEvents(events, [live()]);

    expect(merged[0].liveIncidentId).toBe('session#abc123');
    expect(merged[1].liveIncidentId).toBe('session#abc123');
    expect(merged[1].liveEvidence).toBe(evidence);
  });

  it('does not treat a different pair of cars as a mirror', () => {
    const merged = attachLiveEvidenceToEvents(
      [
        event({
          id: 'other-pair',
          sourceText:
            'Someone Else(9) reported contact (12.00) with another vehicle Another Driver(4)',
        }),
      ],
      [live()],
    );

    expect(merged[0].liveIncidentId).toBeUndefined();
  });

  // One scoring tick of slack, no more — the two clocks are the same clock.
  it('tolerates a tick of clock disagreement', () => {
    const [merged] = attachLiveEvidenceToEvents(
      [event({ etSeconds: 120.3 })],
      [live({ etSeconds: 120.2 })],
    );

    expect(merged.liveIncidentId).toBe('session#abc123');
  });

  it('does not reach across a wider gap', () => {
    const [merged] = attachLiveEvidenceToEvents(
      [event({ etSeconds: 122.0 })],
      [live({ etSeconds: 120.2 })],
    );

    expect(merged.liveIncidentId).toBeUndefined();
  });

  /*
    Track limits and solo penalties never get a context window — that bound is
    what keeps captured storage tolerable — so there is nothing to attach and
    matching them would only risk landing evidence on the wrong row.
  */
  it('leaves track limits and penalties alone', () => {
    const merged = attachLiveEvidenceToEvents(
      [
        event({ id: 'tl', type: 'track-limit' }),
        event({ id: 'pen', type: 'penalty' }),
      ],
      [live()],
    );

    expect(merged.every((e) => e.liveIncidentId === undefined)).toBe(true);
  });

  it('returns the events untouched when nothing was captured', () => {
    const events = [event()];
    expect(attachLiveEvidenceToEvents(events, [])).toBe(events);
  });

  it('reports an incident captured without a trace as having none', () => {
    const [merged] = attachLiveEvidenceToEvents(
      [event()],
      [live({ hasContext: false, evidence: undefined })],
    );

    expect(merged.liveIncidentId).toBe('session#abc123');
    expect(merged.hasLiveContext).toBe(false);
    expect(merged.liveEvidence).toBeUndefined();
  });
});
