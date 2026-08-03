import { LiveCaptureIncident, LiveIncidentKind, LiveIncidentParty } from '@types';

/**
 * Parses the raw result-stream elements LMU publishes into structured incidents.
 *
 * Formats confirmed against live sessions (see docs/live-capture-investigation.md):
 *
 *   <Incident et="114.8">Bradley Drake(0) reported contact (5004.90) with another vehicle Robert Kubica(15)</Incident>
 *   <Incident et="66.1">Bradley Drake(0) reported contact (8954.12) with Immovable</Incident>
 *   <TrackLimits Driver="Bradley Drake" ID="0" Lap="0" WarningPoints="23.75" CurrentPoints="23.75" Resolution="5" et="25.7">Invalid Lap Cut Track</TrackLimits>
 *
 * Note that a car-to-car collision produces two <Incident> elements, one from
 * each driver's perspective. The sidecar flags the second as a mirror; this
 * parser only ever sees the surviving one.
 */

const attribute = (raw: string, name: string): string | undefined => {
  const match = raw.match(new RegExp(`${name}="([^"]*)"`));
  return match ? match[1] : undefined;
};

const numericAttribute = (raw: string, name: string): number | undefined => {
  const value = attribute(raw, name);
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const elementText = (raw: string): string => {
  const match = raw.match(/>([^<]*)</);
  return match ? match[1].trim() : '';
};

/** "Bradley Drake(0)" -> { displayName: 'Bradley Drake', slotId: 0 } */
const parseParty = (text: string): LiveIncidentParty => {
  const match = text.match(/^(.*)\((\d+)\)\s*$/);
  if (!match) {
    return { displayName: text.trim() };
  }

  return { displayName: match[1].trim(), slotId: Number(match[2]) };
};

const parseContact = (raw: string, etSeconds: number, id: string): LiveCaptureIncident => {
  const body = elementText(raw);
  const parties: LiveIncidentParty[] = [];
  let objectStruck: string | undefined;
  let magnitude: number | undefined;

  const reported = body.match(/^(.*?) reported contact \(([\d.]+)\) with (.+)$/);
  if (reported) {
    parties.push(parseParty(reported[1]));
    magnitude = Number(reported[2]);

    const target = reported[3].trim();
    const otherVehicle = target.match(/^another vehicle (.+)$/);
    if (otherVehicle) {
      objectStruck = 'another vehicle';
      parties.push(parseParty(otherVehicle[1]));
    } else {
      objectStruck = target;
    }
  }

  return {
    id,
    kind: 'incident',
    etSeconds,
    raw,
    parties,
    objectStruck,
    magnitude: Number.isFinite(magnitude) ? magnitude : undefined,
  };
};

const parseTrackLimits = (raw: string, etSeconds: number, id: string): LiveCaptureIncident => {
  const driver = attribute(raw, 'Driver');
  const slotId = numericAttribute(raw, 'ID');

  return {
    id,
    kind: 'track-limits',
    etSeconds,
    raw,
    parties: driver ? [{ displayName: driver, slotId }] : [],
    warningPoints: numericAttribute(raw, 'WarningPoints'),
    currentPoints: numericAttribute(raw, 'CurrentPoints'),
    resolution: elementText(raw) || attribute(raw, 'Resolution'),
    lap: numericAttribute(raw, 'Lap'),
  };
};

export const parseStewardEvent = (
  raw: string,
  kind: LiveIncidentKind,
  etSeconds: number,
  id: string,
): LiveCaptureIncident => {
  if (kind === 'track-limits') {
    return parseTrackLimits(raw, etSeconds, id);
  }

  if (kind === 'incident') {
    return parseContact(raw, etSeconds, id);
  }

  return { id, kind, etSeconds, raw, parties: [] };
};

/**
 * A solo contact — a wall, a cone, a sign — is shaped identically to car-to-car
 * contact but is rarely stewardable. Callers use this to de-prioritise rather
 * than discard, since a solo spin can still matter (blocking, unsafe rejoin).
 */
export const isSoloIncident = (incident: LiveCaptureIncident): boolean =>
  incident.kind === 'incident' &&
  incident.objectStruck !== undefined &&
  incident.objectStruck !== 'another vehicle';
