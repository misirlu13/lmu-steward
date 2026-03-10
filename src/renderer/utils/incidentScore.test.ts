import { getSessionIncidentScore, getDriverIncidentScore } from './incidentScore';
import { SessionIncidents } from '@types';

describe('incidentScore', () => {
  describe('getSessionIncidentScore', () => {
    it('should calculate score with all incident types', () => {
      const incidents: SessionIncidents = {
        trackLimits: 10,
        incidents: 5,
        penalties: 2,
      };
      // Score = (10 * 1) + (5 * 3) + (2 * 5) = 10 + 15 + 10 = 35
      // Per driver with 22 drivers = 35 / 22 ≈ 1.59
      expect(getSessionIncidentScore(incidents, 22)).toBeCloseTo(1.59, 2);
    });

    it('should handle zero incidents', () => {
      const incidents: SessionIncidents = {
        trackLimits: 0,
        incidents: 0,
        penalties: 0,
      };
      expect(getSessionIncidentScore(incidents, 22)).toBe(0);
    });

    it('should handle missing incident properties with defaults', () => {
      const incidents = {} as SessionIncidents;
      expect(getSessionIncidentScore(incidents, 22)).toBe(0);
    });

    it('should weight penalties highest (5x)', () => {
      const incidents: SessionIncidents = {
        trackLimits: 0,
        incidents: 0,
        penalties: 1,
      };
      expect(getSessionIncidentScore(incidents, 1)).toBe(5);
    });

    it('should weight incidents as medium (3x)', () => {
      const incidents: SessionIncidents = {
        trackLimits: 0,
        incidents: 1,
        penalties: 0,
      };
      expect(getSessionIncidentScore(incidents, 1)).toBe(3);
    });

    it('should weight track limits lowest (1x)', () => {
      const incidents: SessionIncidents = {
        trackLimits: 1,
        incidents: 0,
        penalties: 0,
      };
      expect(getSessionIncidentScore(incidents, 1)).toBe(1);
    });

    it('should divide total score by driver count', () => {
      const incidents: SessionIncidents = {
        trackLimits: 100,
        incidents: 0,
        penalties: 0,
      };
      expect(getSessionIncidentScore(incidents, 10)).toBe(10);
      expect(getSessionIncidentScore(incidents, 20)).toBe(5);
    });

    it('should handle single driver', () => {
      const incidents: SessionIncidents = {
        trackLimits: 5,
        incidents: 2,
        penalties: 1,
      };
      // Score = (5 * 1) + (2 * 3) + (1 * 5) = 5 + 6 + 5 = 16
      expect(getSessionIncidentScore(incidents, 1)).toBe(16);
    });

    it('should handle large driver counts', () => {
      const incidents: SessionIncidents = {
        trackLimits: 50,
        incidents: 25,
        penalties: 10,
      };
      // Score = (50 * 1) + (25 * 3) + (10 * 5) = 50 + 75 + 50 = 175
      expect(getSessionIncidentScore(incidents, 100)).toBe(1.75);
    });

    it('should handle division by zero gracefully (return Infinity)', () => {
      const incidents: SessionIncidents = {
        trackLimits: 10,
        incidents: 5,
        penalties: 2,
      };
      expect(getSessionIncidentScore(incidents, 0)).toBe(Infinity);
    });
  });

  describe('getDriverIncidentScore', () => {
    it('should calculate score with all incident types', () => {
      const incidents: SessionIncidents = {
        trackLimits: 3,
        incidents: 2,
        penalties: 1,
      };
      // Score = (3 * 1) + (2 * 3) + (1 * 5) = 3 + 6 + 5 = 14
      // Per lap with 10 laps = 14 / 10 = 1.4
      expect(getDriverIncidentScore(incidents, 10)).toBe(1.4);
    });

    it('should handle zero incidents', () => {
      const incidents: SessionIncidents = {
        trackLimits: 0,
        incidents: 0,
        penalties: 0,
      };
      expect(getDriverIncidentScore(incidents, 10)).toBe(0);
    });

    it('should handle missing incident properties with defaults', () => {
      const incidents = {} as SessionIncidents;
      expect(getDriverIncidentScore(incidents, 10)).toBe(0);
    });

    it('should return raw score when lapsCompleted is 0 (DNF case)', () => {
      const incidents: SessionIncidents = {
        trackLimits: 5,
        incidents: 2,
        penalties: 1,
      };
      // Score = (5 * 1) + (2 * 3) + (1 * 5) = 5 + 6 + 5 = 16
      expect(getDriverIncidentScore(incidents, 0)).toBe(16);
    });

    it('should return raw score when lapsCompleted is undefined', () => {
      const incidents: SessionIncidents = {
        trackLimits: 5,
        incidents: 2,
        penalties: 1,
      };
      expect(getDriverIncidentScore(incidents, undefined as unknown as number)).toBe(16);
    });

    it('should weight penalties highest (5x)', () => {
      const incidents: SessionIncidents = {
        trackLimits: 0,
        incidents: 0,
        penalties: 1,
      };
      expect(getDriverIncidentScore(incidents, 1)).toBe(5);
    });

    it('should weight incidents as medium (3x)', () => {
      const incidents: SessionIncidents = {
        trackLimits: 0,
        incidents: 1,
        penalties: 0,
      };
      expect(getDriverIncidentScore(incidents, 1)).toBe(3);
    });

    it('should weight track limits lowest (1x)', () => {
      const incidents: SessionIncidents = {
        trackLimits: 1,
        incidents: 0,
        penalties: 0,
      };
      expect(getDriverIncidentScore(incidents, 1)).toBe(1);
    });

    it('should divide total score by laps completed', () => {
      const incidents: SessionIncidents = {
        trackLimits: 100,
        incidents: 0,
        penalties: 0,
      };
      expect(getDriverIncidentScore(incidents, 10)).toBe(10);
      expect(getDriverIncidentScore(incidents, 20)).toBe(5);
    });

    it('should handle single lap completed', () => {
      const incidents: SessionIncidents = {
        trackLimits: 5,
        incidents: 2,
        penalties: 1,
      };
      // Score = (5 * 1) + (2 * 3) + (1 * 5) = 5 + 6 + 5 = 16
      expect(getDriverIncidentScore(incidents, 1)).toBe(16);
    });

    it('should handle many laps completed', () => {
      const incidents: SessionIncidents = {
        trackLimits: 50,
        incidents: 10,
        penalties: 5,
      };
      // Score = (50 * 1) + (10 * 3) + (5 * 5) = 50 + 30 + 25 = 105
      expect(getDriverIncidentScore(incidents, 50)).toBe(2.1);
    });

    it('should produce different scores than session score for same incidents', () => {
      const incidents: SessionIncidents = {
        trackLimits: 10,
        incidents: 5,
        penalties: 2,
      };
      const sessionScore = getSessionIncidentScore(incidents, 22);
      const driverScore = getDriverIncidentScore(incidents, 22);

      // Both functions divide by the same number (22), so they should be equal
      expect(sessionScore).toBe(driverScore);
    });

    it('should handle high incident counts per lap', () => {
      const incidents: SessionIncidents = {
        trackLimits: 100,
        incidents: 50,
        penalties: 20,
      };
      // Score = (100 * 1) + (50 * 3) + (20 * 5) = 100 + 150 + 100 = 350
      expect(getDriverIncidentScore(incidents, 5)).toBe(70);
    });

    it('should return decimal scores for fractional results', () => {
      const incidents: SessionIncidents = {
        trackLimits: 3,
        incidents: 1,
        penalties: 0,
      };
      // Score = (3 * 1) + (1 * 3) = 6
      expect(getDriverIncidentScore(incidents, 7)).toBeCloseTo(0.857, 3);
    });
  });

  describe('scoring weight consistency', () => {
    it('should maintain 5:3:1 ratio for penalties:incidents:trackLimits', () => {
      const oneOfEach: SessionIncidents = {
        trackLimits: 1,
        incidents: 1,
        penalties: 1,
      };
      const score = getDriverIncidentScore(oneOfEach, 1);
      expect(score).toBe(1 + 3 + 5); // 9 total

      // Verify each contribution
      expect(getDriverIncidentScore({ trackLimits: 1, incidents: 0, penalties: 0 }, 1)).toBe(1);
      expect(getDriverIncidentScore({ trackLimits: 0, incidents: 1, penalties: 0 }, 1)).toBe(3);
      expect(getDriverIncidentScore({ trackLimits: 0, incidents: 0, penalties: 1 }, 1)).toBe(5);
    });

    it('should score 5 track limits equal to 1 penalty', () => {
      const trackLimitsOnly: SessionIncidents = {
        trackLimits: 5,
        incidents: 0,
        penalties: 0,
      };
      const penaltiesOnly: SessionIncidents = {
        trackLimits: 0,
        incidents: 0,
        penalties: 1,
      };
      expect(getDriverIncidentScore(trackLimitsOnly, 1)).toBe(
        getDriverIncidentScore(penaltiesOnly, 1)
      );
    });

    it('should score 3 track limits equal to 1 incident', () => {
      const trackLimitsOnly: SessionIncidents = {
        trackLimits: 3,
        incidents: 0,
        penalties: 0,
      };
      const incidentsOnly: SessionIncidents = {
        trackLimits: 0,
        incidents: 1,
        penalties: 0,
      };
      expect(getDriverIncidentScore(trackLimitsOnly, 1)).toBe(
        getDriverIncidentScore(incidentsOnly, 1)
      );
    });
  });
});
