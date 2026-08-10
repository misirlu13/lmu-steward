import {
  LiveCaptureCarEvidence,
  LiveCaptureDriver,
  LiveCaptureEvidence,
  LiveHeldDuration,
  LiveIncidentCarTrace,
  LiveIncidentContext,
  LiveIncidentFrame,
} from '@types';

/**
 * Turns a captured context window into the evidence a steward actually argues
 * about: who was closing on whom and how fast, who was ahead, who was off the
 * road, how long blue had been shown.
 *
 * Everything here is measurement, not judgement. Nothing in this module decides
 * fault — the dossier's job is to put the facts in front of the steward, and
 * the steward's job is to make the call.
 *
 * Sign and unit conventions are load-bearing and were checked against a real
 * capture; see live-incident-context.fixture.ts.
 */

/** LMU shows only green (0) and blue (6); confirmed live in a multiclass field. */
export const LMU_BLUE_FLAG = 6;

/**
 * Closing speed is read from just before impact, not at it — the contact itself
 * throws velocity around and would be measuring the crash rather than the
 * approach.
 */
const APPROACH_WINDOW_START = -0.5;
const APPROACH_WINDOW_END = -0.05;

/** Deceleration and brake application are read over the last second. */
const REACTION_WINDOW = -1.0;

/** Below this the pedal is being rested on, not used. */
const BRAKE_THRESHOLD = 0.1;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const subtract = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});

const magnitude = (v: Vec3): number =>
  Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const position = (frame: LiveIncidentFrame): Vec3 => ({
  x: frame.x,
  y: frame.y,
  z: frame.z,
});

const velocity = (frame: LiveIncidentFrame): Vec3 => ({
  x: frame.vx,
  y: frame.vy,
  z: frame.vz,
});

const MPS_TO_KPH = 3.6;

