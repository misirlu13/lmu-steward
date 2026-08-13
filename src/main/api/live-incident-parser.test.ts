import { isSoloIncident, parseStewardEvent } from './live-incident-parser';

// Every raw string below was captured verbatim from a live LMU session
// (Laguna Seca online practice and Daytona single player, 2026-07-28).

describe('parseStewardEvent', () => {
  describe('car-to-car contact', () => {
    const raw =
      '<Incident et="6235.4">matteo stefano(50) reported contact (210.78) with another vehicle Rafael Cruvinel(14)</Incident>';

    it('should extract both parties with their slot ids', () => {
      const incident = parseStewardEvent(raw, 'incident', 6235.4, 'i1');

      expect(incident.parties).toEqual([
        { displayName: 'matteo stefano', slotId: 50 },
        { displayName: 'Rafael Cruvinel', slotId: 14 },
      ]);
    });

    it('should extract the contact magnitude and object struck', () => {
      const incident = parseStewardEvent(raw, 'incident', 6235.4, 'i1');

      expect(incident.magnitude).toBeCloseTo(210.78, 2);
      expect(incident.objectStruck).toBe('another vehicle');
    });

    it('should not classify a two-car collision as solo', () => {
      expect(
        isSoloIncident(parseStewardEvent(raw, 'incident', 6235.4, 'i1')),
      ).toBe(false);
    });
  });

  describe('solo contact', () => {
    it('should record the struck object and only one party', () => {
      const incident = parseStewardEvent(
        '<Incident et="66.1">Bradley Drake(0) reported contact (8954.12) with Immovable</Incident>',
        'incident',
        66.1,
        'i2',
      );

      expect(incident.parties).toEqual([
        { displayName: 'Bradley Drake', slotId: 0 },
      ]);
      expect(incident.objectStruck).toBe('Immovable');
      expect(isSoloIncident(incident)).toBe(true);
    });

    it('should handle other struck objects seen in the wild', () => {
      const cone = parseStewardEvent(
        '<Incident et="17.7">Bradley Drake(0) reported contact (60.04) with Cone</Incident>',
        'incident',
        17.7,
        'i3',
      );
      const sign = parseStewardEvent(
        '<Incident et="6235.9">Rafael Cruvinel(14) reported contact (21.37) with Sign</Incident>',
        'incident',
        6235.9,
        'i4',
      );

      expect(cone.objectStruck).toBe('Cone');
      expect(sign.objectStruck).toBe('Sign');
      expect(isSoloIncident(cone)).toBe(true);
      expect(isSoloIncident(sign)).toBe(true);
    });
  });

  describe('track limits', () => {
    it('should extract points, resolution text, and lap', () => {
      const incident = parseStewardEvent(
        '<TrackLimits Driver="S F#7575" ID="54" Lap="8" WarningPoints="0.25" CurrentPoints="2" Resolution="5" et="6180.2">Invalid Lap Cut Track</TrackLimits>',
        'track-limits',
        6180.2,
        't1',
      );

      expect(incident.kind).toBe('track-limits');
      expect(incident.parties).toEqual([
        { displayName: 'S F#7575', slotId: 54 },
      ]);
      expect(incident.warningPoints).toBe(0.25);
      expect(incident.currentPoints).toBe(2);
      expect(incident.lap).toBe(8);
      expect(incident.resolution).toBe('Invalid Lap Cut Track');
    });

    it('should distinguish a no-action resolution', () => {
      const incident = parseStewardEvent(
        '<TrackLimits Driver="Bradley Drake" ID="0" Lap="0" WarningPoints="0" CurrentPoints="23.75" Resolution="7" et="73.9">No Further Action</TrackLimits>',
        'track-limits',
        73.9,
        't2',
      );

      expect(incident.resolution).toBe('No Further Action');
      expect(incident.currentPoints).toBe(23.75);
      expect(isSoloIncident(incident)).toBe(false);
    });

    it('should tolerate driver names containing a discriminator', () => {
      const incident = parseStewardEvent(
        '<TrackLimits Driver="Bence Biro#6702" ID="65" Lap="3" WarningPoints="0" CurrentPoints="0" Resolution="7" et="6209.2">No Further Action</TrackLimits>',
        'track-limits',
        6209.2,
        't3',
      );

      expect(incident.parties[0].displayName).toBe('Bence Biro#6702');
      expect(incident.parties[0].slotId).toBe(65);
    });
  });

  it('should not throw on an unrecognised body', () => {
    const incident = parseStewardEvent(
      '<Incident et="1.0">something entirely unexpected</Incident>',
      'incident',
      1,
      'i9',
    );

    expect(incident.parties).toEqual([]);
    expect(incident.magnitude).toBeUndefined();
  });
});
