import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ViewHeader } from './ViewHeader';

const mockSetIsViewHeaderAttached = jest.fn();

jest.mock('@/renderer/providers/NavbarContext', () => ({
  useNavbar: () => ({
    setIsViewHeaderAttached: mockSetIsViewHeaderAttached,
  }),
}));

describe('ViewHeader', () => {
  let sentinelTop = 120;
  let boundingRectSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    sentinelTop = 120;

    boundingRectSpy = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(
        () =>
          ({
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            top: sentinelTop,
            right: 0,
            bottom: sentinelTop,
            left: 0,
            toJSON: () => ({}),
          }) as DOMRect,
      );
  });

  afterEach(() => {
    boundingRectSpy.mockRestore();
  });

  it('updates navbar attachment state when header reaches the navbar edge', () => {
    render(
      <ViewHeader
        breadcrumb="Dashboard"
        title="Session Analysis"
        subtitle="Replay details"
      />,
    );

    expect(mockSetIsViewHeaderAttached).toHaveBeenCalledWith(false);

    sentinelTop = 48;
    fireEvent.scroll(window);

    expect(mockSetIsViewHeaderAttached).toHaveBeenLastCalledWith(true);
  });

  it('renders breadcrumb, title, subtitle, and actions content', () => {
    render(
      <ViewHeader
        breadcrumb="Dashboard / Session"
        title="Track Name"
        subtitle="Replay subtitle"
        actions={<button type="button">Action</button>}
      />,
    );

    expect(screen.getByText('Dashboard / Session')).toBeTruthy();
    expect(screen.getByText('Track Name')).toBeTruthy();
    expect(screen.getByText('Replay subtitle')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Action' })).toBeTruthy();
  });
});
