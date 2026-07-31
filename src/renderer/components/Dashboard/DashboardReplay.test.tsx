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
    ...overrides,
  }) as unknown as LMUReplay;

describe('DashboardReplay archive actions', () => {
  const setup = (
    dashboardView: DashboardViewMode,
    replayGroup: LMUReplay[] = [
      buildReplay('race-hash', 'RACE'),
      buildReplay('qualify-hash', 'QUALIFY'),
    ],
  ) => {
    const onArchive = jest.fn();
    const onRestore = jest.fn();
    const onEditNote = jest.fn();
    const onDeleteImported = jest.fn();

    render(
      <DashboardReplay
        replayGroup={replayGroup}
        dashboardView={dashboardView}
        onArchive={onArchive}
        onRestore={onRestore}
        onEditNote={onEditNote}
        onDeleteImported={onDeleteImported}
      />,
    );

    return { onArchive, onRestore, onEditNote, onDeleteImported };
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

  it('surfaces an existing note on the row', () => {
    setup('archived', [
      buildReplay('race-hash', 'RACE', {
        archived: true,
        archiveNote: 'reviewed, no action',
      }),
    ]);

    expect(
      screen.getByLabelText('Archive note: reviewed, no action'),
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
  });
});
