export const regionDisplayNames =
  typeof Intl !== 'undefined' && typeof Intl.DisplayNames !== 'undefined'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export const getCountryNameFromCode = (countryCode?: string): string => {
  const normalized = String(countryCode ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return normalized || 'Unknown';
  }

  return regionDisplayNames?.of(normalized) || normalized;
};

export const getFlagEmojiFromCountryCode = (countryCode?: string): string => {
  const normalized = String(countryCode ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return '🏳️';
  }

  return String.fromCodePoint(
    ...normalized.split('').map((char) => 0x1f1e6 - 65 + char.charCodeAt(0)),
  );
};

export const getFlagImageUrlFromCountryCode = (
  countryCode?: string,
): string | null => {
  const normalized = String(countryCode ?? '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) {
    return null;
  }

  return `https://flagcdn.com/24x18/${normalized}.png`;
};

export const LONGEST_COUNTRY_NAME = 'United States Minor Outlying Islands';
export const LMU_LAUNCH_COOLDOWN_MS = 10_000;
export const READ_ONLY_VALUE_COLOR_SX = {
  '& .MuiInputBase-input.Mui-disabled': {
    WebkitTextFillColor: 'text.secondary',
    color: 'text.secondary',
  },
  '& .MuiInputBase-input': {
    color: 'text.secondary',
  },
};
