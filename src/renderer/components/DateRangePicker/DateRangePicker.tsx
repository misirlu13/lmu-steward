import { useMemo, useState } from 'react';
import { Box } from '@mui/material';
import dayjs, { Dayjs } from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

type DateRange = [Dayjs | null, Dayjs | null];

interface DateRangePickerProps {
  onDateRangeChange?: (dateRange: DateRange) => void;
}

export const DateRangePicker = ({ onDateRangeChange }: DateRangePickerProps) => {
    const [value, setValue] = useState<DateRange>([null, null]);

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
        const newRange: DateRange = [newStartDate, normalizedEndDate];
        setValue(newRange);
        onDateRangeChange?.(newRange);
    };

    const handleEndDateChange = (newEndDate: Dayjs | null) => {
        const newRange: DateRange = [normalizedStartDate, newEndDate];
        setValue(newRange);
        onDateRangeChange?.(newRange);
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
