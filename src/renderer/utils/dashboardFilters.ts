import { Dayjs } from 'dayjs';
import { ReplayGameTypeFilter } from '@types';

export type DateRange = [Dayjs | null, Dayjs | null];

export interface Filters {
  dateRange: DateRange;
  track: string | '';
  sessionType: string | '';
  sessionLength: string | '';
  gameType: ReplayGameTypeFilter;
  carClass: string | '';
  fieldSize: string | '';
  multiSingleClass: string | '';
  incidentCount: string | '';
}

export const DEFAULT_FILTERS: Filters = {
  dateRange: [null, null],
  track: '',
  sessionType: '',
  sessionLength: '',
  gameType: '',
  carClass: '',
  fieldSize: '',
  multiSingleClass: '',
  incidentCount: '',
};

export interface FilterOption {
  label: string;
  value: string;
}

export const sessionTypeOptions: FilterOption[] = [
  { label: 'Practice', value: 'PRACTICE' },
  { label: 'Qualifying', value: 'QUALIFY' },
  { label: 'Race', value: 'RACE' },
];

export const sessionLengthOptions: FilterOption[] = [
  { label: 'Short (~20 mins)', value: 'short' },
  { label: 'Medium (~60 mins)', value: 'medium' },
  { label: 'Long (>120 mins)', value: 'long' },
];

export const fieldSizeOptions: FilterOption[] = [
  { label: 'Small (1-10 cars)', value: 'small' },
  { label: 'Medium (11-30 cars)', value: 'medium' },
  { label: 'Large (31+ cars)', value: 'large' },
];

export const multiSingleClassOptions: FilterOption[] = [
  { label: 'Single Class', value: 'single' },
  { label: 'Multi Class', value: 'multi' },
];

export const gameTypeOptions: FilterOption[] = [
  { label: 'Race Weekend', value: 'race-weekend' },
  { label: 'Multiplayer', value: 'multiplayer' },
];

export const incidentCountOptions: FilterOption[] = [
  { label: 'Low (< 2 score per driver)', value: 'low' },
  { label: 'Medium (2-5 score per driver)', value: 'medium' },
  { label: 'High (5+ score per driver)', value: 'high' },
];
