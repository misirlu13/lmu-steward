import { CONSTANTS } from '@constants';
import path from 'path';

export type UserSettings = Record<string, unknown>;

const toErrorMessage = (error: unknown, fallback: string): string => {
	if (error instanceof Error && error.message) {
		return error.message;
	}

	const normalized = String(error ?? '').trim();
	return normalized || fallback;
};

const LMU_EXECUTABLE_FILE_NAME = 'le mans ultimate.exe';
const LMU_FOLDER_SEGMENT = 'le mans ultimate';
const LMU_REPLAYS_TRAILING_SEGMENT = 'userdata\\replays';

const normalizeWindowsPath = (value: string): string =>
	String(value ?? '').trim().replace(/\//g, '\\').toLowerCase();

export const getLmuExecutablePathValidationError = (
	candidatePath: string,
): string | null => {
	const normalizedPath = normalizeWindowsPath(candidatePath);
	if (!normalizedPath) {
		return 'LMU executable path is required.';
	}

	if (path.basename(normalizedPath) !== LMU_EXECUTABLE_FILE_NAME) {
		return 'LMU executable path must point to "Le Mans Ultimate.exe".';
	}

	if (!normalizedPath.includes(`\\${LMU_FOLDER_SEGMENT}\\`)) {
		return 'LMU executable path must include the "Le Mans Ultimate" installation folder.';
	}

	return null;
};

export const getLmuReplayDirectoryPathValidationError = (
	candidatePath: string,
): string | null => {
	const normalizedPath = normalizeWindowsPath(candidatePath);
	if (!normalizedPath) {
		return 'LMU replay directory path is required.';
	}

	if (!normalizedPath.includes(`\\${LMU_FOLDER_SEGMENT}\\`)) {
		return 'Replay directory must include the "Le Mans Ultimate" folder.';
	}

	if (!normalizedPath.includes(LMU_REPLAYS_TRAILING_SEGMENT)) {
		return 'Replay directory must include "UserData\\Replays".';
	}

	return null;
};

const validateUserSettingsUpdates = (updates: UserSettings): string | null => {
	if (typeof updates?.lmuExecutablePath === 'string') {
		const executablePathValidationError = getLmuExecutablePathValidationError(
			updates.lmuExecutablePath,
		);

		if (executablePathValidationError) {
			return executablePathValidationError;
		}
	}

	if (typeof updates?.lmuReplayDirectoryPath === 'string') {
		const replayDirectoryValidationError =
			getLmuReplayDirectoryPathValidationError(
				updates.lmuReplayDirectoryPath,
			);

		if (replayDirectoryValidationError) {
			return replayDirectoryValidationError;
		}
	}

	return null;
};

let store: {
	get: (key: string) => unknown;
	set: (key: string, value: unknown) => void;
	clear: () => void;
} | null = null;
let storeInitPromise: Promise<void> | null = null;

const ensureStore = async (): Promise<void> => {
	if (store) {
		return;
	}

	if (!storeInitPromise) {
		storeInitPromise = (async () => {
			const Store = (await import('electron-store')).default;
			store = new Store<{ userSettings: UserSettings }>({
				name: 'lmu-steward-store',
				defaults: {
					userSettings: {
						lmuExecutablePath: CONSTANTS.LMU_DEFAULT_EXECUTABLE_PATH,
						lmuReplayDirectoryPath: CONSTANTS.LMU_DEFAULT_REPLAY_DIRECTORY_PATH,
						firstRun: true,
						automaticSyncEnabled: true,
						quickViewEnabled: false,
						syncOnAppLaunch: true,
						syncOnIntervalMinutes: 5,
						lastReplaySyncAt: null,
						closeLmuWhenStewardExits: false,
						closeLmuOnExitAlwaysPerformAction: false,
					},
				},
			});
		})();
	}

	await storeInitPromise;
};

export const readUserSettings = async (): Promise<UserSettings> => {
	await ensureStore();
	return (store?.get('userSettings') as UserSettings) ?? {};
};

export const writeUserSettings = async (
	updates: UserSettings,
): Promise<UserSettings> => {
	await ensureStore();
	const existing = (store?.get('userSettings') as UserSettings) ?? {};
	const nextSettings = {
		...existing,
		...(updates ?? {}),
	};

	store?.set('userSettings', nextSettings);
	return nextSettings;
};

export const getUserSettings = async (event: Electron.IpcMainEvent) => {
	try {
		const data = await readUserSettings();

		event.reply(CONSTANTS.API.GET_USER_SETTINGS, {
			status: 'success',
			data,
		});
	} catch (error: unknown) {
		event.reply(CONSTANTS.API.GET_USER_SETTINGS, {
			status: 'error',
			message: toErrorMessage(error, 'Unable to read user settings'),
		});
	}
};

export const postUserSettings = async (
	event: Electron.IpcMainEvent,
	updates: UserSettings,
) => {
	try {
		const validationError = validateUserSettingsUpdates(updates ?? {});
		if (validationError) {
			event.reply(CONSTANTS.API.POST_USER_SETTINGS, {
				status: 'error',
				message: validationError,
			});
			return;
		}

		const nextSettings = await writeUserSettings(updates);

		event.reply(CONSTANTS.API.POST_USER_SETTINGS, {
			status: 'success',
			data: nextSettings,
		});
	} catch (error: unknown) {
		event.reply(CONSTANTS.API.POST_USER_SETTINGS, {
			status: 'error',
			message: toErrorMessage(error, 'Unable to update user settings'),
		});
	}
};

export const postClearLocalStorage = async (event: Electron.IpcMainEvent) => {
	try {
		await ensureStore();
		store?.clear();

		const data = await readUserSettings();

		event.reply(CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE, {
			status: 'success',
			data,
		});
	} catch (error: unknown) {
		event.reply(CONSTANTS.API.POST_CLEAR_LOCAL_STORAGE, {
			status: 'error',
			message: toErrorMessage(error, 'Unable to clear local storage'),
		});
	}
};
