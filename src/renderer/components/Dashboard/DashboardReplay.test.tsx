import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { DashboardViewMode, LMUReplay } from '@types';
import { DashboardReplay } from './DashboardReplay';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

const buildReplay = (
  hash: string,
  session: 'RACE' | 'QUALIFY',
  overrides: Partial<LMUReplay> = {},
) =>
  ({
    hash,
    timestamp: 1000,
    metadata: { session, sceneDesc: 'SEBRINGWEC' },
    logData: { GameVersion: '1.0' },
    logDataFileName: 'race.xml',
    ...overrides,
  }) as unknown as LMUReplay;

describe('DashboardReplay archive actions', () => {
  const setup = (
    dashboardView: DashboardViewMode,
    replayGroup: LMUReplay[] = [
      buildReplay('race-hash', 'RACE'),
      buildReplay('qualify-hash', 'QUALIFY'),
    ],
    viewReplayDisabledReason: string | null = null,
  ) => {
    const onArchive = jest.fn();
    const onRestore = jest.fn();
    const onEditNote = jest.fn();
    const onDeleteImported = jest.fn();
    const onExportSession = jest.fn();
    const onExportWeekend = jest.fn();

    render(
      <DashboardReplay
        replayGroup={replayGroup}
        dashboardView={dashboardView}
        onArchive={onArchive}
        onRestore={onRestore}
        onEditNote={onEditNote}
        onDeleteImported={onDeleteImported}
        onExportSession={onExportSession}
        onExportWeekend={onExportWeekend}
        canExport
        viewReplayDisabledReason={viewReplayDisabledReason}
      />,
    );

    return {
      onArchive,
      onRestore,
      onEditNote,
      onDeleteImported,
      onExportSession,
      onExportWeekend,
    };
  };

  it('archives a single session from its row menu', () => {
    const { onArchive } = setup('active');

    fireEvent.click(screen.getByLabelText('Actions for Race'));
    fireEvent.click(screen.getByText('Archive session'));

    expect(onArchive).toHaveBeenCalledWith(['race-hash'], 'this Race');
  });

  it('archives every session in the weekend from the card menu', () => {
    const { onArchive } = setup('active');

    fireEvent.click(screen.getByLabelText('Weekend archive menu'));
    fireEvent.click(screen.getByText('Archive weekend (2)'));

    expect(onArchive).toHaveBeenCalledWith(
      ['race-hash', 'qualify-hash'],
      'this weekend',
    );
  });

  it('offers restore and note actions in the archived view', () => {
    const { onRestore, onEditNote } = setup('archived', [
      buildReplay('race-hash', 'RACE', {
        archived: true,
        archiveNote: 'reviewed',
      }),
    ]);

    fireEvent.click(screen.getByLabelText('Actions for Race'));
    fireEvent.click(screen.getByText('Edit note'));
    expect(onEditNote).toHaveBeenCalledWith('race-hash', 'reviewed');

    fireEvent.click(screen.getByLabelText('Actions for Race'));
    fireEvent.click(screen.getByText('Restore session'));
    expect(onRestore).toHaveBeenCalledWith(['race-hash']);
  });

  it('offers to add a note when the archived replay has none', () => {
    setup('archived', [buildReplay('race-hash', 'RACE', { archived: true })]);

    fireEvent.click(screen.getByLabelText('Actions for Race'));

    expect(screen.getByText('Add note')).toBeInTheDocument();
  });

  it('surfaces an existing archive note on the row', () => {
    setup('archived', [
      buildReplay('race-hash', 'RACE', {
        archived: true,
        archiveNote: 'reviewed, no action',
      }),
    ]);

    expect(
      screen.getByLabelText('Note: reviewed, no action'),
    ).toBeInTheDocument();
  });

  it('does not offer archive actions for replays in the archived view', () => {
    setup('archived', [buildReplay('race-hash', 'RACE', { archived: true })]);

    fireEvent.click(screen.getByLabelText('Actions for Race'));

    expect(screen.queryByText('Archive session')).not.toBeInTheDocument();
  });

  it('keeps View Replay available for archived replays', () => {
    setup('archived', [buildReplay('race-hash', 'RACE', { archived: true })]);

    expect(screen.getByText('View Replay')).toBeInTheDocument();
    expect(screen.getByText('View Replay').closest('button')).toBeEnabled();
  });

  /*
    Loading a replay calls /rest/watch/play, which makes LMU load it. Doing that
    mid-race ends the session being captured, so the control is dead while one
    is running rather than quietly destructive.
  */
  it('will not open a replay while a session is being captured', () => {
    setup(
      'active',
      [buildReplay('race-hash', 'RACE')],
      'A live session is running.',
    );

    expect(screen.getByText('View Replay').closest('button')).toBeDisabled();
  });

  /**
   * Export is per session rather than per weekend: one replay and one result
   * log is a pairing with nothing to resolve. A weekend can hold several races
   * from restarts, and those are only distinguishable because each replay
   * already carries its own log.
   */
  it('exports the session the row belongs to', () => {
    const { onExportSession } = setup('active');

    fireEvent.click(screen.getByLabelText('Actions for Race'));
    fireEvent.click(screen.getByText('Export session'));

    expect(onExportSession).toHaveBeenCalledTimes(1);
    expect(onExportSession.mock.calls[0][0]).toMatchObject({
      hash: 'race-hash',
    });
  });

  it('offers no export when the replay has no result log', () => {
    setup('active', [
      buildReplay('race-hash', 'RACE', { logDataFileName: '' }),
    ]);

    fireEvent.click(screen.getByLabelText('Actions for Race'));

    expect(
      screen.getByText('Export session (no result log)').closest('li'),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('exports every session in the weekend from the card menu', () => {
    const { onExportWeekend } = setup('active');

    fireEvent.click(screen.getByLabelText('Weekend archive menu'));
    fireEvent.click(screen.getByText('Export weekend (2)'));

    expect(onExportWeekend).toHaveBeenCalledTimes(1);
    expect(
      onExportWeekend.mock.calls[0][0].map((replay: LMUReplay) => replay.hash),
    ).toEqual(['race-hash', 'qualify-hash']);
  });

  /**
   * A session with no matched log is left out rather than blocking the
   * weekend. One unmatched practice session is no reason to withhold the rest,
   * and the count is what will actually be written.
   */
  it('counts only the sessions that have a result log', () => {
    const { onExportWeekend } = setup('active', [
      buildReplay('race-hash', 'RACE'),
      buildReplay('qualify-hash', 'QUALIFY', { logDataFileName: '' }),
    ]);

    fireEvent.click(screen.getByLabelText('Weekend archive menu'));
    fireEvent.click(screen.getByText('Export weekend (1)'));

    expect(
      onExportWeekend.mock.calls[0][0].map((replay: LMUReplay) => replay.hash),
    ).toEqual(['race-hash']);
  });

  it('disables the weekend export when no session has a result log', () => {
    setup('active', [
      buildReplay('race-hash', 'RACE', { logDataFileName: '' }),
    ]);

    fireEvent.click(screen.getByLabelText('Weekend archive menu'));

    expect(
      screen.getByText('Export weekend (no result logs)').closest('li'),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  /**
   * Export never depended on the flag for replays already on disk, and the
   * imported view is the one place a steward reaches a hand-off they have
   * verified — re-exporting propagates the pairing to the next steward.
   */
  it('offers weekend export in the imported view', () => {
    const { onExportWeekend } = setup('imported');

    fireEvent.click(screen.getByLabelText('Weekend delete menu'));
    fireEvent.click(screen.getByText('Export weekend (2)'));

    expect(onExportWeekend).toHaveBeenCalledTimes(1);
  });

  /**
   * The note written at import shows on the row through the same affordance an
   * archive note does. A replay is never both — the three views are mutually
   * exclusive — so one field renders either.
   */
  it('surfaces an import note on the row', () => {
    setup('imported', [
      buildReplay('race-hash', 'RACE', {
        imported: true,
        importNote: 'Protest 12, sent by Team Foxtrot',
      }),
    ]);

    expect(
      screen.getByLabelText('Note: Protest 12, sent by Team Foxtrot'),
    ).toBeInTheDocument();
  });

  /**
   * Without this the note written at import would be permanent: an imported
   * replay is never in the archived view, which is where note editing
   * otherwise lives.
   */
  it('lets an imported replay note be edited afterwards', () => {
    const { onEditNote } = setup('imported', [
      buildReplay('race-hash', 'RACE', {
        imported: true,
        importNote: 'Protest 12',
      }),
    ]);

    fireEvent.click(screen.getByLabelText('Actions for Race'));
    fireEvent.click(screen.getByText('Edit note'));

    expect(onEditNote).toHaveBeenCalledWith('race-hash', 'Protest 12');
  });

  it('offers to add a note to an imported replay that has none', () => {
    setup('imported', [buildReplay('race-hash', 'RACE', { imported: true })]);

    fireEvent.click(screen.getByLabelText('Actions for Race'));

    expect(screen.getByText('Add note')).toBeInTheDocument();
  });
});
