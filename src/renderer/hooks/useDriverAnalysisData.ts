import { useMemo } from 'react';
import { CONSTANTS } from '@constants';
import { LMUReplay } from '@types';
import { ReplayIncidentEvent, ReplayIncidentType } from '../components/Replay/ReplayMasterIncidentTimeline';
import { ReplayDriverStanding } from '../components/Replay/ReplayDriverStandings';
import { DriverLapBreakdownRow } from '../components/DriverAnalysis/LapByLapPerformanceBreakdown';
import { getDriverIncidentScore } from '../utils/incidentScore';
import {
	extractDriverSid,
	extractNameAndCarNumberFromIncident,
	extractSecondaryIncidentDriver,
	formatDeltaLabel,
	formatDuration,
	formatLapTime,
	extractIncidentImpactForce,
	getIncidentForceLevelLabel,
	getLapFromDriverEt,
	normalizeDriverName,
	sanitizeIncidentDriverName,
	toArray,
} from '../components/DriverAnalysis/driverAnalysisUtils';
import {
	buildDriverAnalysisIncidentForceSummary,
	buildDriverAnalysisPenaltyDescription,
	buildDriverAnalysisTrackLimitDescription,
	extractDriverAnalysisIncidentDescription,
} from './useDriverAnalysisDataUtils';

interface UseDriverAnalysisDataArgs {
	currentReplay: LMUReplay | null;
	driver: ReplayDriverStanding;
	routeIncidents?: ReplayIncidentEvent[];
	isPartialReplayDataDetected?: boolean;
	selectedIncidentTypes: ReplayIncidentType[];
	activeIncidentId: string | null;
}

