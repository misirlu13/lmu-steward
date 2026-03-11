import React from 'react';
import { render, screen } from '@testing-library/react';
import { NavBar } from './NavBar';
import { CONSTANTS } from '@constants';
import { sendMessage } from '../../utils/postMessage';

let mockIsViewHeaderAttached = false;

jest.mock('@/renderer/providers/NavbarContext', () => ({
  useNavbar: () => ({
    isViewHeaderAttached: mockIsViewHeaderAttached,
  }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../../utils/postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../../utils/profileInitials', () => ({
  getProfileInitials: () => 'LS',
}));

jest.mock('@mui/material/AppBar', () => ({
  __esModule: true,
  default: ({ sx, children }: { sx?: { borderColor?: string }; children: React.ReactNode }) => (
    <div data-testid="app-bar" data-border-color={sx?.borderColor}>
      {children}
    </div>
  ),
}));

describe('NavBar', () => {
  const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

  beforeEach(() => {
    jest.clearAllMocks();
    (window as unknown as { electron?: unknown }).electron = {
      ipcRenderer: {
        on: jest.fn(() => jest.fn()),
      },
    };
  });

  it('keeps navbar border visible when view header is not attached', () => {
    mockIsViewHeaderAttached = false;
    render(<NavBar />);

    expect(screen.getByTestId('app-bar').getAttribute('data-border-color')).toBe(
      'divider',
    );
  });

  it('hides navbar border when view header is attached', () => {
    mockIsViewHeaderAttached = true;
    render(<NavBar />);

    expect(screen.getByTestId('app-bar').getAttribute('data-border-color')).toBe(
      'transparent',
    );
  });

  it('requests profile info on mount', () => {
    mockIsViewHeaderAttached = false;
    render(<NavBar />);

    expect(sendMessageMock).toHaveBeenCalledWith(CONSTANTS.API.GET_PROFILE_INFO);
  });
});
