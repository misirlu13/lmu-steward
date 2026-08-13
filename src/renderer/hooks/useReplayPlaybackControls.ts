import { sendMessage } from '@/renderer/utils/postMessage';
import { CONSTANTS } from '@constants';
import { useCallback, useState } from 'react';

export type ReplaySpeed = 0.5 | 1 | 2;
export type ReplayPlaybackDirection = 'forward' | 'reverse';

/** In ladder order, so a control can render them without repeating the list. */
export const REPLAY_SPEEDS: readonly ReplaySpeed[] = [0.5, 1, 2];

export const replaySpeedLabel: Record<ReplaySpeed, string> = {
  0.5: 'x0.5',
  1: 'x1.0',
  2: 'x2.0',
};

/**
 * The speed ladder, measured against the game rather than assumed.
 *
 * Verified live on 2026-08-08 by reading LMU's own playback readout back after
 * each command: `SLOW` → `0.5x`, `PLAY` → `1x`, `FORWARDSCAN` → `2x`. **None of
 * them is cumulative** — three `SLOW`s in a row still read `0.5x` and three
 * `FORWARDSCAN`s still read `2x` — which is why a speed is set by sending one
 * command for the wanted rung rather than by stepping towards it.
 *
 * Two rows because the replay view can also play backwards. The live footer
 * only ever uses the forward row: there is no reverse control on a bar whose
 * purpose is watching a contact that has just happened.
 */
const scanCommandBySpeed: Record<
  ReplayPlaybackDirection,
  Record<ReplaySpeed, string>
> = {
  forward: {
    0.5: CONSTANTS.REPLAY_COMMANDS.SCAN.SLOW,
    1: CONSTANTS.REPLAY_COMMANDS.SCAN.PLAY,
    2: CONSTANTS.REPLAY_COMMANDS.SCAN.FORWARD_SCAN,
  },
  reverse: {
    0.5: CONSTANTS.REPLAY_COMMANDS.SCAN.SLOW_BACKWARDS,
    1: CONSTANTS.REPLAY_COMMANDS.SCAN.PLAYBACK_BACKWARDS,
    2: CONSTANTS.REPLAY_COMMANDS.SCAN.REVERSE_SCAN,
  },
};

export const sendReplaySpeed = (
  speed: ReplaySpeed,
  direction: ReplayPlaybackDirection,
) =>
  sendMessage(
    CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
    scanCommandBySpeed[direction][speed],
  );

/**
 * Playback speed on its own, for a surface with no transport controls.
 *
 * The live footer has speed and nothing else: a live session's replay buffer is
 * scrubbed to a moment and watched, and pause/rewind belong to the replay view
 * where there is a timeline to move along. Lifted out so that footer and the
 * replay jump bar share one ladder — the same reason `useCameraControls` was
 * lifted out of `components/Replay/hooks` when the live camera bar needed it.
 *
 * LMU resets speed to 1x whenever the picture returns to the live edge, so a
 * caller that stays mounted across that transition has to put the ladder back
 * itself — see `resetSpeed`.
 */
export const useReplaySpeed = () => {
  const [speed, setSpeed] = useState<ReplaySpeed>(1);

  const onSpeedChange = (
    nextSpeed: ReplaySpeed,
    direction: ReplayPlaybackDirection = 'forward',
  ) => {
    setSpeed(nextSpeed);
    sendReplaySpeed(nextSpeed, direction);
  };

  /**
   * Puts the ladder back to 1x without telling the game anything.
   *
   * Deliberately silent. This is called when the game has *already* gone back
   * to the live edge and reset itself, so sending `PLAY` would be an unasked-for
   * playback command aimed at a live session. The state is being caught up to
   * the game, not the other way round.
   */
  const resetSpeed = useCallback(() => setSpeed(1), []);

  return { speed, onSpeedChange, resetSpeed };
};

/**
 * Full transport for the replay view: play, pause, direction and speed.
 *
 * Lived under `components/Replay/hooks` until the live footer needed the speed
 * half; the ladder above is now the one definition and this composes it.
 */
export const useReplayPlaybackControls = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const { speed, onSpeedChange: applySpeed } = useReplaySpeed();
  const [currentPlaybackDirection, setCurrentPlaybackDirection] =
    useState<ReplayPlaybackDirection>('forward');

  const playAt = (
    nextSpeed: ReplaySpeed,
    direction: ReplayPlaybackDirection,
  ) => {
    applySpeed(nextSpeed, direction);
    setCurrentPlaybackDirection(direction);
    setIsPlaying(true);
  };

  const onReverseBySpeed = () => playAt(speed, 'reverse');
  const onForwardBySpeed = () => playAt(speed, 'forward');

  const onPlayPause = () => {
    if (isPlaying) {
      sendMessage(
        CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
        CONSTANTS.REPLAY_COMMANDS.SCAN.STOP,
      );
      setIsPlaying(false);
      return;
    }

    playAt(speed, currentPlaybackDirection);
  };

  // Changing speed resumes playback in whichever direction was last used —
  // a steward reaching for x0.5 wants to watch, not to arm a setting.
  const onSpeedChange = (nextSpeed: ReplaySpeed) =>
    playAt(nextSpeed, currentPlaybackDirection);

  return {
    isPlaying,
    speed,
    onReverseBySpeed,
    onForwardBySpeed,
    onPlayPause,
    onSpeedChange,
  };
};
