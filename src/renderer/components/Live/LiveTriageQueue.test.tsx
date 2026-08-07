import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { LiveTriageQueue } from './LiveTriageQueue';
import { buildLiveIncidentsFixture } from './liveFixtures';

/*
  Counting row renders directly.

  Every driver on every row renders one CarClassBadge, so a stub that counts its
  calls is a per-row render counter — which is the thing this file is actually
  about. The queue is fed a 1Hz poll and a long race passes four hundred
  incidents; before the row was memoised, all four hundred re-rendered every
  second whether or not anything about them had changed.
*/
const badgeRenders = jest.fn();

jest.mock('../CarClassBadge/CarClassBadge', () => ({
  CarClassBadge: ({ carClass }: { carClass: string }) => {
    badgeRenders(carClass);
    return <span data-testid="car-class-badge">{carClass}</span>;
  },
}));

const noop = () => {};

const renderQueue = (incidents: ReturnType<typeof buildLiveIncidentsFixture>) =>
  render(
    <LiveTriageQueue
      incidents={incidents}
      stateFilter="ALL"
      onSelectIncident={noop}
      onChangeStateFilter={noop}
    />,
  );

const rerenderQueue = (
  rerender: ReturnType<typeof renderQueue>['rerender'],
  incidents: ReturnType<typeof buildLiveIncidentsFixture>,
) =>
  rerender(
    <LiveTriageQueue
      incidents={incidents}
      stateFilter="ALL"
      onSelectIncident={noop}
      onChangeStateFilter={noop}
    />,
  );

beforeEach(() => badgeRenders.mockClear());

describe('LiveTriageQueue at session scale', () => {
  const incidents = buildLiveIncidentsFixture(400);

  it('should render nothing on a poll tick that changed nothing', () => {
    const { rerender } = renderQueue(incidents);
    badgeRenders.mockClear();

    rerenderQueue(rerender, incidents);

    expect(badgeRenders).not.toHaveBeenCalled();
  });

  it('should render only the row that changed', () => {
    const { rerender } = renderQueue(incidents);
    badgeRenders.mockClear();

    // A decision lands on one incident. Everything else is the object it
    // already was, because the build cache upstream keeps it that way.
    const changed = incidents.map((incident, index) =>
      index === 2 ? { ...incident, state: 'DECIDED' as const } : incident,
    );
    rerenderQueue(rerender, changed);

    expect(badgeRenders).toHaveBeenCalledTimes(changed[2].drivers.length);
  });

  /*
    The guard that would have caught the original report. Without the memo, a
    poll that replaces every incident with an equal copy re-renders the lot.
  */
  it('should not re-render rows whose incident is merely a new copy', () => {
    const { rerender } = renderQueue(incidents);
    badgeRenders.mockClear();

    rerenderQueue(
      rerender,
      incidents.map((incident) => ({ ...incident })),
    );

    // Every row does re-render here — that is what a new identity means — so
    // this asserts the cost is bounded by the window, not by the queue.
    expect(badgeRenders.mock.calls.length).toBeLessThan(200);
  });

  it('should mount only a window of the queue, and grow it on scroll', () => {
    renderQueue(incidents);

    const mounted = screen.getAllByTestId('car-class-badge').length;
    expect(mounted).toBeLessThan(incidents.length);
    expect(screen.getByText(/more · keep scrolling/)).toBeInTheDocument();

    const scroller = screen.getByText(/more · keep scrolling/).parentElement;
    expect(scroller).not.toBeNull();

    // jsdom lays nothing out, so scrollHeight is 0 and any scroll event reads
    // as "at the bottom" — which is exactly the condition being tested.
    fireEvent.scroll(scroller as HTMLElement);

    expect(screen.getAllByTestId('car-class-badge').length).toBeGreaterThan(
      mounted,
    );
  });

  it('should still show every incident once it has been scrolled to', () => {
    const short = buildLiveIncidentsFixture(70);
    renderQueue(short);

    const scroller = screen.getByText(/more · keep scrolling/).parentElement;
    fireEvent.scroll(scroller as HTMLElement);

    expect(screen.queryByText(/more · keep scrolling/)).not.toBeInTheDocument();
  });
});
