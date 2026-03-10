import { CONSTANTS } from "@constants";

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
};

/**
 * GET
 * Gets the current LMU API Status
 * /navigation/state
 *
 */

export const getApiStatus = async (event: Electron.IpcMainEvent) => {
  try {
    const response = await fetch(`${CONSTANTS.LMU_API_BASE_URL}/navigation/state`);
    if (!response.ok) {
      event.reply(CONSTANTS.API.GET_API_STATUS, { status: 'error', message: `API responded with status ${response.status}` });
      return;
    }
    const data = await response.json();
    event.reply(CONSTANTS.API.GET_API_STATUS, { status: 'success', data });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_API_STATUS, { status: 'error', message: toErrorMessage(error) });
  }
}
