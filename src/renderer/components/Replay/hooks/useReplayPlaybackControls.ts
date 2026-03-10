import { sendMessage } from '@/renderer/utils/postMessage';
import { CONSTANTS } from '@constants';
import { useState } from 'react';

export const useReplayPlaybackControls = () => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [currentPlaybackDirection, setCurrentPlaybackDirection] = useState<
    'forward' | 'reverse'
  >('forward');

  const onReverseScan = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.REVERSE_SCAN,
    );
    setCurrentPlaybackDirection('reverse');
    setIsPlaying(true);
  };

  const onReverse = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.PLAYBACK_BACKWARDS,
    );
    setCurrentPlaybackDirection('reverse');
    setIsPlaying(true);
  };

  const onReverseSlow = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.SLOW_BACKWARDS,
    );
    setCurrentPlaybackDirection('reverse');
    setIsPlaying(true);
  };

  const onForwardScan = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.FORWARD_SCAN,
    );
    setCurrentPlaybackDirection('forward');
    setIsPlaying(true);
  };

  const onForward = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.PLAY,
    );
    setCurrentPlaybackDirection('forward');
    setIsPlaying(true);
  };

  const onForwardSlow = () => {
    sendMessage(
      CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
      CONSTANTS.REPLAY_COMMANDS.SCAN.SLOW,
    );
    setCurrentPlaybackDirection('forward');
    setIsPlaying(true);
  };

  const onReverseBySpeed = () => {
    if (speed === 0.5) {
      onReverseSlow();
      return;
    }
    if (speed === 1) {
      onReverse();
      return;
    }
    onReverseScan();
  };

  const onForwardBySpeed = () => {
    if (speed === 0.5) {
      onForwardSlow();
      return;
    }
    if (speed === 1) {
      onForward();
      return;
    }
    onForwardScan();
  };

  const onPlayPause = () => {
    if (isPlaying) {
      sendMessage(
        CONSTANTS.API.PUT_REPLAY_COMMAND_SCAN,
        CONSTANTS.REPLAY_COMMANDS.SCAN.STOP,
      );
      setIsPlaying(false);
    } else {
      if (currentPlaybackDirection === 'reverse') {
        onReverseBySpeed();
        return;
      }
      onForwardBySpeed();
      return;
    }
  };

  const onSpeedChange = (nextSpeed: 0.5 | 1 | 2) => {
    setSpeed(nextSpeed);
    if (currentPlaybackDirection === 'reverse') {
      if (nextSpeed === 0.5) {
        onReverseSlow();
        return;
      }
      if (nextSpeed === 1) {
        onReverse();
        return;
      }
      onReverseScan();
      return;
    }

    if (nextSpeed === 0.5) {
      onForwardSlow();
      return;
    }
    if (nextSpeed === 1) {
      onForward();
      return;
    }
    onForwardScan();
  };

  return {
    isPlaying,
    speed,
    onReverseBySpeed,
    onForwardBySpeed,
    onPlayPause,
    onSpeedChange,
  };
};
