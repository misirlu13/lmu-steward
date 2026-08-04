import { LiveCaptureDriver, LivePressureBattle } from '@types';

/**
 * Pairs closer than this are worth a steward's attention. Beyond it the cars
 * are not interacting, and listing every gap on track would bury the ones that
 * matter under a full field of noise.
 */
export const PRESSURE_GAP_LIMIT_SECONDS = 2;

/**
 * A pair already on screen is kept until it reaches this, rather than dropping
 * the instant it passes the entry threshold.
 *
 * Without the hysteresis a car hovering either side of the limit flickers in
 * and out once a second, which reads as a broken panel rather than as a car
 * holding station.
 */
export const PRESSURE_GAP_RELEASE_SECONDS = 2.6;

/**
 * Time constant for smoothing closing speed.
 *
 * The raw difference is honest but unusable on its own: two cars a second apart
 * reach the same braking zone a second apart, so the instantaneous figure
 * swings tens of kph through every corner while the drivers are doing nothing
 * unusual. Three seconds is long enough to ride out a braking zone and short
 * enough that a genuine lunge still shows up while it matters.
 */
const CLOSING_SPEED_SMOOTHING_SECONDS = 3;

/** A pair unseen for this long is treated as new when it returns. */
const PAIR_HISTORY_TTL_MS = 10_000;

interface PairHistory {
  closingSpeedKph: number;
  at: number;
}

const pairHistory = new Map<string, PairHistory>();

/** Drops smoothing state; a new session must not inherit the old one's trends. */
export const resetLivePressureState = (): void => {
  pairHistory.clear();
};

const smoothClosingSpeed = (
  pairId: string,
  rawKph: number,
  now: number,
): { value: number; wasShown: boolean } => {
  const previous = pairHistory.get(pairId);
  const elapsedMs = previous ? now - previous.at : Number.POSITIVE_INFINITY;

  // Seeded rather than smoothed on first sight, so a battle appears with its
  // real closing speed instead of easing up from zero.
  if (!previous || elapsedMs > PAIR_HISTORY_TTL_MS) {
    pairHistory.set(pairId, { closingSpeedKph: rawKph, at: now });
    return { value: rawKph, wasShown: false };
  }

  // Time-based rather than per-call, so the smoothing does not change if the
  // renderer's poll rate does.
  const alpha =
    1 - Math.exp(-elapsedMs / 1000 / CLOSING_SPEED_SMOOTHING_SECONDS);
  const value =
    previous.closingSpeedKph + (rawKph - previous.closingSpeedKph) * alpha;

  pairHistory.set(pairId, { closingSpeedKph: value, at: now });
  return { value, wasShown: true };
};

/**
 * Below this the gap calculation stops meaning anything: a stationary or
 * crawling car divides by a speed near zero and produces an enormous gap, and
 * cars on an out-lap or in the pit lane are not racing each other anyway.
 */
const MIN_RACING_SPEED_KPH = 30;

const isRacing = (driver: LiveCaptureDriver): boolean =>
  !driver.inPits &&
  Number.isFinite(driver.lapDist) &&
  Number.isFinite(driver.speedKph) &&
  (driver.speedKph ?? 0) >= MIN_RACING_SPEED_KPH;

/**
 * Adjacent-car battles, ordered by how close they are.
 *
 * Cars are ordered by distance around the lap, not by classification, so this
 * is correct in practice and qualifying as well as a race. The field wraps: the
 * car nearest the start line is being caught by the car furthest around it.
 *
 * The gap is expressed as the time the car behind needs to cover the distance
 * at its current speed, which is what "half a second behind" means to a
 * steward. Closing speed is the difference in speed, smoothed over a few
 * seconds: the raw figure swings tens of kph every time the two cars reach a
 * braking zone a moment apart, which is an artefact of the gap rather than
 * anything either driver did.
 *
 * Not a pure function — it carries smoothing state per pair, so callers must
 * call it on a steady cadence and reset it between sessions.
 */
export const deriveLivePressureBattles = (
  drivers: LiveCaptureDriver[],
  trackLengthMetres: number,
  now: number = Date.now(),
): LivePressureBattle[] => {
  if (!Number.isFinite(trackLengthMetres) || trackLengthMetres <= 0) {
    return [];
  }

  const running = drivers.filter(isRacing);
  if (running.length < 2) {
    return [];
  }

  const byTrackPosition = [...running].sort(
    (a, b) => (a.lapDist ?? 0) - (b.lapDist ?? 0),
  );

  const battles: LivePressureBattle[] = [];

  byTrackPosition.forEach((behind, index) => {
    // Wrapping at the end of the array is the point: the leader of the sort is
    // being chased by the car at the far end of the lap, and dropping that pair
    // would hide every battle happening across the start line.
    const ahead = byTrackPosition[(index + 1) % byTrackPosition.length];
    if (ahead.slotId === behind.slotId) {
      return;
    }

    let gapMetres = (ahead.lapDist ?? 0) - (behind.lapDist ?? 0);
    if (gapMetres < 0) {
      gapMetres += trackLengthMetres;
    }

    const behindSpeedMps = (behind.speedKph ?? 0) / 3.6;
    if (behindSpeedMps <= 0) {
      return;
    }

    const gapSeconds = gapMetres / behindSpeedMps;
    if (!Number.isFinite(gapSeconds)) {
      return;
    }

    const pairId = `battle-${behind.slotId}-${ahead.slotId}`;
    const rawClosingKph = (behind.speedKph ?? 0) - (ahead.speedKph ?? 0);
    const { value: closingSpeedKph, wasShown } = smoothClosingSpeed(
      pairId,
      rawClosingKph,
      now,
    );

    // Wider limit for a pair already on screen than for one joining, so a car
    // sitting near the boundary stays put instead of blinking.
    const limit = wasShown
      ? PRESSURE_GAP_RELEASE_SECONDS
      : PRESSURE_GAP_LIMIT_SECONDS;
    if (gapSeconds > limit) {
      return;
    }

    battles.push({
      id: pairId,
      aheadSteamId: ahead.steamId,
      behindSteamId: behind.steamId,
      aheadSlotId: ahead.slotId,
      behindSlotId: behind.slotId,
      gapSeconds: Math.round(gapSeconds * 100) / 100,
      closingSpeedKph: Math.round(closingSpeedKph * 10) / 10,
      isTraffic: ahead.vehicleClass !== behind.vehicleClass,
    });
  });

  for (const [pairId, entry] of pairHistory) {
    if (now - entry.at > PAIR_HISTORY_TTL_MS) {
      pairHistory.delete(pairId);
    }
  }

  /*
    Ordered by gap, not by closing speed. Gap moves slowly and is the reason a
    pair is listed at all; closing speed is the volatile column, and sorting on
    it made rows jump position every second even when nothing on track changed.
  */
  return battles.sort((a, b) => a.gapSeconds - b.gapSeconds);
};
