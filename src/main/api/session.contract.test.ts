import { readFileSync } from 'fs';
import path from 'path';

const readFixture = (fileName: string) => {
  const fixturePath = path.resolve(
    __dirname,
    '../../__tests__/fixtures/replay/synced',
    fileName,
  );
  return JSON.parse(readFileSync(fixturePath, 'utf8'));
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasNumber = (value: Record<string, unknown>, key: string) =>
  Number.isFinite(Number(value[key]));

const hasString = (value: Record<string, unknown>, key: string) =>
  typeof value[key] === 'string' && String(value[key]).trim().length > 0;

describe('LMU BE response contracts (fixture-backed)', () => {
  it('sessionInfo fixture matches required contract fields', () => {
    const payload = readFixture('sessionInfo.json');

    expect(isObject(payload)).toBe(true);
    if (!isObject(payload)) {
      return;
    }

    expect(hasString(payload, 'session')).toBe(true);
    expect(hasString(payload, 'trackName')).toBe(true);
    expect(hasNumber(payload, 'numberOfVehicles')).toBe(true);
    expect(hasNumber(payload, 'endEventTime')).toBe(true);
    expect(hasNumber(payload, 'ambientTemp')).toBe(true);
  });

  it('standings fixture entries match required contract fields', () => {
    const payload = readFixture('standings.json');

    expect(Array.isArray(payload)).toBe(true);
    if (!Array.isArray(payload) || payload.length === 0) {
      return;
    }

    const first = payload[0] as Record<string, unknown>;
    expect(hasString(first, 'driverName')).toBe(true);
    expect(hasString(first, 'carClass')).toBe(true);
    expect(hasNumber(first, 'position')).toBe(true);
    expect(hasNumber(first, 'slotID')).toBe(true);
    expect(typeof first.pitting === 'boolean').toBe(true);
  });

  it('standingsHistory fixture matches required dictionary-of-arrays contract', () => {
    const payload = readFixture('standingsHistory.json');

    expect(isObject(payload)).toBe(true);
    if (!isObject(payload)) {
      return;
    }

    const firstEntry = Object.values(payload)[0];
    expect(Array.isArray(firstEntry)).toBe(true);
    if (!Array.isArray(firstEntry) || firstEntry.length === 0) {
      return;
    }

    const firstHistoryRow = firstEntry[0] as Record<string, unknown>;
    expect(hasString(firstHistoryRow, 'driverName')).toBe(true);
    expect(hasNumber(firstHistoryRow, 'slotID')).toBe(true);
    expect(hasNumber(firstHistoryRow, 'position')).toBe(true);
  });
});
