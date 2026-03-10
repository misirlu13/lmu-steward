import { CONSTANTS } from '@constants';
import { resolveIncidentFocusTarget } from '../components/DriverAnalysis/driverAnalysisUtils';
import { sendMessage } from './postMessage';

interface ReplayIncidentDriverFocusInfo {
	displayName?: string;
	slotId?: string;
	driverSid?: string;
}

interface ReplayIncidentJumpPayload {
	drivers: ReplayIncidentDriverFocusInfo[];
	jumpToSeconds?: number;
}

interface SelectedDriverFocusIdentity {
	driverName?: string;
	driverId?: string;
	driverSid?: string;
	slotId?: string;
}

export const jumpToIncidentInReplay = (
	incident: ReplayIncidentJumpPayload,
	selectedDriver: SelectedDriverFocusIdentity = {},
) => {
	const focusTarget = resolveIncidentFocusTarget(incident.drivers, selectedDriver);
	const jumpTimeSeconds = Math.max(Number(incident.jumpToSeconds ?? 0), 0);

	if (focusTarget) {
		sendMessage(CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR, focusTarget);
	}

	sendMessage(CONSTANTS.API.PUT_REPLAY_COMMAND_TIME, String(jumpTimeSeconds));
};
