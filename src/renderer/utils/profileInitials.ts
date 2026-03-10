export const getProfileInitials = (fullName?: string, fallback = 'S'): string => {
  const normalized = String(fullName ?? '').trim();
  if (!normalized) {
    return fallback;
  }

  const parts = normalized
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return fallback;
  }

  const firstInitial = parts[0].charAt(0).toUpperCase();
  const lastInitial = parts.length > 1
    ? parts[parts.length - 1].charAt(0).toUpperCase()
    : '';

  return `${firstInitial}${lastInitial}`;
};
