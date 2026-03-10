import { getProfileInitials } from './profileInitials';

describe('profileInitials', () => {
  describe('getProfileInitials', () => {
    it('should return fallback for undefined', () => {
      expect(getProfileInitials(undefined)).toBe('S');
    });

    it('should return fallback for empty string', () => {
      expect(getProfileInitials('')).toBe('S');
    });

    it('should return fallback for whitespace only', () => {
      expect(getProfileInitials('   ')).toBe('S');
    });

    it('should use custom fallback when provided', () => {
      expect(getProfileInitials(undefined, 'X')).toBe('X');
      expect(getProfileInitials('', 'Y')).toBe('Y');
    });

    it('should return first initial for single name', () => {
      expect(getProfileInitials('John')).toBe('J');
      expect(getProfileInitials('Alice')).toBe('A');
    });

    it('should return first and last initials for full name', () => {
      expect(getProfileInitials('John Doe')).toBe('JD');
      expect(getProfileInitials('Alice Smith')).toBe('AS');
    });

    it('should handle multiple middle names', () => {
      expect(getProfileInitials('John Michael Doe')).toBe('JD');
      expect(getProfileInitials('Mary Jane Watson Parker')).toBe('MP');
    });

    it('should uppercase initials', () => {
      expect(getProfileInitials('john doe')).toBe('JD');
      expect(getProfileInitials('alice smith')).toBe('AS');
    });

    it('should handle mixed case', () => {
      expect(getProfileInitials('jOhN dOe')).toBe('JD');
      expect(getProfileInitials('aLiCe SmItH')).toBe('AS');
    });

    it('should trim whitespace', () => {
      expect(getProfileInitials('  John Doe  ')).toBe('JD');
      expect(getProfileInitials('   Alice   Smith   ')).toBe('AS');
    });

    it('should handle multiple spaces between names', () => {
      expect(getProfileInitials('John    Doe')).toBe('JD');
      expect(getProfileInitials('Alice     Smith')).toBe('AS');
    });

    it('should handle tabs and other whitespace', () => {
      expect(getProfileInitials('John\t\tDoe')).toBe('JD');
      expect(getProfileInitials('Alice\n\nSmith')).toBe('AS');
    });

    it('should handle names with special characters', () => {
      expect(getProfileInitials("O'Brien")).toBe('O');
      expect(getProfileInitials("Mary O'Brien")).toBe('MO');
    });

    it('should handle hyphenated names', () => {
      expect(getProfileInitials('Mary-Jane')).toBe('M');
      expect(getProfileInitials('Jean-Luc Picard')).toBe('JP');
    });

    it('should handle non-ASCII characters', () => {
      expect(getProfileInitials('José García')).toBe('JG');
      expect(getProfileInitials('François Müller')).toBe('FM');
    });

    it('should handle single character names', () => {
      expect(getProfileInitials('J D')).toBe('JD');
      expect(getProfileInitials('A')).toBe('A');
    });

    it('should handle very long names', () => {
      expect(
        getProfileInitials('Alexander Montgomery Christopher Wellington')
      ).toBe('AW');
    });

    it('should return first initial only when name is whitespace-separated parts that reduce to one', () => {
      expect(getProfileInitials('   John   ')).toBe('J');
    });

    it('should handle names with numbers', () => {
      expect(getProfileInitials('John Doe 3rd')).toBe('J3');
      expect(getProfileInitials('John')).toBe('J');
    });

    it('should handle names starting with numbers', () => {
      expect(getProfileInitials('42 Douglas')).toBe('4D');
    });

    it('should handle emoji in names (edge case)', () => {
      // Emoji are multi-byte, charAt(0) only gets first surrogate pair character
      const result = getProfileInitials('😀 Smith');
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result).toContain('S');
    });

    it('should fallback when name is null after conversion', () => {
      expect(getProfileInitials(null as unknown as string)).toBe('S');
    });
  });
});
