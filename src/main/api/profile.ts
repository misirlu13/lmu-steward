/**
 * GET
 * /rest/profile/profileInfo/getProfileInfo
 * Gets the users profile information
 *
 * RESPONSE
 * {"language":"english","name":"Bradley Drake","nationality":"US","nick":"Bradley Drake","steamID":"76561198849082115"}
 */

import { CONSTANTS } from '@constants';

interface LMUProfileInfo {
	language: string;
	name: string;
	nationality: string;
	nick: string;
	steamID: string;
}

interface ProfileCacheStore {
	profileInfo: LMUProfileInfo | null;
	hasFetchedProfileInfo: boolean;
	lastFetchedAt: number | null;
}

const toErrorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : 'Unable to retrieve LMU profile info.';

let store: {
	get: (key: string) => unknown;
	set: (key: string, value: unknown) => void;
} | null = null;
let storeInitPromise: Promise<void> | null = null;

const ensureStore = async (): Promise<void> => {
	if (store) {
		return;
	}

	if (!storeInitPromise) {
		storeInitPromise = (async () => {
			const Store = (await import('electron-store')).default;
			store = new Store<ProfileCacheStore>({
				name: 'lmu-steward-profile-cache',
				defaults: {
					profileInfo: null,
					hasFetchedProfileInfo: false,
					lastFetchedAt: null,
				},
			});
		})();
	}

	await storeInitPromise;
};

const normalizeProfileInfo = (raw: unknown): LMUProfileInfo => {
	const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

	return {
		language: String(source.language ?? ''),
		name: String(source.name ?? ''),
		nationality: String(source.nationality ?? '').toUpperCase(),
		nick: String(source.nick ?? ''),
		steamID: String(source.steamID ?? ''),
	};
};

const getCachedProfileInfo = async (): Promise<ProfileCacheStore> => {
	await ensureStore();
	return {
		profileInfo: (store?.get('profileInfo') as LMUProfileInfo | null) ?? null,
		hasFetchedProfileInfo: Boolean(store?.get('hasFetchedProfileInfo')),
		lastFetchedAt: (store?.get('lastFetchedAt') as number | null) ?? null,
	};
};

export const getProfileInfo = async (event: Electron.IpcMainEvent) => {
	const cached = await getCachedProfileInfo();

	try {
		const response = await fetch(
			`${CONSTANTS.LMU_API_BASE_URL}/rest/profile/profileInfo/getProfileInfo`,
		);

		if (!response.ok) {
			throw new Error(`API responded with status ${response.status}`);
		}

		const rawData = await response.json();
		const profileInfo = normalizeProfileInfo(rawData);
		const fetchedAt = Date.now();

		store?.set('profileInfo', profileInfo);
		store?.set('hasFetchedProfileInfo', true);
		store?.set('lastFetchedAt', fetchedAt);

		event.reply(CONSTANTS.API.GET_PROFILE_INFO, {
			status: 'success',
			data: {
				profileInfo,
				hasFetchedProfileInfo: true,
				lastFetchedAt: fetchedAt,
				source: 'live',
			},
		});
	} catch (error: unknown) {
		if (cached.hasFetchedProfileInfo && cached.profileInfo) {
			event.reply(CONSTANTS.API.GET_PROFILE_INFO, {
				status: 'success',
				data: {
					profileInfo: cached.profileInfo,
					hasFetchedProfileInfo: true,
					lastFetchedAt: cached.lastFetchedAt,
					source: 'cache',
				},
			});
			return;
		}

		event.reply(CONSTANTS.API.GET_PROFILE_INFO, {
			status: 'error',
			message: toErrorMessage(error),
			data: {
				hasFetchedProfileInfo: false,
			},
		});
	}
};
