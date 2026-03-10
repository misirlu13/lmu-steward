import { CONSTANTS } from "@constants";

/**
 * POST
 * Sets the camera angle of the replay
 * /rest/replay/CameraController/setCamera
 *
 * BODY
 *
 *  {"cameraGroup": "Driving", "direction": 0}
 *  {"cameraGroup": "Driving", "direction": 1}
 *  {"cameraGroup": "Trackside", "direction": 0}
 *  {"cameraGroup": "Trackside", "direction": 1}
 *  {"cameraGroup": "Onboard", "direction": 0}
 *  {"cameraGroup": "Onboard", "direction": 1}
 */

interface CameraAngleRequestBody {
  cameraGroup: 'Driving' | 'Trackside' | 'Onboard';
  direction: 0 | 1;
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? 'Unknown error');
};

export type { CameraAngleRequestBody };

export const postSetCameraAngle = async (
  event: Electron.IpcMainEvent,
  requestBody: CameraAngleRequestBody,
) => {
  try {
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/replay/CameraController/setCamera`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
    );

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    event.reply(CONSTANTS.API.POST_CAMERA_ANGLE, {
      status: 'success',
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_CAMERA_ANGLE, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
}


/**
 * GET
 * Returns the car that is currently being focused
 * /rest/watch/focus
 */

export const getFocusedCar = async (event: Electron.IpcMainEvent) => {
  try {
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/focus`,
    );

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    const data = await response.json();

    event.reply(CONSTANTS.API.GET_FOCUSED_CAR, {
      status: 'success',
      data,
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_FOCUSED_CAR, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
}

/**
 * PUT
 * Sets the camera to a new car
 * /rest/watch/focus/<slot-id>
 *
 * Body
 * Unsure...existing code just shows the slot id as a string in the body
 */

export const putFocusCar = async (
  event: Electron.IpcMainEvent,
  slotId: string,
) => {
  try {
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/focus/${slotId}`,
      {
        method: 'PUT',
      },
    );

    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }

    event.reply(CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR, {
      status: 'success',
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
}