export const useDriverAnalysisData = ({
	currentReplay,
	driver,
	routeIncidents,
	isPartialReplayDataDetected = false,
	selectedIncidentTypes,
	activeIncidentId,
}: UseDriverAnalysisDataArgs) => {

	const currentSessionLogData = useMemo(() => {
		const sessionKey =
			currentReplay?.metadata?.session &&
			CONSTANTS.SESSION_TYPE_MAPPINGS[
				currentReplay.metadata.session as keyof typeof CONSTANTS.SESSION_TYPE_MAPPINGS
			];

		if (!sessionKey || !currentReplay?.logData) {
			return null;
		}

		return currentReplay.logData[sessionKey] ?? null;
	}, [currentReplay]);

	const selectedSessionDriver = useMemo(() => {
		const sessionDrivers = toArray(currentSessionLogData?.Driver);
		if (!sessionDrivers.length) {
			return null;
		}

		const normalizedSelectedName = normalizeDriverName(driver.driverName);

		const byName = sessionDrivers.find(
			(entry) => normalizeDriverName(String(entry?.Name ?? '')) === normalizedSelectedName,
		);
		if (byName) {
			return byName;
		}

		return (
			sessionDrivers.find(
				(entry) =>
					Number(entry?.ClassPosition) === Number(driver.position) ||
					Number(entry?.Position) === Number(driver.position),
			) || null
		);
	}, [
		currentSessionLogData,
		driver.driverId,
		driver.driverName,
		driver.position,
	]);

	const selectedDriverIdentity = useMemo(() => {
		return {
			normalizedName: normalizeDriverName(String(selectedSessionDriver?.Name ?? driver.driverName ?? '')),
			driverSid: String(selectedSessionDriver?.ID ?? driver.driverSid ?? '').trim(),
		};
	}, [driver.driverName, driver.driverSid, selectedSessionDriver]);

	const matchesSelectedIncidentDriver = (incidentDriver: {
		displayName?: string;
	}) => {
		if (!incidentDriver) {
			return false;
		}

		const normalizedName = normalizeDriverName(String(incidentDriver.displayName ?? ''));
		return normalizedName === selectedDriverIdentity.normalizedName;
	};

	const selectedDriverIsAi = useMemo(
		() => String(selectedSessionDriver?.isPlayer ?? selectedSessionDriver?.IsPlayer ?? '').trim() === '0',
		[selectedSessionDriver],
	);

	const incidents = useMemo<ReplayIncidentEvent[]>(() => {
		if (!currentSessionLogData?.Stream || !selectedSessionDriver) {
			const fallback = routeIncidents ?? [];
			return fallback
				.filter((incident) => incident.drivers.some((entry) => matchesSelectedIncidentDriver(entry)));
		}

		const sessionDrivers = toArray(currentSessionLogData?.Driver);
		const driverByName = new Map<string, any>();
		const driverByCarNumber = new Map<string, any>();
		const driverById = new Map<string, any>();

		sessionDrivers.forEach((entry) => {
			const name = String(entry?.Name ?? '').trim();
			if (name) {
				driverByName.set(normalizeDriverName(name), entry);
			}

			const carNumber = String(entry?.CarNumber ?? '').trim();
			if (carNumber) {
				driverByCarNumber.set(carNumber, entry);
			}

			const id = String(entry?.ID ?? '').trim();
			if (id) {
				driverById.set(id, entry);
			}
		});

		const targetName = normalizeDriverName(String(selectedSessionDriver?.Name ?? driver.driverName ?? ''));

		const isTargetDriver = (
			nameValue?: string | null,
			_carNumberValue?: string | null,
			_idValue?: string | null,
		) => {
			if (nameValue && targetName) {
				return normalizeDriverName(String(nameValue)) === targetName;
			}

			return false;
		};

		const buildTimelineDriver = (
			rawName: string,
			fallbackCarNumber?: string,
			fallbackSid?: string,
		) => {
			const cleanedName = sanitizeIncidentDriverName(rawName);
			const normalized = normalizeDriverName(cleanedName);
			const matchedDriver =
				driverByName.get(normalized) ||
				(fallbackCarNumber ? driverByCarNumber.get(String(fallbackCarNumber).trim()) : undefined) ||
				(fallbackSid ? driverById.get(String(fallbackSid).trim()) : undefined);
			const parsedSid = extractDriverSid(cleanedName);

			return {
				displayName: cleanedName.replace(/#\d+$/, '').trim() || 'Unknown Driver',
				carNumber: String(matchedDriver?.CarNumber ?? fallbackCarNumber ?? ''),
				carClass: String(matchedDriver?.CarClass ?? driver.carClass ?? 'Unknown'),
				slotId: String(matchedDriver?.SlotID ?? matchedDriver?.slotID ?? '').trim() || undefined,
				driverSid: String(parsedSid ?? fallbackSid ?? matchedDriver?.ID ?? '').trim() || undefined,
				isAiDriver: String(matchedDriver?.isPlayer ?? matchedDriver?.IsPlayer ?? '').trim() === '0',
			};
		};

		const buildEvent = (
			type: ReplayIncidentEvent['type'],
			item: { et?: number | string },
			index: number,
			driversForEvent: ReplayIncidentEvent['drivers'],
			description?: string,
			primaryDriverRawName?: string,
		): ReplayIncidentEvent | null => {
			const etSeconds = Number(item?.et);
			if (!Number.isFinite(etSeconds)) {
				return null;
			}

			const matchedPrimaryDriver = primaryDriverRawName
				? driverByName.get(normalizeDriverName(primaryDriverRawName))
				: selectedSessionDriver;

			const computedLap = getLapFromDriverEt(matchedPrimaryDriver, etSeconds);
			const lapValue = computedLap !== null && Number.isFinite(computedLap)
				? Math.max(1, computedLap)
				: null;

			return {
				id: `${type}-${index}-${etSeconds}`,
				type,
				timestampLabel: formatDuration(etSeconds),
				timestampEstimated: isPartialReplayDataDetected,
				lapLabel: lapValue !== null ? `Lap ${lapValue}` : 'Lap --',
				drivers: driversForEvent,
				description,
				etSeconds,
				jumpToSeconds: Math.max(etSeconds - 5, 0),
			};
		};

		const trackLimitEvents = toArray(currentSessionLogData.Stream.TrackLimits)
			.map((item, index: number) => {
				const rawName = String(item?.Driver ?? '').trim();
				if (!isTargetDriver(rawName, null, item?.ID)) {
					return null;
				}

				const driversForEvent = [buildTimelineDriver(rawName, undefined, item?.ID)];
				return buildEvent(
					'track-limit',
					item,
					index,
					driversForEvent,
					buildDriverAnalysisTrackLimitDescription(item),
					rawName,
				);
			})
			.filter(
				(event: ReplayIncidentEvent | null): event is ReplayIncidentEvent =>
					event !== null,
			);

		const penaltyEvents = toArray(currentSessionLogData.Stream.Penalty)
			.map((item, index: number) => {
				const rawName = String(item?.Driver ?? '').trim();
				if (!isTargetDriver(rawName, null, item?.ID)) {
					return null;
				}

				const driversForEvent = [buildTimelineDriver(rawName, undefined, item?.ID)];
				return buildEvent(
					'penalty',
					item,
					index,
					driversForEvent,
					buildDriverAnalysisPenaltyDescription(item),
					rawName,
				);
			})
			.filter(
				(event: ReplayIncidentEvent | null): event is ReplayIncidentEvent =>
					event !== null,
			);

		const incidentEvents = toArray(currentSessionLogData.Stream.Incident)
			.map((item, index: number) => {
				const sourceText = String(item?._ ?? '').trim();
				const primary = extractNameAndCarNumberFromIncident(sourceText);
				const secondary = extractSecondaryIncidentDriver(sourceText);
				const forceSummary = buildDriverAnalysisIncidentForceSummary(sourceText);
				const baseDescription = extractDriverAnalysisIncidentDescription(sourceText);
				const description = [baseDescription, forceSummary]
					.filter((value): value is string => Boolean(value))
					.join(' • ') || undefined;

				const includesTarget =
					(primary && isTargetDriver(primary.name, primary.carNumber, null)) ||
					(secondary && isTargetDriver(secondary.name, secondary.carNumber, null));

				if (!includesTarget) {
					return null;
				}

				const driversForEvent = [
					primary
						? buildTimelineDriver(primary.name, primary.carNumber)
						: {
							displayName: sourceText || 'Unknown Driver',
							carNumber: '',
							carClass: 'Unknown',
						},
				];

				if (secondary) {
					driversForEvent.push(buildTimelineDriver(secondary.name, secondary.carNumber));
				}

				return buildEvent(
					'collision',
					item,
					index,
					driversForEvent,
					description,
					primary?.name,
				);
			})
			.filter(
				(event: ReplayIncidentEvent | null): event is ReplayIncidentEvent =>
					event !== null,
			);

		return [...trackLimitEvents, ...incidentEvents, ...penaltyEvents].sort(
			(left, right) => (left.etSeconds ?? 0) - (right.etSeconds ?? 0),
		);
	}, [
		currentSessionLogData,
		driver.carClass,
		isPartialReplayDataDetected,
		routeIncidents,
		selectedDriverIdentity.driverSid,
		selectedDriverIdentity.normalizedName,
		selectedSessionDriver,
	]);

	const filteredIncidents = useMemo(
		() => incidents.filter((entry) => selectedIncidentTypes.includes(entry.type)),
		[incidents, selectedIncidentTypes],
	);

	const activeIncident = useMemo(
		() => incidents.find((incident) => incident.id === activeIncidentId) ?? null,
		[activeIncidentId, incidents],
	);

	const isSelectedIncidentDriver = (incidentDriver: { displayName: string; carNumber: string; driverSid?: string }) => {
		return matchesSelectedIncidentDriver(incidentDriver);
	};

	const faultScopeEvents = useMemo(
		() => (activeIncident ? [activeIncident] : incidents),
		[activeIncident, incidents],
	);

	const faultIncidentSummary = useMemo(
		() => ({
			'track-limit': faultScopeEvents.filter((entry) => entry.type === 'track-limit').length,
			collision: faultScopeEvents.filter((entry) => entry.type === 'collision').length,
			penalty: faultScopeEvents.filter((entry) => entry.type === 'penalty').length,
		}),
		[faultScopeEvents],
	);

	const faultTotalIncidents = useMemo(
		() => faultIncidentSummary['track-limit'] + faultIncidentSummary.collision + faultIncidentSummary.penalty,
		[faultIncidentSummary],
	);

	const faultDominantType = useMemo(() => {
		const values: Array<{ type: ReplayIncidentType; count: number }> = [
			{ type: 'track-limit', count: faultIncidentSummary['track-limit'] },
			{ type: 'collision', count: faultIncidentSummary.collision },
			{ type: 'penalty', count: faultIncidentSummary.penalty },
		];

		return values.sort((left, right) => right.count - left.count)[0].type;
	}, [faultIncidentSummary]);

	const faultDominantPercent = useMemo(
		() =>
			faultTotalIncidents
				? (faultIncidentSummary[faultDominantType] / faultTotalIncidents) * 100
				: 0,
		[faultDominantType, faultIncidentSummary, faultTotalIncidents],
	);

	const faultCollisionStats = useMemo(() => {
		const collisionEvents = faultScopeEvents.filter((entry) => entry.type === 'collision');

		const subjectCount = collisionEvents.filter((entry) => isSelectedIncidentDriver(entry.drivers[0])).length;
		const secondaryCount = collisionEvents.filter(
			(entry) =>
				!isSelectedIncidentDriver(entry.drivers[0]) &&
				entry.drivers.slice(1).some((incidentDriver) => isSelectedIncidentDriver(incidentDriver)),
		).length;

		const total = subjectCount + secondaryCount;
		const subjectPct = total ? Math.round((subjectCount / total) * 100) : 0;
		const secondaryPct = total ? Math.round((secondaryCount / total) * 100) : 0;

		const counterpartyCounts = new Map<string, number>();
		collisionEvents.forEach((event) => {
			event.drivers
				.filter((incidentDriver) => !isSelectedIncidentDriver(incidentDriver))
				.forEach((counterparty) => {
					const key = `${counterparty.displayName}|${counterparty.carNumber}`;
					counterpartyCounts.set(key, (counterpartyCounts.get(key) || 0) + 1);
				});
		});

		const topCounterparty = [...counterpartyCounts.entries()]
			.sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;

		return {
			subjectCount,
			secondaryCount,
			subjectPct,
			secondaryPct,
			topCounterparty,
		};
	}, [faultScopeEvents]);

	const faultPenaltyReasons = useMemo(() => {
		const streamPenalties = toArray(currentSessionLogData?.Stream?.Penalty);
		if (!streamPenalties.length) {
			return [] as Array<{ reason: string; count: number }>;
		}

		const reasonCounts = new Map<string, number>();

		streamPenalties.forEach((entry) => {
			const nameMatch = normalizeDriverName(String(entry?.Driver ?? '')) === selectedDriverIdentity.normalizedName;
			const sidMatch = selectedDriverIdentity.driverSid && String(entry?.ID ?? '').trim() === selectedDriverIdentity.driverSid;

			if (!nameMatch && !sidMatch) {
				return;
			}

			const reason = String(entry?.Reason ?? entry?.Penalty ?? 'Unspecified').trim() || 'Unspecified';
			reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
		});

		return [...reasonCounts.entries()]
			.map(([reason, count]) => ({ reason, count }))
			.sort((left, right) => right.count - left.count);
	}, [currentSessionLogData, selectedDriverIdentity.driverSid, selectedDriverIdentity.normalizedName]);

	const faultRiskIndex = useMemo(() => {
		const lapsCompleted = Number(selectedSessionDriver?.Laps ?? toArray(selectedSessionDriver?.Lap).length ?? 0);
		const score = getDriverIncidentScore(
			{
				trackLimits: faultIncidentSummary['track-limit'],
				incidents: faultIncidentSummary.collision,
				penalties: faultIncidentSummary.penalty,
			},
			lapsCompleted,
		);

		return Math.max(0, Math.min(100, Math.round(score * 10)));
	}, [faultIncidentSummary, selectedSessionDriver]);

	const topCounterpartyText = useMemo(() => {
		if (!faultCollisionStats.topCounterparty) {
			return 'No collision counterparties detected in the current scope.';
		}

		const [name, carNumber] = faultCollisionStats.topCounterparty.split('|');
		const involvementCount = faultCollisionStats.subjectCount + faultCollisionStats.secondaryCount;

		return `Most frequent counterparty: ${name} (${carNumber ? `#${carNumber} • ` : ''}${involvementCount} collision involvements)`;
	}, [faultCollisionStats]);

	const topPenaltyReasonText = useMemo(
		() =>
			faultPenaltyReasons.length
				? `Top penalty reason: ${faultPenaltyReasons[0].reason} (${faultPenaltyReasons[0].count})`
				: 'No penalty reasons available for this driver in the current session.',
		[faultPenaltyReasons],
	);

	const lapBreakdownRows = useMemo<DriverLapBreakdownRow[]>(() => {
		if (!selectedSessionDriver) {
			return [];
		}

		const lapEntries = toArray(selectedSessionDriver?.Lap)
			.map((lap, index: number) => {
				const lapNumber = Number(lap?.num ?? index + 1);
				const lapTimeSeconds = Number(lap?._);
				const lapTime = Number.isFinite(lapTimeSeconds) && lapTimeSeconds > 0 ? lapTimeSeconds : null;
				const standing = Number(lap?.p);
				const et = Number(lap?.et);

				return {
					lapNumber,
					lapTime,
					standing: Number.isFinite(standing) && standing > 0 ? standing : null,
					et: Number.isFinite(et) ? et : null,
				};
			})
			.filter(
				(entry: { lapNumber: number }) =>
					Number.isFinite(entry.lapNumber) && entry.lapNumber > 0,
			)
			.sort(
				(
					left: { lapNumber: number },
					right: { lapNumber: number },
				) => left.lapNumber - right.lapNumber,
			);

		if (!lapEntries.length) {
			return [];
		}

		const bestLapSeconds = lapEntries
			.map((entry: { lapTime: number | null }) => entry.lapTime)
			.filter(
				(value: number | null): value is number =>
					value !== null && Number.isFinite(value) && value > 0,
			)
			.reduce<number | null>((best, value) => {
				if (best === null || value < best) {
					return value;
				}

				return best;
			}, null);

		const trackLimitLaps = new Set<number>();
		const incidentLaps = new Set<number>();
		const penaltiesByLap = new Map<number, string[]>();

		const targetName = normalizeDriverName(String(selectedSessionDriver?.Name ?? driver.driverName ?? ''));

		const isTargetDriver = (
			nameValue?: string | null,
			_carNumberValue?: string | null,
			_idValue?: string | null,
		) => {
			if (nameValue && targetName) {
				return normalizeDriverName(String(nameValue)) === targetName;
			}

			return false;
		};

		const stream = currentSessionLogData?.Stream;

		toArray(stream?.TrackLimits).forEach((entry) => {
			const isTarget = isTargetDriver(entry?.Driver, null, entry?.ID);
			if (!isTarget) {
				return;
			}

			const lap = Number(entry?.Lap);
			const resolvedLap = Number.isFinite(lap) && lap > 0 ? lap : getLapFromDriverEt(selectedSessionDriver, Number(entry?.et));
			if (resolvedLap) {
				trackLimitLaps.add(resolvedLap);
			}
		});

		toArray(stream?.Penalty).forEach((entry) => {
			const isTarget = isTargetDriver(entry?.Driver, null, entry?.ID);
			if (!isTarget) {
				return;
			}

			const lap = Number(entry?.Lap);
			const resolvedLap = Number.isFinite(lap) && lap > 0 ? lap : getLapFromDriverEt(selectedSessionDriver, Number(entry?.et));
			if (!resolvedLap) {
				return;
			}

			const label = String(entry?._ ?? 'Penalty').trim();
			const existing = penaltiesByLap.get(resolvedLap) || [];
			existing.push(label || 'Penalty');
			penaltiesByLap.set(resolvedLap, existing);
		});

		toArray(stream?.Incident).forEach((entry) => {
			const text = String(entry?._ ?? '');
			const primary = extractNameAndCarNumberFromIncident(text);
			const secondary = extractSecondaryIncidentDriver(text);

			const isTarget =
				(primary && isTargetDriver(primary.name, primary.carNumber, null)) ||
				(secondary && isTargetDriver(secondary.name, secondary.carNumber, null));

			if (!isTarget) {
				return;
			}

			const lap = Number(entry?.Lap);
			const resolvedLap = Number.isFinite(lap) && lap > 0 ? lap : getLapFromDriverEt(selectedSessionDriver, Number(entry?.et));
			if (resolvedLap) {
				incidentLaps.add(resolvedLap);
			}
		});

		return [...lapEntries].map((entry, index, entries) => {
			const deltaToBest =
				entry.lapTime !== null && bestLapSeconds !== null
					? entry.lapTime - bestLapSeconds
					: null;

			const isFastestLap =
				entry.lapTime !== null &&
				bestLapSeconds !== null &&
				entry.lapTime === bestLapSeconds;

			const previousLap = index > 0 ? entries[index - 1] : null;
			const previousLapTime = previousLap?.lapTime ?? null;
			const deltaToPrevious =
				entry.lapTime !== null && previousLapTime !== null
					? entry.lapTime - previousLapTime
					: null;

			const penalties = penaltiesByLap.get(entry.lapNumber) || [];
			const penaltyLabel = penalties.length
				? penalties.length === 1
					? penalties[0].toUpperCase()
					: `${penalties.length} PENALTIES`
				: null;

			return {
				lapNumber: entry.lapNumber,
				standingLabel: entry.standing ? `P${entry.standing}` : '--',
				lapTimeLabel: formatLapTime(entry.lapTime),
				deltaToBestLabel: isFastestLap ? '--' : formatDeltaLabel(deltaToBest),
				deltaToPreviousLabel: formatDeltaLabel(deltaToPrevious),
				isFastestLap,
				hasTrackLimit: trackLimitLaps.has(entry.lapNumber),
				hasIncident: incidentLaps.has(entry.lapNumber),
				penaltyLabel,
			};
		});
	}, [currentSessionLogData, driver.driverId, driver.driverName, selectedSessionDriver]);

	return {
		incidents,
		filteredIncidents,
		activeIncident,
		selectedDriverIsAi,
		faultIncidentSummary,
		faultRiskIndex,
		faultDominantType,
		faultTotalIncidents,
		faultDominantPercent,
		faultCollisionStats,
		topCounterpartyText,
		topPenaltyReasonText,
		lapBreakdownRows,
	};
};
