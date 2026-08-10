import React from 'react';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  MAX_STEWARD_ACTION_LABEL_LENGTH,
  StewardAction,
  stewardActionShortcut,
  validateStewardActions,
} from '../../utils/stewardActions';

interface Props {
  /**
   * The tariff being edited, always resolved — the caller hands down the shipped
   * defaults when nothing is stored, so this component never needs to know a
   * default exists.
   */
  actions: StewardAction[];
  /** True when nothing is stored, which is what disables "revert". */
  isAtDefaults: boolean;
  onChange: (next: StewardAction[]) => void;
  onRevert: () => void;
  disabled?: boolean;
}

/** Editing identity only, and only ever handed to rows created here. */
let nextLocalId = 0;
const newActionId = (): string => {
  nextLocalId += 1;
  return `sa-new-${Date.now()}-${nextLocalId}`;
};

/**
 * Configures the action buttons both dossiers offer.
 *
 * The label is the value: what is typed here is what the button says, what the
 * decision stores and what every export carries, so a league matches whatever
 * their spreadsheet already uses rather than translating twice.
 *
 * Order matters — it decides which action gets which number key — so rows can be
 * moved rather than only added and removed.
 */
export const StewardActionsEditor: React.FC<Props> = ({
  actions,
  isAtDefaults,
  onChange,
  onRevert,
  disabled = false,
}) => {
  const { errorByActionId } = validateStewardActions(actions);

  const replaceAt = (index: number, next: Partial<StewardAction>) =>
    onChange(
      actions.map((action, at) =>
        at === index ? { ...action, ...next } : action,
      ),
    );

  const moveBy = (index: number, step: number) => {
    const to = index + step;
    if (to < 0 || to >= actions.length) {
      return;
    }

    const reordered = [...actions];
    [reordered[index], reordered[to]] = [reordered[to], reordered[index]];
    onChange(reordered);
  };

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        p: 2,
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        sx={{ mb: 1.5 }}
      >
        <Box sx={{ pr: 2 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Decision Actions
          </Typography>
          <Typography variant="caption" color="text.secondary">
            The buttons offered when you call an incident, live and in
            post-session review. Whatever you type is what the decision records
            and what CSV, Markdown and JSON exports carry, so it can match your
            league&apos;s own wording. The first nine get keyboard shortcuts in
            the order below. Decisions already made keep the wording they were
            made under, whatever you change here.
          </Typography>
        </Box>
        <Tooltip
          title={
            isAtDefaults
              ? 'Already using the shipped actions.'
              : 'Discard these and go back to the shipped actions.'
          }
        >
          {/*
            Held at its natural width. The description beside it is a full
            paragraph, and left to flex the button wrapped to three stacked
            words.
          */}
          <span style={{ flexShrink: 0 }}>
            <Button
              size="small"
              startIcon={<RestartAltIcon />}
              onClick={onRevert}
              disabled={disabled || isAtDefaults}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Revert to default
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Stack spacing={1}>
        {actions.map((action, index) => {
          const shortcut = stewardActionShortcut(index);
          const error = errorByActionId[action.id];

          return (
            <Stack
              key={action.id}
              direction="row"
              spacing={1}
              alignItems="flex-start"
            >
              {/*
                The key this row answers to, shown rather than set. Derived from
                the position, so moving a row moves its shortcut with it and
                there is no collision to validate.
              */}
              <Chip
                size="small"
                label={shortcut ?? '—'}
                variant="outlined"
                sx={{ mt: 0.5, minWidth: 44 }}
              />
              <TextField
                size="small"
                fullWidth
                value={action.label}
                error={Boolean(error)}
                helperText={error}
                inputProps={{
                  maxLength: MAX_STEWARD_ACTION_LABEL_LENGTH,
                  'aria-label': `Action ${index + 1} label`,
                }}
                onChange={(changeEvent) =>
                  replaceAt(index, { label: changeEvent.target.value })
                }
                disabled={disabled}
              />
              {/*
                "Does this apply to one driver, or to the incident?" — the check
                that stops a penalty being recorded against a two-car incident
                with nobody named. Visible rather than inferred from the wording,
                because no rule about the text could get this right.
              */}
              <Tooltip
                title={
                  action.driverScoped
                    ? 'A call against one driver. Needs a driver selected before it can be used, and the record names them.'
                    : 'A finding about the incident as a whole. Records no driver.'
                }
              >
                <Stack alignItems="center" sx={{ minWidth: 92 }}>
                  <Switch
                    size="small"
                    checked={action.driverScoped}
                    onChange={(_changeEvent, checked) =>
                      replaceAt(index, { driverScoped: checked })
                    }
                    slotProps={{
                      input: {
                        'aria-label': `Action ${index + 1} applies to one driver`,
                      },
                    }}
                    disabled={disabled}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {action.driverScoped ? 'One driver' : 'Incident'}
                  </Typography>
                </Stack>
              </Tooltip>
              <IconButton
                size="small"
                aria-label={`Move action ${index + 1} up`}
                onClick={() => moveBy(index, -1)}
                disabled={disabled || index === 0}
              >
                <ArrowUpwardIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                aria-label={`Move action ${index + 1} down`}
                onClick={() => moveBy(index, 1)}
                disabled={disabled || index === actions.length - 1}
              >
                <ArrowDownwardIcon fontSize="small" />
              </IconButton>
              {/*
                The last row cannot be removed. An empty tariff would leave the
                dossier with nothing to press, and silently falling back to the
                shipped set instead would look like the delete had failed.
              */}
              <Tooltip
                title={
                  actions.length === 1
                    ? 'At least one action is needed. Use "Revert to default" to start over.'
                    : `Remove "${action.label}"`
                }
              >
                <span>
                  <IconButton
                    size="small"
                    aria-label={`Remove action ${index + 1}`}
                    onClick={() =>
                      onChange(actions.filter((_entry, at) => at !== index))
                    }
                    disabled={disabled || actions.length === 1}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          );
        })}
      </Stack>

      <Button
        size="small"
        startIcon={<AddIcon />}
        sx={{ mt: 1.5 }}
        onClick={() =>
          onChange([
            ...actions,
            /*
              New actions default to a call against a driver. An action wrongly
              marked driver-scoped asks for a target that was not needed; the
              other way round writes a penalty nobody can act on.
            */
            { id: newActionId(), label: '', driverScoped: true },
          ])
        }
        disabled={disabled}
      >
        Add action
      </Button>
    </Box>
  );
};
