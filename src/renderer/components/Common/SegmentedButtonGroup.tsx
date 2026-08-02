import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import { buttonGroupClasses } from '@mui/material';
import { SxProps, Theme } from '@mui/material/styles';

export interface SegmentedButtonOption<T extends string> {
  value: T;
  label: React.ReactNode;
  sx?: SxProps<Theme>;
  activeSx?: SxProps<Theme>;
}

interface SegmentedButtonGroupProps<T extends string> {
  options: SegmentedButtonOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  sx?: SxProps<Theme>;
  size?: 'small' | 'medium' | 'large';
}

export const SegmentedButtonGroup = <T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  sx,
  size = 'small',
}: SegmentedButtonGroupProps<T>) => {
  return (
    <ButtonGroup
      variant="contained"
      size={size}
      aria-label={ariaLabel}
      sx={{
        /*
         * A contained ButtonGroup draws the divider between buttons in the
         * primary colour, through a `:not(:last-of-type)` rule. Overriding only
         * the first button was enough while there were two — the second was
         * also the last, so nothing drew a divider on it. Any middle button
         * picks the blue divider back up, so every button but the last needs
         * the muted border.
         */
        [`.${buttonGroupClasses.grouped}:not(:last-of-type)`]: {
          borderColor: 'divider',
          borderRightColor: 'divider',
        },
        [`.${buttonGroupClasses.grouped}:hover`]: {
          backgroundColor: (theme) => theme.palette.background.paper,
        },
        ...sx,
      }}
    >
      {options.map((option) => {
        const isActive = option.value === value;
        const baseButtonSx = {
          backgroundColor: isActive ? 'background.paper' : 'background.alt',
          border: '1px solid',
          borderColor: 'divider',
          color: isActive ? 'primary.main' : 'text.primary',
          minWidth: 0,
        };
        const buttonSxLayers: SxProps<Theme>[] = [baseButtonSx];
        if (option.sx) {
          buttonSxLayers.push(option.sx);
        }
        if (isActive && option.activeSx) {
          buttonSxLayers.push(option.activeSx);
        }

        return (
          <Button
            key={option.value}
            onClick={() => onChange(option.value)}
            sx={buttonSxLayers as SxProps<Theme>}
          >
            {option.label}
          </Button>
        );
      })}
    </ButtonGroup>
  );
};
