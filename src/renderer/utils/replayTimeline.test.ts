import {
	buildReplayTimelineEvents,
	buildIncidentForceSummary,
	buildPenaltyDescription,
	buildTrackLimitDescription,
	extractIncidentDescription,
	extractNameAndCarNumberFromIncident,
	extractSecondaryIncidentDriver,
	getIncidentLapFromDriverLaps,
} from './replayTimeline';

describe('replayTimeline helpers', () => {
	it('extracts primary incident driver name and car number', () => {
		expect(
			extractNameAndCarNumberFromIncident('Driver One(12) reported contact (123.4)'),
		).toEqual({ name: 'Driver One', carNumber: '12' });
	});

	it('extracts secondary incident driver from incident text', () => {
		expect(
			extractSecondaryIncidentDriver('Driver One(12) with Driver Two(99)'),
		).toEqual({ name: 'Driver Two', carNumber: '99' });
	});

	it('builds incident description from contact target segment', () => {
		expect(extractIncidentDescription('Driver One(12) with Driver Two(99)')).toBe(
			'Contact with Driver Two(99)',
		);
		expect(extractIncidentDescription('No target')).toBeUndefined();
	});

	it('builds force summary for valid impact force payloads', () => {
		expect(buildIncidentForceSummary('reported contact (145.2)')).toBe(
			'Impact Force: 145.20 (Low)',
		);
		expect(buildIncidentForceSummary('reported contact (150)')).toBe(
			'Impact Force: 150.00 (Medium)',
		);
		expect(buildIncidentForceSummary('invalid')).toBeUndefined();
	});

	it('builds penalty description using available fields', () => {
		expect(
			buildPenaltyDescription({ Penalty: 'Drive Through', Reason: 'Speeding in pit' }),
		).toBe('Drive Through • Speeding in pit');
		expect(buildPenaltyDescription({ Penalty: 'Stop and Go' })).toBe('Stop and Go');
		expect(buildPenaltyDescription({ Reason: 'Unsafe release' })).toBe('Unsafe release');
		expect(buildPenaltyDescription({})).toBeUndefined();
	});

	it('builds track limit description from available parts', () => {
		expect(
			buildTrackLimitDescription({
				_: 'Warning',
				WarningPoints: '1',
				CurrentPoints: '3',
			}),
		).toBe('Outcome: Warning • Warning Points: 1 • Current Points: 3');
		expect(buildTrackLimitDescription({})).toBeUndefined();
	});

	it('finds incident lap based on earliest lap ET that contains incident ET', () => {
		const driver = {
			Lap: [
				{ num: 3, et: 240 },
				{ num: 1, et: 80 },
				{ num: 2, et: 160 },
			],
		};

		expect(getIncidentLapFromDriverLaps(driver, 75)).toBe(1);
		expect(getIncidentLapFromDriverLaps(driver, 120)).toBe(2);
		expect(getIncidentLapFromDriverLaps(driver, 245)).toBe(3);
	});

	it('returns null for invalid driver or incident ET payloads', () => {
		expect(getIncidentLapFromDriverLaps(null, 10)).toBeNull();
		expect(getIncidentLapFromDriverLaps({ Lap: [] }, Number.NaN)).toBeNull();
	});

	it('builds replay timeline events with sorting, normalization, and driver mapping', () => {
		const events = buildReplayTimelineEvents({
			currentSessionLogData: {
				Driver: [
					{
						Name: 'Driver One',
						CarNumber: '12',
						CarClass: 'LMGT3',
						ID: '101',
						isPlayer: '1',
						Lap: [
							{ num: 1, et: 80 },
							{ num: 2, et: 160 },
						],
					},
					{
						Name: 'Driver Two',
						CarNumber: '99',
						CarClass: 'LMP2',
						ID: '202',
						isPlayer: '0',
						Lap: [
							{ num: 1, et: 70 },
							{ num: 2, et: 140 },
						],
					},
				],
				Stream: {
					Incident: [
						{
							et: 130,
							_: 'Driver One(12) with Driver Two(99) reported contact (145.2)',
						},
						{ et: 'invalid', _: 'Bad Payload' },
					],
					TrackLimits: [
						{
							et: 90,
							Driver: 'Driver Two',
							ID: '202',
							_: 'Warning',
							WarningPoints: '1',
							CurrentPoints: '2',
						},
					],
					Penalty: [
						{
							et: 200,
							Driver: 'Driver One',
							ID: '101',
							Penalty: 'Drive Through',
							Reason: 'Pit speed',
						},
					],
				},
			},
			standingsEntries: [
				{ driverName: 'Driver One', carNumber: '12', slotID: '7' },
				{ driverName: 'Driver Two', carNumber: '99', SlotID: '9' },
			],
			replayTimeBaselineSeconds: 120,
			shouldNormalizeReplayTimeForView: true,
			isPartialReplayDataDetected: true,
		});

		expect(events).toHaveLength(3);
		expect(events.map((event) => event.type)).toEqual([
			'track-limit',
			'collision',
			'penalty',
		]);

		expect(events[0]).toMatchObject({
			timestampLabel: '00:00:00',
			timestampEstimated: true,
			jumpToSeconds: 85,
			heatmapSeverity: 'minor',
			description: 'Outcome: Warning • Warning Points: 1 • Current Points: 2',
		});

		expect(events[1]).toMatchObject({
			timestampLabel: '00:00:10',
			timestampEstimated: true,
			lapLabel: 'Lap 2',
			jumpToSeconds: 125,
			heatmapSeverity: 'serious',
			distanceMeters: 145.2,
		});
		expect(events[1].description).toContain('Impact Force: 145.20 (Low)');
		expect(events[1].drivers).toEqual([
			{
				displayName: 'Driver One',
				carNumber: '12',
				carClass: 'GT3',
				slotId: '7',
				driverSid: '101',
				isAiDriver: false,
				hasLapData: true,
			},
			{
				displayName: 'Driver Two',
				carNumber: '99',
				carClass: 'P2',
				slotId: '9',
				driverSid: '202',
				isAiDriver: true,
				hasLapData: true,
			},
		]);

		expect(events[2]).toMatchObject({
			timestampLabel: '00:01:20',
			timestampEstimated: true,
			heatmapSeverity: 'critical',
			description: 'Drive Through • Pit speed',
		});
	});

	it('returns empty timeline when session stream is missing', () => {
		expect(
			buildReplayTimelineEvents({
				currentSessionLogData: {},
				standingsEntries: [],
				replayTimeBaselineSeconds: null,
				shouldNormalizeReplayTimeForView: false,
				isPartialReplayDataDetected: false,
			}),
		).toEqual([]);
	});

	it('clamps jump-to time to zero for early events', () => {
		const [event] = buildReplayTimelineEvents({
			currentSessionLogData: {
				Driver: [],
				Stream: {
					Incident: [{ et: 3, _: 'Unknown(0)' }],
				},
			},
			standingsEntries: [],
			replayTimeBaselineSeconds: null,
			shouldNormalizeReplayTimeForView: false,
			isPartialReplayDataDetected: false,
		});

		expect(event.jumpToSeconds).toBe(0);
	});
});
