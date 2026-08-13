import React from 'react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { CONSTANTS } from '@constants';
import { LMUReplay } from '@types';
import { LoadedReplayBar } from './LoadedReplayBar';
import { useApi } from '../../providers/ApiContext';
import { sendMessage } from '../../utils/postMessage';

jest.mock('../../providers/ApiContext', () => ({ useApi: jest.fn() }));
jest.mock('../../utils/postMessage', () => ({ sendMessage: jest.fn() }));

const useApiMock = useApi as jest.MockedFunction<typeof useApi>;
const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;

const REPLAY = {
  hash: 'hash-p1-7',
  replayName: 'Laguna Seca P1 7',
  timestamp: 1785798030,
  metadata: {
    sceneDesc: 'WeatherTech Raceway Laguna Seca',
    session: 'PRACTICE',
  },
} as unknown as LMUReplay;

const setGame = (
  currentReplay: LMUReplay | null,
  isReplayActive: boolean | null,
) =>
  useApiMock.mockReturnValue({
    currentReplay,
    isReplayActive,
  } as unknown as ReturnType<typeof useApi>);

/** The bar, plus somewhere for its "back to replay" button to land. */
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LoadedReplayBar />
      <Routes>
        <Route path="/" element={<div>driver dashboard</div>} />
        <Route path="/captured-sessions" element={<div>captured</div>} />
        <Route path="/replay/:replayHash" element={<div>replay view</div>} />
      </Routes>
    </MemoryRouter>,
  );

const bar = () => screen.queryByLabelText('Replay still loaded');

beforeEach(() => {
  jest.clearAllMocks();
  setGame(REPLAY, true);
});

/*
  Loading a replay takes over the game, and the game keeps showing it whatever
  screen this app is on. Walking away used to strand the steward: the replay ran
  on, nothing in the app led back to it, and the next replay would not load
  because one already was.
*/
describe('the loaded replay bar', () => {
  it('should offer the way back from another view', () => {
    renderAt('/captured-sessions');

    expect(bar()).toBeInTheDocument();
  });

  it('should take the steward back to the replay it names', () => {
    renderAt('/');

    fireEvent.click(screen.getByRole('button', { name: 'Back to replay' }));

    expect(screen.getByText('replay view')).toBeInTheDocument();
  });

  it('should close the replay in the game on request', () => {
    renderAt('/');

    // By its text, not its role name: MUI relabels a tooltipped button with the
    // tooltip's own sentence.
    fireEvent.click(screen.getByText('Close replay'));

    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.POST_CLOSE_REPLAY,
    );
  });

  // The view it points at. A bar offering to take you where you already are is
  // furniture.
  it('should stay out of the replay view', () => {
    renderAt('/replay/hash-p1-7');

    expect(bar()).not.toBeInTheDocument();
  });

  /*
    Both conditions, not either. The game's own stop button is not something
    this app hears about, so the bar follows what the game says it is doing.
  */
  it('should go when the game is no longer showing a replay', () => {
    setGame(REPLAY, false);
    renderAt('/');

    expect(bar()).not.toBeInTheDocument();
  });

  // A rewound live session is not a loaded replay, and has nowhere to go back
  // to.
  it('should not appear for a rewound picture with no replay behind it', () => {
    setGame(null, true);
    renderAt('/');

    expect(bar()).not.toBeInTheDocument();
  });

  it('should not appear while contact with the game is unknown', () => {
    setGame(REPLAY, null);
    renderAt('/');

    expect(bar()).not.toBeInTheDocument();
  });
});
