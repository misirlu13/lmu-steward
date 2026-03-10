import {
  getLmuExecutablePathValidationError,
  getLmuReplayDirectoryPathValidationError,
} from './user-settings';

describe('main/user-settings path validation', () => {
  describe('getLmuExecutablePathValidationError', () => {
    it('requires a value', () => {
      expect(getLmuExecutablePathValidationError('')).toBe(
        'LMU executable path is required.',
      );
    });

    it('requires Le Mans Ultimate executable filename', () => {
      expect(
        getLmuExecutablePathValidationError(
          'C:\\Games\\Le Mans Ultimate\\LMU.exe',
        ),
      ).toBe('LMU executable path must point to "Le Mans Ultimate.exe".');
    });

    it('requires Le Mans Ultimate folder segment', () => {
      expect(
        getLmuExecutablePathValidationError(
          'C:\\Games\\Other\\Le Mans Ultimate.exe',
        ),
      ).toBe(
        'LMU executable path must include the "Le Mans Ultimate" installation folder.',
      );
    });

    it('accepts valid path with mixed separators and casing', () => {
      expect(
        getLmuExecutablePathValidationError(
          'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
        ),
      ).toBeNull();
    });
  });

  describe('getLmuReplayDirectoryPathValidationError', () => {
    it('requires a value', () => {
      expect(getLmuReplayDirectoryPathValidationError('')).toBe(
        'LMU replay directory path is required.',
      );
    });

    it('requires Le Mans Ultimate folder segment', () => {
      expect(
        getLmuReplayDirectoryPathValidationError(
          'C:\\Games\\Other\\UserData\\Replays',
        ),
      ).toBe('Replay directory must include the "Le Mans Ultimate" folder.');
    });

    it('requires UserData\\Replays trailing segment', () => {
      expect(
        getLmuReplayDirectoryPathValidationError(
          'C:\\Games\\Le Mans Ultimate\\UserData\\Logs',
        ),
      ).toBe('Replay directory must include "UserData\\Replays".');
    });

    it('accepts valid replay directory path', () => {
      expect(
        getLmuReplayDirectoryPathValidationError(
          'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays',
        ),
      ).toBeNull();
    });
  });
});
