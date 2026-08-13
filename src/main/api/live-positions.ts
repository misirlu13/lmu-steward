import { CONSTANTS } from '@constants';
import { LiveCarPosition } from '@types';

/**
 * One row of `/rest/watch/standings`, narrowed to what a position feed needs.
 *
 * The full row carries about sixty fields and the whole response is 71 KB at a
 * 38-car grid. Everything below throws all of that away before it reaches the
 * renderer.
 */
/**
 * Measured against the live 38-car session on 2026-08-07:
 *
 * | | |
 * | --- | --- |
 * | Response | 70,926 bytes |
 * | After this reduction | 2,407 bytes — **29.5×** |
 * | Across IPC at 5 Hz | 11.8 KB/s, against 346 KB/s unreduced |
 * | Endpoint latency | 2.5 ms p50, 3.6 ms p90 over 301 samples |
 *
 * All 38 cars came through with a position and a name.
 */
interface StandingsRow {
  slotID?: unknown;
  driverName?: unknown;
  carPosition?: { x?: unknown; z?: unknown } | null;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * `{ slotId, driverName, x, z }` for every car the response places.
 *
 * **The join is on `slotID`, and it is checked downstream rather than trusted.**
 * The REST row carries three plausible keys and only one of them can be used:
 *
 * - `carNumber` reads the empty string for every car in the sampled responses,
 *   and the app's own `toCarNumber` falls back to the slot id when a vehicle
 *   name carries no `#` — so car numbers are not even guaranteed unique against
 *   slot ids, let alone a key.
 * - `carId` identifies the *car*, not the entry: in the response captured in
 *   `session.ts`, `53d856…` appears on four separate drivers, all in the same
 *   Proton #911.
 * - `slotID` is the same quantity the sidecar emits as `slotId`, which is
 *   `VehicleScoringInfoV01::mID`.
 *
 * **That last equivalence is confirmed live** — a 38-car ELMS practice session at
 * Laguna Seca, 2026-08-07. The sidecar's diagnostic mode prints `mID` directly,
 * and twelve slots cross-checked against the REST rows (1–6, 16, 24, 25, 27, 30,
 * 31) carried the same driver in both, with no mismatches.
 *
 * It is still checked rather than trusted, because that session could not
 * distinguish the two candidates: its slots ran 0–37 contiguous, where `mID` and
 * an array index are the same number. They diverge only once a slot is vacated.
 * So `driverName` is carried along and the renderer refuses any row whose name
 * disagrees with the sidecar's for that slot — the two are independent readers
 * of the same scoring data, and a disagreement is the join being wrong.
 *
 * A row missing either coordinate is dropped rather than defaulted. A car with
 * no position is not a car at the origin.
 */
export const extractLiveCarPositions = (data: unknown): LiveCarPosition[] => {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.reduce<LiveCarPosition[]>((positions, entry) => {
    const row = entry as StandingsRow | null;
    const slotId = row?.slotID;
    const position = row?.carPosition;

    if (
      !isFiniteNumber(slotId) ||
      !position ||
      !isFiniteNumber(position.x) ||
      !isFiniteNumber(position.z)
    ) {
      return positions;
    }

    positions.push({
      slotId,
      driverName: typeof row?.driverName === 'string' ? row.driverName : '',
      /*
        Rounded to a tenth of a metre, matching what the sidecar emits for the
        same quantity (`%.1f`). The track map's world span is ~800 m across a
        1,000-unit viewBox, so a tenth of a metre is an eighth of an SVG unit —
        far below the width of a marker, and it keeps the payload small enough
        that 5 Hz costs less than the 1 Hz feed it sits beside.
      */
      x: Math.round(position.x * 10) / 10,
      z: Math.round(position.z * 10) / 10,
    });

    return positions;
  }, []);
};

/**
 * GET `/rest/watch/standings`, reduced to positions.
 *
 * Pull-driven, like every other channel here, and deliberately so. Main could
 * run its own 5 Hz timer and push, but that is what the current staleness is
 * made of: the sidecar's 1 Hz emit and the renderer's 1 Hz poll are two
 * *unsynchronised* timers, so a position can be up to two seconds old. Answering
 * the renderer's request from a fresh fetch — 4 ms p50, 5 ms p90 — leaves the
 * game's own ~5 Hz publication as the only staleness in the path.
 *
 * An error clears the feed rather than leaving the last answer in place. A game
 * that has closed must show no positions, never stale ones.
 */
export const getLiveCarPositions = async (event: Electron.IpcMainEvent) => {
  try {
    const response = await fetch(
      `${CONSTANTS.LMU_API_BASE_URL}/rest/watch/standings`,
    );
    if (!response.ok) {
      event.reply(CONSTANTS.API.GET_LIVE_CAR_POSITIONS, {
        status: 'error',
        message: `API responded with status ${response.status}`,
      });
      return;
    }

    event.reply(CONSTANTS.API.GET_LIVE_CAR_POSITIONS, {
      status: 'success',
      data: extractLiveCarPositions(await response.json()),
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.GET_LIVE_CAR_POSITIONS, {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
