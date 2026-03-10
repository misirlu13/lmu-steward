export const toArray = <T,>(value: T | T[] | null | undefined): T[] => {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

export const toObjectOrArrayEntries = <T,>(
  value: T[] | Record<string, T> | null | undefined,
): T[] => {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'object') {
    const objectValues = Object.values(value);
    const isRecordOfObjects =
      objectValues.length > 0 &&
      objectValues.every(
        (entry) =>
          typeof entry === 'object' && entry !== null && !Array.isArray(entry),
      );

    if (isRecordOfObjects) {
      return objectValues as T[];
    }

    return [value as T];
  }

  return [];
};

export const countCollectionEntries = <T,>(
  value: T[] | Record<string, T> | null | undefined,
  predicate?: (entry: T) => boolean,
): number => {
  const entries = toObjectOrArrayEntries(value);
  if (!predicate) {
    return entries.length;
  }

  let count = 0;
  for (const entry of entries) {
    if (predicate(entry)) {
      count += 1;
    }
  }

  return count;
};
