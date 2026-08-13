import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { ReplayActions } from './ReplayActions';

interface SetupOverrides {
  canExport?: boolean;
  sessionDataDisabledReason?: string | null;
}

const setup = ({
  canExport = true,
  sessionDataDisabledReason = null,
}: SetupOverrides = {}) => {
  const onViewChat = jest.fn();
  const onExport = jest.fn();
  const onExportSessionData = jest.fn();
  const onCopySessionMarkdown = jest.fn();
  const onCloseAndBackToReplays = jest.fn();

  render(
    <ReplayActions
      onViewChat={onViewChat}
      canExport={canExport}
      exportDisabledReason={null}
      onExport={onExport}
      sessionDataDisabledReason={sessionDataDisabledReason}
      onExportSessionData={onExportSessionData}
      onCopySessionMarkdown={onCopySessionMarkdown}
      onCloseAndBackToReplays={onCloseAndBackToReplays}
    />,
  );

  return {
    onViewChat,
    onExport,
    onExportSessionData,
    onCopySessionMarkdown,
    onCloseAndBackToReplays,
  };
};

describe('ReplayActions', () => {
  // One button produces an archive for another LMU Steward install, the other a
  // report for a league's spreadsheet. They must not read as the same action.
  it('should offer the data export and the replay archive as distinct actions', () => {
    setup();

    expect(
      screen.getByRole('button', { name: /export data/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /export replay/i }),
    ).toBeInTheDocument();
  });

  /*
   * Closing is its own button rather than a side effect of the breadcrumb.
   * Navigating away from the analysis is not a statement about what LMU should
   * still have loaded — a steward moving between a replay and the list expects
   * to come back to it, which is what the "still loaded" banner is for.
   */
  it('should close the replay only from the close action', () => {
    const { onCloseAndBackToReplays } = setup();

    fireEvent.click(screen.getByRole('button', { name: /close replay/i }));

    expect(onCloseAndBackToReplays).toHaveBeenCalledTimes(1);
  });

  it('should export the format the steward picked', () => {
    const { onExportSessionData } = setup();

    fireEvent.click(screen.getByRole('button', { name: /export data/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /csv/i }));

    expect(onExportSessionData).toHaveBeenCalledWith('csv');
  });

  it('should offer each of the three formats', () => {
    const { onExportSessionData } = setup();

    fireEvent.click(screen.getByRole('button', { name: /export data/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /json/i }));

    expect(onExportSessionData).toHaveBeenCalledWith('json');
  });

  it('should copy Markdown for posting rather than saving a file', () => {
    const { onCopySessionMarkdown, onExportSessionData } = setup();

    fireEvent.click(screen.getByRole('button', { name: /export data/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /copy markdown/i }));

    expect(onCopySessionMarkdown).toHaveBeenCalledTimes(1);
    expect(onExportSessionData).not.toHaveBeenCalled();
  });

  it('should disable the data export when there is nothing to export', () => {
    setup({ sessionDataDisabledReason: 'No synced standings yet.' });

    expect(screen.getByRole('button', { name: /export data/i })).toBeDisabled();
  });

  it('should still offer the data export when experimental features are off', () => {
    setup({ canExport: false });

    expect(screen.getByRole('button', { name: /export data/i })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: /export replay/i }),
    ).not.toBeInTheDocument();
  });
});
