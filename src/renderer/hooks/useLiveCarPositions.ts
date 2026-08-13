import { useEffect, useRef, useState } from 'react';
import { CONSTANTS } from '@constants';
import { LiveCarPosition } from '@types';
import { sendMessage } from '../utils/postMessage';
import { useApi } from '../providers/ApiContext';
import { LiveStanding } from '../components/Live/liveFixtures';

/**
 * 5 Hz, because that is what the game publishes.
 *
 * `mPos` is a scoring field and LMU's scoring runs at ~5 Hz. Measured twice
 * against live sessions at Laguna Seca: a 193 ms median between distinct values
 * during the Step 8 spike, and **199 ms median (5.03 Hz, min 181, max 230) over
 * 301 samples in 10 s** on 2026-08-07, sampling `/rest/watch/standings` as fast
 * as it would answer. Polling faster returns the same numbers again; polling
 * slower throws samples away, which is what the 1 Hz path was doing.
 *
 * Note when re-measuring: pick a car that is demonstrably moving. Eleven of the
 * 38 cars in that session were sitting in the garage, and watching the first row
 * of the response — which is the leader by *classification* — reported 0 Hz.
 */
const POLL_INTERVAL_MS = 200;

export type LiveCarPositionMap = Map<number, LiveCarPosition>;

const NO_POSITIONS: LiveCarPositionMap = new Map();

/**
 * Every car's position at the game's own rate, keyed by slot.
 *
 * Separate from `useLiveSessionData` on purpose. That poll carries the whole
 * session — status, standings, and up to 500 retained incidents serialised every
 * tick — and raising it to 5 Hz would multiply that cost fivefold while still
 * delivering 1 Hz positions, because the sidecar emits no faster. This asks a
 * different channel that answers with a few hundred bytes.
 *
 * An error empties the map rather than leaving the last answer standing. A game
 * that has been closed must show no cars, not cars frozen where they were.
 */
export const useLiveCarPositions = (
  /** False when there is no live session, so nothing is requested at all. */
  enabled: boolean,
): LiveCarPositionMap => {
  const { subscribeToApiChannel } = useApi();
  const [positions, setPositions] = useState<LiveCarPositionMap>(NO_POSITIONS);

  /*
    Held in a ref for the same reason `useLiveTrackMap` does it: the effect
    should restart when the feed is switched on or off, not when a context
    callback happens to get a new identity. A provider handing down a fresh
    `subscribeToApiChannel` each render would otherwise tear this down and
    rebuild it five times a second.
  */
  const subscribe = useRef(subscribeToApiChannel);
  subscribe.current = subscribeToApiChannel;

  useEffect(() => {
    if (!enabled) {
      setPositions((previous) =>
        previous.size === 0 ? previous : NO_POSITIONS,
      );
      return undefined;
    }

    const unsubscribe = subscribe.current(
      CONSTANTS.API.GET_LIVE_CAR_POSITIONS,
      (payload: unknown) => {
        const response = payload as {
          status?: string;
          data?: LiveCarPosition[];
        };

        if (response?.status !== 'success' || !Array.isArray(response.data)) {
          setPositions((previous) =>
            previous.size === 0 ? previous : NO_POSITIONS,
          );
          return;
        }

        const next: LiveCarPositionMap = new Map();
        response.data.forEach((position) =>
          next.set(position.slotId, position),
        );
        setPositions(next);
      },
    );

    const poll = () => sendMessage(CONSTANTS.API.GET_LIVE_CAR_POSITIONS);
    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      clearInterval(id);
      unsubscribe?.();
    };
  }, [enabled]);

  return positions;
};

/**
 * The two rosters agree about who is in this slot.
 *
 * Compared loosely on whitespace and case only. Deliberately no fuzzier than
 * that: the whole point of the check is to notice a disagreement, and a matcher
 * generous enough to paper over one would defeat it.
 */
const namesAgree = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export interface MergedLiveStandings {
  standings: LiveStanding[];
  /** How many cars are being placed from the fast feed rather than the 1 Hz one. */
  fromFastFeed: number;
}

/**
 * The 1 Hz standings with the 5 Hz positions written over them, where the join
 * can be shown to be right.
 *
 * **The join is verified per car, not assumed.** REST rows and the sidecar are
 * two independent readers of the same scoring data, so a row's `driverName` has
 * to match the sidecar's for that slot before its coordinates are used.
 *
 * `slotID` was confirmed to be the sidecar's `mID` against a live 38-car field
 * (see `extractLiveCarPositions`), but that session's slots ran 0–37 contiguous,
 * where `mID` and an array index cannot be told apart. They diverge once a slot
 * is vacated — and if they ever do, the names disagree and every affected car
 * quietly keeps its 1 Hz position. A steppy marker in the right place beats a
 * smooth one in the wrong place, and this is a screen a steward uses to decide
 * where a car actually was.
 *
 * Returns the input array untouched when nothing matched, so a session with no
 * fast feed costs nothing downstream.
 */
export const mergeLiveCarPositions = (
  standings: LiveStanding[],
  positions: LiveCarPositionMap,
): MergedLiveStandings => {
  if (positions.size === 0) {
    return { standings, fromFastFeed: 0 };
  }

  let fromFastFeed = 0;

  const merged = standings.map((standing) => {
    if (standing.slotId === undefined) {
      return standing;
    }

    const position = positions.get(standing.slotId);
    if (!position || !namesAgree(position.driverName, standing.displayName)) {
      return standing;
    }

    fromFastFeed += 1;
    return { ...standing, posX: position.x, posZ: position.z };
  });

  return fromFastFeed === 0
    ? { standings, fromFastFeed: 0 }
    : { standings: merged, fromFastFeed };
};
