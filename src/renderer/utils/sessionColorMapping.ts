export type SessionType = {
  RACE: string;
  QUALIFY: string;
  PRACTICE: string;
};

export const SESSION_COLOR_MAPPING: Record<keyof SessionType, string> = {
  'RACE': 'error.main',
  'QUALIFY': 'qualifying.main',
  'PRACTICE': 'success.main',
}
