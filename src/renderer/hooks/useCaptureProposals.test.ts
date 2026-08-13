import { LiveSessionSummary } from '@types';
import { countPendingCaptureProposals } from './useCaptureProposals';

const session = (
  overrides: Partial<LiveSessionSummary> = {},
): LiveSessionSummary => ({
  sessionKey: 'live|Sebring|1|1785798030000',
  trackName: 'Sebring International Raceway',
  sessionType: 'PRACTICE',
  session: 1,
  startedAt: 1785798030000,
  lastSeenAt: 1785798030000,
  driverCount: 22,
  incidentCount: 12,
  evidenceCount: 9,
  linkState: 'unlinked',
  ...overrides,
});

describe('countPendingCaptureProposals', () => {
  it('counts sessions with a replay waiting to be confirmed', () => {
    expect(
      countPendingCaptureProposals([
        session({ sessionKey: 'a', linkState: 'proposed' }),
        session({ sessionKey: 'b', linkState: 'proposed' }),
        session({ sessionKey: 'c', linkState: 'linked' }),
      ]),
    ).toBe(2);
  });

  /*
    The whole reason the badge counts proposals rather than everything without
    a link. A practice replay is often simply not kept, so unlinked is where
    most sessions come to rest — badging it would put a permanent number on the
    navbar for something nobody can act on.
  */
  it('ignores unlinked sessions, which are a normal resting state', () => {
    expect(
      countPendingCaptureProposals([
        session({ sessionKey: 'a' }),
        session({ sessionKey: 'b' }),
      ]),
    ).toBe(0);
  });

  it('ignores sessions already linked', () => {
    expect(
      countPendingCaptureProposals([
        session({ sessionKey: 'a', linkState: 'linked' }),
      ]),
    ).toBe(0);
  });

  it('counts nothing when nothing has been captured', () => {
    expect(countPendingCaptureProposals([])).toBe(0);
  });
});
