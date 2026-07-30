/**
 * GET
 * /rest/profile/profileInfo/getProfileInfo
 * Gets the users profile information
 *
 * RESPONSE
 * {"language":"english","name":"Bradley Drake","nationality":"US","nick":"Bradley Drake","steamID":"76561198849082115"}
 */

import { CONSTANTS } from '@constants';
import { LMUProfileInfo, ProfileCacheStore } from '@types';
import {
  getProfilePersistentStore,
  readProfileCache,
} from '../storage/local-data-store';

const toErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : 'Unable to retrieve LMU profile info.';

const normalizeProfileInfo = (raw: unknown): LMUProfileInfo => {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;

  return {
    language: String(source.language ?? ''),
    name: String(source.name ?? ''),
    nationality: String(source.nationality ?? '').toUpperCase(),
    nick: String(source.nick ?? ''),
    steamID: String(source.steamID ?? ''),
  };
};

const getCachedProfileInfo = async (): Promise<ProfileCacheStore> => {
  return readProfileCache();
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
    const store = getProfilePersistentStore();

    store.set('profileInfo', profileInfo);
    store.set('hasFetchedProfileInfo', true);
    store.set('lastFetchedAt', fetchedAt);

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
