/** Formatting shared by the driver dashboard panels. */

export const formatLapTime = (seconds: number | null | undefined): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }

  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;

  return `${minutes}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
};

export const formatCount = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : Math.round(value).toLocaleString();

export const formatDecimal = (
  value: number | null | undefined,
  places = 1,
): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toFixed(places);

export const formatDistance = (km: number | null | undefined): string => {
  if (!km || !Number.isFinite(km)) {
    return '—';
  }

  return km >= 1000
    ? `${Math.round(km).toLocaleString()} km`
    : `${km.toFixed(1)} km`;
};

export const formatHours = (seconds: number | null | undefined): string => {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }

  const hours = seconds / 3600;
  return hours >= 10 ? `${Math.round(hours)} h` : `${hours.toFixed(1)} h`;
};

export const formatDate = (epochSeconds: number | null | undefined): string => {
  if (!epochSeconds || !Number.isFinite(epochSeconds)) {
    return '—';
  }

  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

export const formatPercent = (
  value: number | null | undefined,
  places = 0,
): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${(value * 100).toFixed(places)}%`;

/**
 * A finish percentile as a rank out of ten, where 1 is the front of the field.
 * The raw fraction is meaningless to read; "top 12%" is not.
 */
export const formatFieldPercentile = (
  value: number | null | undefined,
): string =>
  value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `top ${Math.max(1, Math.round(value * 100))}%`;

export const formatSigned = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  if (value === 0) {
    return '0';
  }

  return value > 0 ? `+${value}` : String(value);
};
