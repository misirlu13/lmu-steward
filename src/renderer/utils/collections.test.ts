import {
	countCollectionEntries,
	toArray,
	toObjectOrArrayEntries,
} from './collections';

describe('collections', () => {
	describe('toArray', () => {
		it('returns an empty array for nullish values', () => {
			expect(toArray(null)).toEqual([]);
			expect(toArray(undefined)).toEqual([]);
		});

		it('wraps scalar values in an array', () => {
			expect(toArray('value')).toEqual(['value']);
		});

		it('returns array values as-is', () => {
			const value = ['a', 'b'];
			expect(toArray(value)).toBe(value);
		});
	});

	describe('toObjectOrArrayEntries', () => {
		it('returns an empty array for nullish values', () => {
			expect(toObjectOrArrayEntries(null)).toEqual([]);
			expect(toObjectOrArrayEntries(undefined)).toEqual([]);
		});

		it('returns array values as-is', () => {
			const value = [{ id: 1 }, { id: 2 }];
			expect(toObjectOrArrayEntries(value)).toBe(value);
		});

		it('returns object values when record entries are objects', () => {
			const record = {
				first: { id: 1 },
				second: { id: 2 },
			};

			expect(toObjectOrArrayEntries(record)).toEqual([{ id: 1 }, { id: 2 }]);
		});

		it('treats non-object records as a single entry', () => {
			const record = {
				first: 'value',
			};

			expect(toObjectOrArrayEntries(record)).toEqual([record]);
		});
	});

	describe('countCollectionEntries', () => {
		it('returns total number of entries when predicate is omitted', () => {
			expect(countCollectionEntries([{ id: 1 }, { id: 2 }])).toBe(2);
		});

		it('counts only entries matching predicate', () => {
			const entries = [{ value: 1 }, { value: 3 }, { value: 5 }];
			expect(countCollectionEntries(entries, (entry) => entry.value > 2)).toBe(2);
		});
	});
});