const median = (values: number[]): number | undefined => {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const nearestFrame = (
  frames: LiveIncidentFrame[],
  t: number,
): LiveIncidentFrame | undefined => {
  let best: LiveIncidentFrame | undefined;
  let bestDelta = Infinity;

  frames.forEach((frame) => {
    const delta = Math.abs(frame.t - t);
    if (delta < bestDelta) {
      best = frame;
      bestDelta = delta;
    }
  });

  return best;
};

const framesWithin = (
  frames: LiveIncidentFrame[],
  from: number,
  to: number,
): LiveIncidentFrame[] =>
  frames.filter((frame) => frame.t >= from && frame.t <= to);

/**
 * Lap distance wraps at the start/finish line, so a car 20m ahead of another
 * that has just crossed reads as a whole lap behind unless the difference is
 * folded back into +/- half a lap.
 */
export const lapDistanceDelta = (
  aheadCandidate: number,
  other: number,
  trackLength: number,
): number => {
  let delta = aheadCandidate - other;
  if (!Number.isFinite(trackLength) || trackLength <= 0) {
    return delta;
  }
  while (delta > trackLength / 2) {
    delta -= trackLength;
  }
  while (delta < -trackLength / 2) {
    delta += trackLength;
  }
  return delta;
};

/** LMU reports 0 = sector 3, 1 = sector 1, 2 = sector 2. Don't ask why. */
const sectorNumber = (raw: number): number | undefined => {
  if (raw === 0) {
    return 3;
  }
  if (raw === 1 || raw === 2) {
    return raw;
  }
  return undefined;
};

const withThousands = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * LMU exposes no corner names, so saying "T4" would be an invention. Sector
 * plus distance around the lap is what the data actually supports.
 */
export const trackPositionLabel = (
  frame: LiveIncidentFrame | undefined,
  trackLength: number,
): string | undefined => {
  if (!frame) {
    return undefined;
  }

  const parts: string[] = [];
  const sector = sectorNumber(frame.sector);
  if (sector !== undefined) {
    parts.push(`Sector ${sector}`);
  }

  if (Number.isFinite(trackLength) && trackLength > 0) {
    const percent = Math.round((frame.lapDist / trackLength) * 100);
    parts.push(`${withThousands(frame.lapDist)} m (${percent}% of lap)`);
  } else {
    parts.push(`${withThousands(frame.lapDist)} m`);
  }

  return parts.join(' · ');
};

/**
 * The car is off the racing surface when it is further from the centre path
 * than the track edge. Both are signed to the car's own side of the path, so
 * the comparison has to be on magnitude.
 */
const isOffTrack = (frame: LiveIncidentFrame): boolean =>
  Math.abs(frame.trackEdge) > 0 &&
  Math.abs(frame.pathLateral) > Math.abs(frame.trackEdge);

/**
 * How long a per-frame condition had held continuously up to contact. Returns
 * undefined when it was not true at contact at all.
 *
 * A condition still true at the oldest captured frame is reported as truncated:
 * the window ran out before the condition did, so the figure is a floor. A blue
 * flag shown for thirty seconds would otherwise read as however long we
 * happened to be recording.
 */
const heldFor = (
  frames: LiveIncidentFrame[],
  holds: (frame: LiveIncidentFrame) => boolean,
): LiveHeldDuration | undefined => {
  const upToContact = frames.filter((frame) => frame.t <= 0);
  if (upToContact.length === 0 || !holds(upToContact[upToContact.length - 1])) {
    return undefined;
  }

  let index = upToContact.length - 1;
  while (index > 0 && holds(upToContact[index - 1])) {
    index -= 1;
  }

  return {
    seconds: Math.max(0, -upToContact[index].t),
    truncated: index === 0,
  };
};

const peakDeceleration = (frames: LiveIncidentFrame[]): number | undefined => {
  const window = framesWithin(frames, REACTION_WINDOW, 0);
  let peak: number | undefined;

  for (let index = 1; index < window.length; index += 1) {
    const dt = window[index].t - window[index - 1].t;
    if (dt <= 0) {
      continue;
    }
    const decel = (window[index - 1].speed - window[index].speed) / dt;
    if (decel > 0 && (peak === undefined || decel > peak)) {
      peak = decel;
    }
  }

  return peak;
};

const deriveCarEvidence = (
  car: LiveIncidentCarTrace,
): LiveCaptureCarEvidence => {
  const contact = nearestFrame(car.frames, 0);

  const peakYaw = car.frames.reduce<number | undefined>((peak, frame) => {
    const value = Math.abs(frame.yaw);
    return peak === undefined || value > peak ? value : peak;
  }, undefined);

  return {
    slotId: car.slotId,
    speedKph: contact ? contact.speed * MPS_TO_KPH : undefined,
    peakDecelMps2: peakDeceleration(car.frames),
    brakeApplied: heldFor(car.frames, (frame) => frame.brake > BRAKE_THRESHOLD),
    blueFlagShown: heldFor(car.frames, (frame) => frame.flag === LMU_BLUE_FLAG),
    peakYawRateDegPerSec: peakYaw,
    offTrack: contact ? isOffTrack(contact) : undefined,
  };
};

/**
 * Rate at which the gap between two cars was shrinking, in kph.
 *
 * Taken as the median over the approach window rather than a single sample, so
 * one noisy frame cannot manufacture a headline number.
 */
export const deriveClosingSpeedKph = (
  a: LiveIncidentCarTrace,
  b: LiveIncidentCarTrace,
): number | undefined => {
  const window = framesWithin(
    a.frames,
    APPROACH_WINDOW_START,
    APPROACH_WINDOW_END,
  );

  const rates = window
    .map((frameA) => {
      const frameB = nearestFrame(b.frames, frameA.t);
      if (!frameB) {
        return undefined;
      }

      const separation = subtract(position(frameB), position(frameA));
      const distance = magnitude(separation);
      if (distance < 1e-6) {
        return undefined;
      }

      const unit = {
        x: separation.x / distance,
        y: separation.y / distance,
        z: separation.z / distance,
      };

      // Positive when the gap is shrinking.
      return dot(subtract(velocity(frameA), velocity(frameB)), unit);
    })
    .filter((rate): rate is number => rate !== undefined);

  const value = median(rates);
  return value === undefined ? undefined : value * MPS_TO_KPH;
};

export const deriveIncidentEvidence = (
  context: LiveIncidentContext,
  drivers: LiveCaptureDriver[],
): LiveCaptureEvidence => {
  const bySlot = new Map<number, LiveCaptureDriver>();
  drivers.forEach((driver) => bySlot.set(driver.slotId, driver));

  const cars = context.cars.filter((car) => car.frames.length > 0);
  const carEvidence = cars.map(deriveCarEvidence);

  const offTrackSlotIds = carEvidence
    .filter((car) => car.offTrack)
    .map((car) => car.slotId);

  const contactFrames = cars.map((car) => ({
    slotId: car.slotId,
    frame: nearestFrame(car.frames, 0),
  }));

  const evidence: LiveCaptureEvidence = {
    offTrackSlotIds,
    cars: carEvidence,
    trackPositionLabel: trackPositionLabel(
      contactFrames[0]?.frame,
      context.trackLength,
    ),
  };

  if (cars.length < 2) {
    return evidence;
  }

  const [first, second] = cars;
  evidence.closingSpeedKph = deriveClosingSpeedKph(first, second);

  const firstFrame = contactFrames[0].frame;
  const secondFrame = contactFrames[1].frame;
  if (firstFrame && secondFrame) {
    const delta = lapDistanceDelta(
      firstFrame.lapDist,
      secondFrame.lapDist,
      context.trackLength,
    );
    if (delta !== 0) {
      evidence.aheadSlotId = delta > 0 ? first.slotId : second.slotId;
    }
  }

  const firstClass = bySlot.get(first.slotId)?.vehicleClass;
  const secondClass = bySlot.get(second.slotId)?.vehicleClass;
  if (firstClass && secondClass) {
    evidence.isTrafficIncident = firstClass !== secondClass;
  }

  return evidence;
};
