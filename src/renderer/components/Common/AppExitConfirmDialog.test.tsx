import React from 'react';
import { render } from '@testing-library/react';
import { Dialog } from '@mui/material';
import { AppExitConfirmDialog } from './AppExitConfirmDialog';

jest.mock('@mui/material', () => {
  const actual = jest.requireActual('@mui/material');
  return {
    ...actual,
    Dialog: jest.fn(({ children }: { children: React.ReactNode }) => (
      <div data-testid="app-exit-dialog">{children}</div>
    )),
  };
});

describe('AppExitConfirmDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (window as unknown as { electron?: unknown }).electron = {
      ipcRenderer: {
        on: jest.fn(() => jest.fn()),
      },
    };
  });

  it('renders above replay loading overlays via elevated dialog z-index', () => {
    render(<AppExitConfirmDialog />);

    const dialogMock = Dialog as unknown as jest.Mock;
    expect(dialogMock).toHaveBeenCalled();

    const firstCallProps = dialogMock.mock.calls[0][0] as {
      sx?: {
        zIndex?: (theme: { zIndex: { modal: number } }) => number;
      };
    };

    expect(typeof firstCallProps.sx?.zIndex).toBe('function');
    expect(firstCallProps.sx?.zIndex?.({ zIndex: { modal: 1300 } })).toBe(1303);
  });
});
