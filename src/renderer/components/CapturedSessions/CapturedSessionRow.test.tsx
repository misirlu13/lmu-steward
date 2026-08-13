import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { LiveSessionSummary } from '@types';
import { CapturedSessionRow } from './CapturedSessionRow';

const session = (
  overrides: Partial<LiveSessionSummary> = {},
): LiveSessionSummary => ({
  sessionKey: 'live|WeatherTech Raceway Laguna Seca|1|1785798030000',
  trackName: 'WeatherTech Raceway Laguna Seca',
  sessionType: 'PRACTICE',
  session: 1,
  startedAt: 1785798030000,
  lastSeenAt: 1785798030000,
  driverCount: 38,
  incidentCount: 316,
  evidenceCount: 315,
  linkState: 'unlinked',
  ...overrides,
});

const linked = {
  replayHash: 'hash-p1-7',
  replayIdentityKey: 'identity-p1-7',
  replayName: 'WeatherTech Raceway Laguna Seca P1 7',
  method: 'roster' as const,
  confidence: 1,
  linkedAt: 1786031059199,
};

const renderRow = (
  overrides: Partial<LiveSessionSummary> = {},
  handlers: Partial<{
    onViewReplay: jest.Mock;
    onLinkReplay: jest.Mock;
    onDelete: jest.Mock;
  }> = {},
  viewReplayDisabledReason: string | null = null,
) => {
  const onViewReplay = handlers.onViewReplay ?? jest.fn();
  const onLinkReplay = handlers.onLinkReplay ?? jest.fn();
  const onDelete = handlers.onDelete ?? jest.fn();

  render(
    <CapturedSessionRow
      session={session(overrides)}
      isDeleting={false}
      viewReplayDisabledReason={viewReplayDisabledReason}
      onViewReplay={onViewReplay}
      onLinkReplay={onLinkReplay}
      onDelete={onDelete}
    />,
  );

  return { onViewReplay, onLinkReplay, onDelete };
};

const openMenu = () => {
  fireEvent.click(screen.getByRole('button', { name: /Actions for/i }));
};

describe('CapturedSessionRow', () => {
  /*
    Replay titles are a track mapping plus a session suffix, so a weekend's
    sessions look nearly identical in the replay list. Naming the linked replay
    on the row is what makes "which one is this?" answerable at a glance.
  */
  it('names the linked replay on the row', () => {
    renderRow({ linkState: 'linked', link: linked });

    expect(
      screen.getByText('Linked to WeatherTech Raceway Laguna Seca P1 7'),
    ).toBeInTheDocument();
  });

  it('names a proposed replay as a possibility rather than a link', () => {
    renderRow({
      linkState: 'proposed',
      proposal: {
        replayHash: 'hash-p1-8',
        replayIdentityKey: 'identity-p1-8',
        replayName: 'WeatherTech Raceway Laguna Seca P1 8',
        confidence: 1,
        intersection: 38,
        liveDriverCount: 38,
        replayDriverCount: 38,
        incidentAgreement: 1,
        proposedAt: 1786031001194,
      },
    });

    expect(
      screen.getByText('Possible match: WeatherTech Raceway Laguna Seca P1 8'),
    ).toBeInTheDocument();
    expect(screen.getByText('Replay found')).toBeInTheDocument();
  });

  // Unlinked is a normal resting state and must not be flagged.
  it('says nothing about the replay when none is linked', () => {
    renderRow();

    expect(screen.queryByText(/Linked to/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Possible match/)).not.toBeInTheDocument();
  });

  it('opens the linked replay by hash', () => {
    const { onViewReplay } = renderRow({ linkState: 'linked', link: linked });

    openMenu();
    fireEvent.click(screen.getByText('View Replay'));

    expect(onViewReplay).toHaveBeenCalledWith('hash-p1-7');
  });

  /*
    There is nothing to open without a link, and offering a dead action is worse
    than not offering one — a steward would read it as the replay being missing
    rather than never having been paired.
  */
  it('offers no view action when nothing is linked', () => {
    renderRow();

    openMenu();

    expect(screen.queryByText('View Replay')).not.toBeInTheDocument();
    expect(screen.getByText('Link Replay')).toBeInTheDocument();
  });

  it('offers to change the replay once one is linked', () => {
    const { onLinkReplay } = renderRow({ linkState: 'linked', link: linked });

    openMenu();
    fireEvent.click(screen.getByText('Change Replay'));

    expect(onLinkReplay).toHaveBeenCalled();
  });

  it('asks before deleting rather than deleting outright', () => {
    const { onDelete } = renderRow();

    openMenu();
    fireEvent.click(screen.getByText('Delete Session'));

    expect(onDelete).toHaveBeenCalled();
  });

  /*
    Loading a replay calls /rest/watch/play, which makes LMU load it. Doing that
    mid-race ends the session being captured, so the action is dead while one is
    running — and says why, rather than silently doing nothing.
  */
  it('will not open the replay while a session is being captured', () => {
    const { onViewReplay } = renderRow(
      { linkState: 'linked', link: linked },
      {},
      'A live session is running.',
    );

    openMenu();
    const item = screen.getByText('View Replay').closest('li');
    expect(item).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(screen.getByText('View Replay'));
    expect(onViewReplay).not.toHaveBeenCalled();
  });

  it('shows what was captured', () => {
    renderRow();

    expect(screen.getByText('316 incidents')).toBeInTheDocument();
    expect(screen.getByText('315 with evidence')).toBeInTheDocument();
  });
});
