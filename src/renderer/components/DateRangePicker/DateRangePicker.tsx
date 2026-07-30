import { useMemo } from 'react';
import { Box } from '@mui/material';
import { Dayjs } from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

type DateRange = [Dayjs | null, Dayjs | null];

const EMPTY_DATE_RANGE: DateRange = [null, null];

interface DateRangePickerProps {
  value?: DateRange;
  onDateRangeChange?: (dateRange: DateRange) => void;
}

export const DateRangePicker = ({
  value = EMPTY_DATE_RANGE,
  onDateRangeChange,
}: DateRangePickerProps) => {
  const [startDate, endDate] = value;

  const normalizedRange = useMemo<DateRange>(() => {
    if (!startDate || !endDate) {
      return [startDate, endDate];
    }

    return startDate.isAfter(endDate)
      ? [endDate.startOf('day'), startDate.startOf('day')]
      : [startDate.startOf('day'), endDate.startOf('day')];
  }, [startDate, endDate]);

  const [normalizedStartDate, normalizedEndDate] = normalizedRange;

  const handleStartDateChange = (newStartDate: Dayjs | null) => {
    onDateRangeChange?.([newStartDate, normalizedEndDate]);
  };

  const handleEndDateChange = (newEndDate: Dayjs | null) => {
    onDateRangeChange?.([normalizedStartDate, newEndDate]);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        minWidth: 500,
        width: '100%',
      }}
    >
      <DatePicker
        label="Start Date"
        value={normalizedStartDate}
        maxDate={normalizedEndDate ?? undefined}
        onChange={handleStartDateChange}
      />
      <DatePicker
        label="End Date"
        value={normalizedEndDate}
        minDate={normalizedStartDate ?? undefined}
        onChange={handleEndDateChange}
      />
    </Box>
  );
};
