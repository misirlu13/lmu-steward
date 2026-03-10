import {
  normalizeDriverCarClass,
  getDriverCarClass,
  getSessionCarClasses,
  getSessionIncidents,
  getTotalSessionIncidents,
  getSessionDuration,
  getSessionMetaData,
  getSessionDependentData,
  getDriverList,
  getChatMessages,
} from './sessionUtils';
import { LMUReplay } from '@types';
import syncedReplayFixtures from '../../__tests__/fixtures/replay/synced/replay.json';

const syncedReplayFixture = syncedReplayFixtures[0] as LMUReplay;

describe('sessionUtils', () => {
  describe('normalizeDriverCarClass', () => {
    it('should return null for undefined car class', () => {
      expect(normalizeDriverCarClass(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(normalizeDriverCarClass('')).toBeNull();
    });

    it('should normalize LMP2 variants to P2', () => {
      expect(normalizeDriverCarClass('LMP2')).toBe('P2');
      expect(normalizeDriverCarClass('lmp2')).toBe('P2');
      expect(normalizeDriverCarClass('LMP2_Cadillac')).toBe('P2');
    });

    it('should normalize LMP3 variants to P3', () => {
      expect(normalizeDriverCarClass('LMP3')).toBe('P3');
      expect(normalizeDriverCarClass('lmp3')).toBe('P3');
      expect(normalizeDriverCarClass('LMP3_Ligier')).toBe('P3');
    });

    it('should normalize HYPER variants to HY', () => {
      expect(normalizeDriverCarClass('HYPERCAR')).toBe('HY');
      expect(normalizeDriverCarClass('hypercar')).toBe('HY');
      expect(normalizeDriverCarClass('HYPERCAR_Ferrari')).toBe('HY');
    });

    it('should normalize LMGT3 variants to GT3', () => {
      expect(normalizeDriverCarClass('LMGT3')).toBe('GT3');
      expect(normalizeDriverCarClass('lmgt3')).toBe('GT3');
      expect(normalizeDriverCarClass('LMGT3_Porsche')).toBe('GT3');
    });

    it('should preserve other car classes as-is', () => {
      expect(normalizeDriverCarClass('GT4')).toBe('GT4');
      expect(normalizeDriverCarClass('Formula_1')).toBe('Formula');
    });

    it('should handle car class with underscores', () => {
      expect(normalizeDriverCarClass('Custom_Car_Class')).toBe('Custom');
    });
  });

  describe('getDriverCarClass', () => {
    it('should return null for null driver', () => {
      expect(getDriverCarClass(null)).toBeNull();
    });

    it('should return null for undefined driver', () => {
      expect(getDriverCarClass(undefined)).toBeNull();
    });

    it('should extract and normalize car class from driver', () => {
      expect(getDriverCarClass({ CarClass: 'LMP2_Toyota' })).toBe('P2');
      expect(getDriverCarClass({ CarClass: 'HYPERCAR' })).toBe('HY');
    });

    it('should return null when driver has no CarClass', () => {
      expect(getDriverCarClass({})).toBeNull();
    });
  });

  describe('getSessionCarClasses', () => {
    it('should return empty array when logData is missing', () => {
      const replay = { metadata: { session: 'RACE' } } as LMUReplay;
      expect(getSessionCarClasses(replay)).toEqual([]);
    });

    it('should return empty array when session type data is missing', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Practice1: {} },
      } as LMUReplay;
      expect(getSessionCarClasses(replay)).toEqual([]);
    });

    it('should extract unique car classes from synced replay fixture', () => {
      const replay = syncedReplayFixture;
      const carClasses = getSessionCarClasses(replay);

      expect(carClasses).toBeInstanceOf(Array);
      expect(carClasses.length).toBeGreaterThan(0);
      // Unique classes should be deduplicated by lowercase key
      const uniqueClasses = new Set(carClasses.map((c) => c.toLowerCase()));
      expect(uniqueClasses.size).toBe(carClasses.length);
    });

    it('should handle single driver (not array)', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: {
          Race: {
            Driver: { CarClass: 'LMP2' },
          },
        },
      } as LMUReplay;
      expect(getSessionCarClasses(replay)).toEqual(['P2']);
    });

    it('should filter out null car classes', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: {
          Race: {
            Driver: [
              { CarClass: 'LMP2' },
              { CarClass: '' },
              { CarClass: 'HYPERCAR' },
            ],
          },
        },
      } as LMUReplay;
      expect(getSessionCarClasses(replay)).toEqual(['P2', 'HY']);
    });

    it('should deduplicate car classes case-insensitively', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: {
          Race: {
            Driver: [
              { CarClass: 'LMP2' },
              { CarClass: 'lmp2' },
              { CarClass: 'LMP2_Toyota' },
            ],
          },
        },
      } as LMUReplay;
      const result = getSessionCarClasses(replay);
      expect(result).toEqual(['P2']);
    });
  });

  describe('getSessionIncidents', () => {
    it('should return zero counts when logData is missing', () => {
      const replay = { metadata: { session: 'RACE' } } as LMUReplay;
      expect(getSessionIncidents(replay)).toEqual({
        trackLimits: 0,
        incidents: 0,
        penalties: 0,
      });
    });

    it('should return zero counts when session type data is missing', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Practice1: {} },
      } as LMUReplay;
      expect(getSessionIncidents(replay)).toEqual({
        trackLimits: 0,
        incidents: 0,
        penalties: 0,
      });
    });

    it('should count array-based incidents correctly', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: {
          Race: {
            Stream: {
              Incident: [{ et: 100 }, { et: 200 }],
              Penalty: [{ Penalty: 'DT', et: 150 }, { Penalty: null, et: 250 }],
              TrackLimits: [{ et: 50 }],
            },
          },
        },
      } as LMUReplay;

      expect(getSessionIncidents(replay)).toEqual({
        trackLimits: 1,
        incidents: 2,
        penalties: 1, // Only one has actual penalty
      });
    });

    it('should count object-based incidents correctly', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: {
          Race: {
            Stream: {
              Incident: { i1: { et: 100 }, i2: { et: 200 } },
              Penalty: { p1: { Penalty: 'DT', et: 150 } },
              TrackLimits: { t1: { et: 50 }, t2: { et: 75 } },
            },
          },
        },
      } as unknown as LMUReplay;

      expect(getSessionIncidents(replay)).toEqual({
        trackLimits: 2,
        incidents: 2,
        penalties: 1,
      });
    });

    it('should count incidents from synced replay fixture', () => {
      const replay = syncedReplayFixture;
      const incidents = getSessionIncidents(replay);

      expect(incidents).toHaveProperty('trackLimits');
      expect(incidents).toHaveProperty('incidents');
      expect(incidents).toHaveProperty('penalties');
      expect(typeof incidents.trackLimits).toBe('number');
      expect(typeof incidents.incidents).toBe('number');
      expect(typeof incidents.penalties).toBe('number');
    });

    it('should handle missing Stream data', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: {} },
      } as LMUReplay;

      expect(getSessionIncidents(replay)).toEqual({
        trackLimits: 0,
        incidents: 0,
        penalties: 0,
      });
    });

    it('should handle errors gracefully', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: { Stream: null } },
      } as unknown as LMUReplay;

      expect(getSessionIncidents(replay)).toEqual({
        trackLimits: 0,
        incidents: 0,
        penalties: 0,
      });
    });
  });

  describe('getTotalSessionIncidents', () => {
    it('should sum all incident types', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: {
          Race: {
            Stream: {
              Incident: [{ et: 100 }, { et: 200 }],
              Penalty: [{ Penalty: 'DT', et: 150 }],
              TrackLimits: [{ et: 50 }, { et: 60 }, { et: 70 }],
            },
          },
        },
      } as LMUReplay;

      expect(getTotalSessionIncidents(replay)).toBe(6); // 2 + 1 + 3
    });

    it('should return 0 when no incidents exist', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: { Stream: {} } },
      } as LMUReplay;

      expect(getTotalSessionIncidents(replay)).toBe(0);
    });
  });

  describe('getSessionDuration', () => {
    it('should return 00:00:00 when logData is missing', () => {
      const replay = { metadata: { session: 'RACE' } } as LMUReplay;
      expect(getSessionDuration(replay)).toBe('00:00:00');
    });

    it('should return 00:00:00 when session data is missing', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Practice1: {} },
      } as LMUReplay;
      expect(getSessionDuration(replay)).toBe('00:00:00');
    });

    it('should format duration with hours and minutes', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: { Minutes: 90 } },
      } as LMUReplay;
      expect(getSessionDuration(replay)).toBe('01:30:00');
    });

    it('should format duration under one hour', () => {
      const replay = {
        metadata: { session: 'QUALIFY' },
        logData: { Qualify: { Minutes: 15 } },
      } as LMUReplay;
      expect(getSessionDuration(replay)).toBe('00:15:00');
    });

    it('should format duration with multiple hours', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: { Minutes: 370 } },
      } as LMUReplay;
      expect(getSessionDuration(replay)).toBe('06:10:00');
    });

    it('should handle 0 minutes', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: { Minutes: 0 } },
      } as LMUReplay;
      expect(getSessionDuration(replay)).toBe('00:00:00');
    });

    it('should extract duration from synced replay fixture', () => {
      const replay = syncedReplayFixture;
      const duration = getSessionDuration(replay);
      expect(duration).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('getSessionMetaData', () => {
    it('should return defaults when logData is missing', () => {
      const replay = {} as LMUReplay;
      expect(getSessionMetaData(replay)).toEqual({
        fuelMultiplier: 1,
        tireMultiplier: 1,
        tireWarmers: false,
      });
    });

    it('should extract metadata from logData', () => {
      const replay = {
        logData: {
          FuelMult: 2,
          TireMult: 3,
          TireWarmers: '1',
        },
      } as LMUReplay;

      expect(getSessionMetaData(replay)).toEqual({
        fuelMultiplier: 2,
        tireMultiplier: 3,
        tireWarmers: true,
      });
    });

    it('should handle TireWarmers as false when not "1"', () => {
      const replay = {
        logData: {
          TireWarmers: '0',
        },
      } as unknown as LMUReplay;

      expect(getSessionMetaData(replay).tireWarmers).toBe(false);
    });

    it('should use defaults for missing properties', () => {
      const replay = {
        logData: {
          FuelMult: 2.5,
        },
      } as unknown as LMUReplay;

      expect(getSessionMetaData(replay)).toEqual({
        fuelMultiplier: 2.5,
        tireMultiplier: 1,
        tireWarmers: false,
      });
    });

    it('should extract metadata from synced replay fixture', () => {
      const replay = syncedReplayFixture;
      const metadata = getSessionMetaData(replay);

      expect(metadata).toHaveProperty('fuelMultiplier');
      expect(metadata).toHaveProperty('tireMultiplier');
      expect(metadata).toHaveProperty('tireWarmers');
      // Accept both string and number since JSON may contain strings
      expect(['number', 'string']).toContain(typeof metadata.fuelMultiplier);
      expect(['number', 'string']).toContain(typeof metadata.tireMultiplier);
      expect(typeof metadata.tireWarmers).toBe('boolean');
    });
  });

  describe('getSessionDependentData', () => {
    it('should return null when logData is missing', () => {
      const replay = { metadata: { session: 'RACE' } } as LMUReplay;
      expect(getSessionDependentData(replay)).toBeNull();
    });

    it('should return Race data for RACE session', () => {
      const raceData = { Minutes: 60, Driver: [] };
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: raceData },
      } as LMUReplay;
      expect(getSessionDependentData(replay)).toBe(raceData);
    });

    it('should return Qualify data for QUALIFY session', () => {
      const qualifyData = { Minutes: 15, Driver: [] };
      const replay = {
        metadata: { session: 'QUALIFY' },
        logData: { Qualify: qualifyData },
      } as LMUReplay;
      expect(getSessionDependentData(replay)).toBe(qualifyData);
    });

    it('should return Practice1 data for PRACTICE session', () => {
      const practiceData = { Minutes: 90, Driver: [] };
      const replay = {
        metadata: { session: 'PRACTICE' },
        logData: { Practice1: practiceData },
      } as LMUReplay;
      expect(getSessionDependentData(replay)).toBe(practiceData);
    });

    it('should return null when session Minutes is missing', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: {} },
      } as LMUReplay;
      expect(getSessionDependentData(replay)).toBeNull();
    });
  });

  describe('getDriverList', () => {
    it('should return empty array when session data is missing', () => {
      const replay = { metadata: { session: 'RACE' } } as LMUReplay;
      expect(getDriverList(replay)).toEqual([]);
    });

    it('should return driver array from session data', () => {
      const drivers = [{ Name: 'Driver 1' }, { Name: 'Driver 2' }];
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: { Minutes: 60, Driver: drivers } },
      } as LMUReplay;
      expect(getDriverList(replay)).toBe(drivers);
    });

    it('should convert single driver object to array', () => {
      const driver = { Name: 'Driver 1' };
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: { Minutes: 60, Driver: driver } },
      } as unknown as LMUReplay;
      expect(getDriverList(replay)).toEqual([driver]);
    });

    it('should extract driver list from synced replay fixture', () => {
      const replay = syncedReplayFixture;
      const drivers = getDriverList(replay);

      expect(Array.isArray(drivers)).toBe(true);
      expect(drivers.length).toBeGreaterThan(0);
    });
  });

  describe('getChatMessages', () => {
    it('should return empty array when session data is missing', () => {
      const replay = { metadata: { session: 'RACE' } } as LMUReplay;
      expect(getChatMessages(replay)).toEqual([]);
    });

    it('should return chat messages array from stream data', () => {
      const messages = [{ msg: 'Hello' }, { msg: 'World' }];
      const replay = {
        metadata: { session: 'RACE' },
        logData: {
          Race: { Minutes: 60, Stream: { ChatMessage: messages } },
        },
      } as unknown as LMUReplay;
      expect(getChatMessages(replay)).toBe(messages);
    });

    it('should convert single message object to array', () => {
      const message = { msg: 'Hello' };
      const replay = {
        metadata: { session: 'RACE' },
        logData: {
          Race: { Minutes: 60, Stream: { ChatMessage: message } },
        },
      } as unknown as LMUReplay;
      expect(getChatMessages(replay)).toEqual([message]);
    });

    it('should return empty array when no chat messages exist', () => {
      const replay = {
        metadata: { session: 'RACE' },
        logData: { Race: { Minutes: 60, Stream: {} } },
      } as unknown as LMUReplay;
      expect(getChatMessages(replay)).toEqual([]);
    });
  });
});
