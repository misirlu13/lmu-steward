import { toArray as toArrayShared } from '../../utils/collections';

export const toArray = toArrayShared;

export const normalizeDriverName = (value: string): string =>
	value.replace(/#\d+$/, '').trim().toLowerCase();

export const sanitizeIncidentDriverName = (value: string): string =>
	value.replace(/^another\s+vehicle\s+/i, '').trim();

interface IncidentFocusDriver {
	displayName?: string;
	slotId?: string;
	driverSid?: string;
}

interface SelectedFocusDriver {
	driverName?: string;
	driverId?: string;
	driverSid?: string;
	slotId?: string;
}

interface DriverLapLike {
	num?: number | string;
	et?: number | string;
}

interface ReplayDriverLike {
	Lap?: DriverLapLike | DriverLapLike[];
}

const normalizeIdentityValue = (value: string | null | undefined): string =>
	String(value ?? '').trim();

export const resolveIncidentFocusTarget = (
	incidentDrivers: IncidentFocusDriver[],
	selectedDriver: SelectedFocusDriver,
): string | undefined => {
	const selectedName = normalizeDriverName(String(selectedDriver.driverName ?? ''));
	const selectedSlotId = normalizeIdentityValue(selectedDriver.slotId);
	if (selectedSlotId) {
		return selectedSlotId;
	}

	const selectedDriverSid = normalizeIdentityValue(selectedDriver.driverSid);
	const selectedDriverId = normalizeIdentityValue(selectedDriver.driverId);

	const selectedSidCandidates = new Set(
		[selectedDriverSid, selectedDriverId].filter((value) => Boolean(value)),
	);

	const matchedDriver = incidentDrivers.find((entry) => {
		const entrySlotId = normalizeIdentityValue(entry.slotId);
		if (selectedSlotId && entrySlotId && entrySlotId === selectedSlotId) {
			return true;
		}

		const entryDriverSid = normalizeIdentityValue(entry.driverSid);
		if (entryDriverSid && selectedSidCandidates.has(entryDriverSid)) {
			return true;
		}

		if (!selectedName) {
			return false;
		}

		const entryName = normalizeDriverName(String(entry.displayName ?? ''));
		return entryName === selectedName;
	});

	const fallbackDriver = incidentDrivers.find((entry) => {
		return Boolean(normalizeIdentityValue(entry.slotId) || normalizeIdentityValue(entry.driverSid));
	});

	const targetDriver = matchedDriver ?? fallbackDriver;
	const focusSlotId = normalizeIdentityValue(targetDriver?.slotId);
	if (focusSlotId) {
		return focusSlotId;
	}

	const focusDriverSid = normalizeIdentityValue(targetDriver?.driverSid);
	if (focusDriverSid) {
		return focusDriverSid;
	}

	return undefined;
};

export const formatLapTime = (lapTimeSeconds: number | null | undefined): string => {
	if (!Number.isFinite(lapTimeSeconds) || !lapTimeSeconds || lapTimeSeconds <= 0) {
		return '--:--.---';
	}

	const totalMs = Math.round(lapTimeSeconds * 1000);
	const minutes = Math.floor(totalMs / 60000);
	const seconds = Math.floor((totalMs % 60000) / 1000);
	const milliseconds = totalMs % 1000;

	return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
};

export const formatDeltaLabel = (delta: number | null): string => {
	if (delta === null || !Number.isFinite(delta)) {
		return '--';
	}

	return `${delta >= 0 ? '+' : '-'}${Math.abs(delta).toFixed(3)}`;
};

export const formatDuration = (seconds: number | null | undefined): string => {
	if (!Number.isFinite(seconds) || !seconds || seconds < 0) {
		return '00:00:00';
	}

	const totalSeconds = Math.floor(seconds);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const secs = totalSeconds % 60;

	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const extractDriverSid = (value: string): string | undefined => {
	const match = value.match(/#(\d+)$/);
	return match?.[1];
};

export const getLapFromDriverEt = (
	driver: ReplayDriverLike | null | undefined,
	eventEtSeconds: number,
): number | null => {
	if (!driver || !Number.isFinite(eventEtSeconds)) {
		return null;
	}

	const laps = toArray(driver?.Lap)
		.map((lap, index: number) => ({
			lapNum: Number(lap?.num ?? index + 1),
			et: Number(lap?.et),
		}))
		.filter((entry) => Number.isFinite(entry.lapNum) && Number.isFinite(entry.et))
		.sort((left, right) => left.et - right.et);

	if (!laps.length) {
		return null;
	}

	for (let index = 0; index < laps.length; index += 1) {
		if (eventEtSeconds <= laps[index].et) {
			return laps[index].lapNum;
		}
	}

	return laps[laps.length - 1].lapNum;
};

export const extractNameAndCarNumberFromIncident = (
	value: string,
): { name: string; carNumber?: string } | null => {
	const match = value.match(/^([^()]+)\(([^)]+)\)/);
	if (!match) {
		return null;
	}

	return {
		name: sanitizeIncidentDriverName(match[1]),
		carNumber: match[2].trim(),
	};
};

export const extractSecondaryIncidentDriver = (
	value: string,
): { name: string; carNumber?: string } | null => {
	const match = value.match(/with\s+(?:another\s+vehicle\s+)?([^()]+)\(([^)]+)\)/i);
	if (!match) {
		return null;
	}

	return {
		name: sanitizeIncidentDriverName(match[1]),
		carNumber: match[2].trim(),
	};
};

export const extractIncidentImpactForce = (value: string): number | undefined => {
	const normalized = String(value ?? '').trim();
	if (!normalized) {
		return undefined;
	}

	const match = normalized.match(/reported\s+contact\s*\((\d+(?:\.\d+)?)\)/i);
	if (!match) {
		return undefined;
	}

	const parsed = Number(match[1]);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return undefined;
	}

	return parsed;
};

export const getIncidentForceLevelLabel = (impactForce: number): string => {
	if (!Number.isFinite(impactForce) || impactForce < 0) {
		return 'Unknown';
	}

	if (impactForce < 150) {
		return 'Low';
	}

	if (impactForce < 400) {
		return 'Medium';
	}

	if (impactForce < 1200) {
		return 'High';
	}

	return 'Severe';
};
