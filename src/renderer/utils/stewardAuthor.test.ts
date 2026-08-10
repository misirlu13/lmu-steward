import { DEFAULT_STEWARD_AUTHOR, resolveStewardAuthor } from './stewardAuthor';

describe('resolveStewardAuthor', () => {
  it('should use the name the steward set', () => {
    expect(resolveStewardAuthor('Bradley')).toBe('Bradley');
  });

  it('should trim surrounding whitespace off a real name', () => {
    expect(resolveStewardAuthor('  Bradley  ')).toBe('Bradley');
  });

  /*
    The setting ships blank, so this is the common path, not the edge one.
    `StewardDecision.stewardAuthor` is required and is what a call is defended
    by under appeal — an empty one is worse than a generic one, because it reads
    as a record with something missing rather than a record made by a steward
    who never gave a name.
  */
  it.each([
    ['unset', ''],
    ['whitespace only', '   '],
    ['missing', undefined],
    ['not a string', 42],
  ])('should never produce an empty author when %s', (_case, value) => {
    expect(resolveStewardAuthor(value)).toBe(DEFAULT_STEWARD_AUTHOR);
    expect(resolveStewardAuthor(value).trim()).not.toBe('');
  });
});
