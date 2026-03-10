import { resolveIncidentFocusTarget } from './driverAnalysisUtils';

describe('resolveIncidentFocusTarget', () => {
	it('prefers selected driver when selected driver is second in incident list', () => {
		const target = resolveIncidentFocusTarget(
			[
				{
					displayName: 'Lebron James#7263',
					driverSid: '5',
					slotId: '42',
				},
				{
					displayName: 'Bradley Drake',
					driverSid: '18',
					slotId: '99',
				},
			],
			{
				driverName: 'Bradley Drake',
				driverId: '18',
			},
		);

		expect(target).toBe('99');
	});

	it('matches selected driver by normalized name when IDs are unavailable', () => {
		const target = resolveIncidentFocusTarget(
			[
				{
					displayName: 'Lebron James#7263',
					driverSid: '5',
				},
				{
					displayName: 'Bradley Drake',
					driverSid: '18',
				},
			],
			{
				driverName: 'Lebron James',
			},
		);

		expect(target).toBe('5');
	});

	it('uses selected driver slotId even when selected driver is not listed in incident participants', () => {
		const target = resolveIncidentFocusTarget(
			[
				{
					displayName: 'Driver A',
					driverSid: '1',
					slotId: '11',
				},
				{
					displayName: 'Driver B',
					driverSid: '2',
					slotId: '22',
				},
			],
			{
				driverName: 'Driver Z',
				slotId: '77',
			},
		);

		expect(target).toBe('77');
	});

	it('falls back to first available focusable driver if selected driver is not present', () => {
		const target = resolveIncidentFocusTarget(
			[
				{
					displayName: 'Driver A',
					driverSid: '1',
				},
				{
					displayName: 'Driver B',
					driverSid: '2',
				},
			],
			{
				driverName: 'Driver Z',
			},
		);

		expect(target).toBe('1');
	});
});
