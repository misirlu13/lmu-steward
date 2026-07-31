import { open } from 'fs/promises';
import { SessionType } from '@types';

/**
 * Reader for the metadata LMU writes into every .Vcr replay file.
 *
 * A replay carries its own identity — track, session, the content it needs, and
 * the drivers who were on track. That matters for import: a .Vcr copied from
 * another PC has to be identified before LMU has ever seen it, and its file
 * timestamps cannot be trusted (a copy resets creation time, and some transfer
 * paths rewrite modified time too).
 *
 * Layout, verified against real replays:
 *
 *   0x2c  magic "\nIRSR"
 *   0x35  uint32le, absolute offset of the metadata trailer
 *
 * Two header formats are known, distinguished by the byte at 0x31. Both share
 * this trailer layout; they differ only in the first field. Format 7 carries
 * just the scene and session, while format 8 wraps them in an object naming the
 * official event:
 *
 *   {"eventId":"…","eventTitle":"LMGT3 Sprint Cup","eventType":"daily",
 *    "sceneDesc":"LAGUNASECA","seriesId":"…","session":"RACE","splitNo":3}
 *
 * The trailer is a run of uint32le length-prefixed strings:
 *
 *   {"sceneDesc":"MONZAWEC","session":"RACE"}   (format 7)
 *   MONZAWEC.SCN
 *   MONZAWEC.AIW
 *   Monza_2023          track folder
 *   1.27                track version
 *   8cd7325da1ec...     track content hash
 *   E:\...\Monza_2023\1.27\   install path on the machine that recorded it
 *
 * followed by a driver count and one entry per driver. Entries use uint8 length
 * prefixes:
 *
 *   [name][vehicleId][contentId][teamName][carNumber] <fixed binary run>
 *
 * `contentId` is present but empty for base content, and 24 characters for DLC
 * and league liveries. It is a field, not a separator — reading its zero length
 * byte as padding desynchronises every entry after the first DLC car.
 *
 * `teamName` usually matches the driver's name, because league entries tend to
 * be one team per driver, but that is a property of the data rather than of the
 * format: a solo player on base content gets the manufacturer instead.
 *
 * Only a few KB from each end of the file are ever read, so this stays cheap on
 * a 400 MB replay.
 */

const MAGIC_OFFSET = 0x2c;
const MAGIC = Buffer.from([0x0a, 0x49, 0x52, 0x53, 0x52]); // "\nIRSR"
const TRAILER_POINTER_OFFSET = 0x35;
const HEADER_READ_LENGTH = 0x40;

/** The trailer sits within a few KB of EOF; this is generous headroom. */
const TRAILER_SCAN_LENGTH = 8 * 1024 * 1024;

const METADATA_BLOB_KEY = '"sceneDesc"';
const TRAILER_FIELD_COUNT = 7;

/** A corrupt length prefix must not turn into a multi-GB allocation. */
const MAX_FIELD_LENGTH = 4096;
const MAX_DRIVERS = 256;

/** How far past the string fields to look for the driver count. */
const DRIVER_COUNT_SEARCH_WINDOW = 256;

/** How far past one driver entry to look for the next. */
const DRIVER_ENTRY_SEARCH_WINDOW = 96;

export interface VcrDriver {
  name: string;
  vehicleId: string;
  /** Empty for base content; a 24-character id for DLC and league liveries. */
  contentId: string;
  /**
   * Often identical to the driver's name, because league entries are usually
   * one team per driver — but not reliably so. A solo player on base content
   * gets the manufacturer instead ("Porsche").
   */
  teamName: string;
  carNumber: string;
}

export interface VcrTrailer {
  sceneDesc: string;
  session: SessionType;
  /**
   * Present on format 8 replays from official events. A steward reviewing a
   * hand-off can see which event and split it came from.
   */
  eventTitle?: string;
  eventType?: string;
  splitNo?: number;
  trackScene: string;
  trackAiw: string;
  trackFolder: string;
  trackVersion: string;
  trackContentHash: string;
  originInstallPath: string;
  drivers: VcrDriver[];
}

const SESSION_TYPES: readonly string[] = ['RACE', 'QUALIFY', 'PRACTICE'];

const isPrintableAscii = (value: string): boolean =>
  value.length > 0 && /^[\x20-\x7e]+$/.test(value);

/** Reads a uint32le length-prefixed string, or null if the prefix is unusable. */
const readLengthPrefixedString = (
  buffer: Buffer,
  offset: number,
): { value: string; next: number } | null => {
  if (offset < 0 || offset + 4 > buffer.length) {
    return null;
  }

  const length = buffer.readUInt32LE(offset);
  if (length <= 0 || length > MAX_FIELD_LENGTH) {
    return null;
  }

  const end = offset + 4 + length;
  if (end > buffer.length) {
    return null;
  }

  const value = buffer.subarray(offset + 4, end).toString('latin1');
  return isPrintableAscii(value) ? { value, next: end } : null;
};

/**
 * Reads a uint8 length-prefixed string, as used by the driver entries.
 *
 * `allowEmpty` matters: a zero length is a real, present-but-empty field, not a
 * failure. Cars from base content carry an empty content id where DLC cars
 * carry a 24-character one, and treating that zero byte as a separator rather
 * than a field desynchronises the rest of the roster.
 */
const readBytePrefixedString = (
  buffer: Buffer,
  offset: number,
  allowEmpty = false,
): { value: string; next: number } | null => {
  if (offset < 0 || offset >= buffer.length) {
    return null;
  }

  const length = buffer[offset];
  const end = offset + 1 + length;
  if (end > buffer.length) {
    return null;
  }

  if (length === 0) {
    return allowEmpty ? { value: '', next: end } : null;
  }

  const value = buffer.subarray(offset + 1, end).toString('latin1');
  return isPrintableAscii(value) ? { value, next: end } : null;
};

/** Vehicle ids are alphanumeric with underscores — never spaces. */
const VEHICLE_ID_PATTERN = /^[A-Za-z0-9_]+$/;
const CONTENT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const CAR_NUMBER_PATTERN = /^[A-Za-z0-9#+-]{1,5}$/;

/**
 * Reads one driver entry: name, vehicle id, content id, team name, car number.
 *
 * Alignment is verified by the shape of the fields rather than by any of them
 * matching each other. Vehicle ids and car numbers have narrow, checkable forms,
 * and a misaligned read fails them almost immediately.
 */
const readDriverEntry = (
  buffer: Buffer,
  offset: number,
): { driver: VcrDriver; next: number } | null => {
  const name = readBytePrefixedString(buffer, offset);
  if (!name) {
    return null;
  }

  const vehicleId = readBytePrefixedString(buffer, name.next);
  if (!vehicleId || !VEHICLE_ID_PATTERN.test(vehicleId.value)) {
    return null;
  }

  const contentId = readBytePrefixedString(buffer, vehicleId.next, true);
  if (
    !contentId ||
    (contentId.value !== '' && !CONTENT_ID_PATTERN.test(contentId.value))
  ) {
    return null;
  }

  const teamName = readBytePrefixedString(buffer, contentId.next);
  if (!teamName) {
    return null;
  }

  const carNumber = readBytePrefixedString(buffer, teamName.next);
  if (!carNumber || !CAR_NUMBER_PATTERN.test(carNumber.value)) {
    return null;
  }

  return {
    driver: {
      name: name.value,
      vehicleId: vehicleId.value,
      contentId: contentId.value,
      teamName: teamName.value,
      carNumber: carNumber.value,
    },
    next: carNumber.next,
  };
};

/**
 * Walks `count` driver entries from `offset`, skipping the fixed binary run
 * between them. Returns null on the first entry that will not parse, so a wrong
 * starting offset is rejected rather than half-read.
 */
const readDriverEntries = (
  buffer: Buffer,
  offset: number,
  count: number,
): VcrDriver[] | null => {
  const drivers: VcrDriver[] = [];
  let cursor = offset;

  for (let index = 0; index < count; index += 1) {
    const entry = readDriverEntry(buffer, cursor);
    if (!entry) {
      return null;
    }

    drivers.push(entry.driver);

    if (index === count - 1) {
      break;
    }

    let nextOffset = -1;
    for (let probe = 0; probe < DRIVER_ENTRY_SEARCH_WINDOW; probe += 1) {
      if (readDriverEntry(buffer, entry.next + probe)) {
        nextOffset = entry.next + probe;
        break;
      }
    }

    if (nextOffset === -1) {
      return null;
    }

    cursor = nextOffset;
  }

  return drivers.length === count ? drivers : null;
};

/**
 * Finds the driver roster. The count is a uint32le somewhere in the binary run
 * after the string fields; rather than hardcode an offset that may shift between
 * game versions, look for a plausible count that is actually followed by that
 * many parseable entries.
 */
const readDrivers = (buffer: Buffer, fieldsEnd: number): VcrDriver[] => {
  const limit = Math.min(fieldsEnd + DRIVER_COUNT_SEARCH_WINDOW, buffer.length);

  for (let offset = fieldsEnd; offset + 4 <= limit; offset += 1) {
    const count = buffer.readUInt32LE(offset);
    if (count <= 0 || count > MAX_DRIVERS) {
      continue;
    }

    // The entries start immediately after the count, give or take a separator.
    for (const skip of [4, 5, 8]) {
      const drivers = readDriverEntries(buffer, offset + skip, count);
      if (drivers) {
        return drivers;
      }
    }
  }

  return [];
};

export interface VcrEventMetadata {
  sceneDesc: string;
  session: SessionType;
  /** Present on official-event replays: "LMGT3 Sprint Cup", "daily", split 3. */
  eventTitle?: string;
  eventType?: string;
  splitNo?: number;
}

/**
 * Reads the metadata blob.
 *
 * Keys are looked up rather than the string being pattern-matched, because the
 * blob's shape has already changed once. Format 7 carries only
 * `{"sceneDesc":…,"session":…}`; format 8 wraps the same two values in a much
 * larger object describing the official event, with `sceneDesc` no longer
 * first. Anything carrying both keys is accepted, whatever else is alongside
 * them and in whatever order.
 */
const parseMetadataBlob = (blob: string): VcrEventMetadata | null => {
  try {
    const parsed = JSON.parse(blob) as Record<string, unknown>;
    const sceneDesc = String(parsed.sceneDesc ?? '').trim();
    const session = String(parsed.session ?? '')
      .trim()
      .toUpperCase();

    if (!sceneDesc || !SESSION_TYPES.includes(session)) {
      return null;
    }

    const splitNo = Number(parsed.splitNo);

    return {
      sceneDesc,
      session: session as SessionType,
      eventTitle: parsed.eventTitle ? String(parsed.eventTitle) : undefined,
      eventType: parsed.eventType ? String(parsed.eventType) : undefined,
      splitNo: Number.isFinite(splitNo) ? splitNo : undefined,
    };
  } catch {
    return null;
  }
};

/**
 * Resolves where the trailer starts.
 *
 * The header pointer is authoritative and correct in both known formats. The
 * scan behind it looks for the `"sceneDesc"` key rather than the start of the
 * blob, because format 8 opens with `{"eventId":…` — anchoring on the opening
 * brace would only ever have found format 7.
 */
const resolveTrailerOffset = (
  tail: Buffer,
  tailStart: number,
  pointer: number,
): number => {
  const pointerWithinTail = pointer - tailStart;
  if (
    pointer > 0 &&
    pointerWithinTail >= 0 &&
    pointerWithinTail + 4 < tail.length
  ) {
    const field = readLengthPrefixedString(tail, pointerWithinTail);
    if (field && parseMetadataBlob(field.value)) {
      return pointerWithinTail;
    }
  }

  let searchFrom = 0;
  for (;;) {
    const keyIndex = tail.indexOf(METADATA_BLOB_KEY, searchFrom, 'latin1');
    if (keyIndex === -1) {
      return -1;
    }

    // Walk back to the object's opening brace, then to its length prefix.
    const braceIndex = tail.lastIndexOf(0x7b, keyIndex);
    if (braceIndex >= 4) {
      const field = readLengthPrefixedString(tail, braceIndex - 4);
      if (field && parseMetadataBlob(field.value)) {
        return braceIndex - 4;
      }
    }

    searchFrom = keyIndex + METADATA_BLOB_KEY.length;
  }
};

/**
 * Reads a replay's metadata trailer, or null when the file is not a readable
 * replay — a partial `_vcrNNNNNNN.tmp` recording, a truncated download, or
 * anything else that is not actually a .Vcr.
 */
export const readVcrTrailer = async (
  filePath: string,
): Promise<VcrTrailer | null> => {
  let handle;

  try {
    handle = await open(filePath, 'r');
    const { size } = await handle.stat();

    if (size < HEADER_READ_LENGTH) {
      return null;
    }

    const header = Buffer.alloc(HEADER_READ_LENGTH);
    await handle.read(header, 0, HEADER_READ_LENGTH, 0);

    if (
      !header.subarray(MAGIC_OFFSET, MAGIC_OFFSET + MAGIC.length).equals(MAGIC)
    ) {
      return null;
    }

    const pointer = header.readUInt32LE(TRAILER_POINTER_OFFSET);

    const tailLength = Math.min(TRAILER_SCAN_LENGTH, size);
    const tailStart = size - tailLength;
    const tail = Buffer.alloc(tailLength);
    await handle.read(tail, 0, tailLength, tailStart);

    const trailerOffset = resolveTrailerOffset(tail, tailStart, pointer);
    if (trailerOffset < 0) {
      return null;
    }

    const fields: string[] = [];
    let cursor = trailerOffset;

    for (let index = 0; index < TRAILER_FIELD_COUNT; index += 1) {
      const field = readLengthPrefixedString(tail, cursor);
      if (!field) {
        break;
      }

      fields.push(field.value);
      cursor = field.next;
    }

    if (fields.length < TRAILER_FIELD_COUNT) {
      return null;
    }

    const metadata = parseMetadataBlob(fields[0]);
    if (!metadata) {
      return null;
    }

    const [
      ,
      trackScene,
      trackAiw,
      trackFolder,
      trackVersion,
      trackContentHash,
      originInstallPath,
    ] = fields;

    return {
      sceneDesc: metadata.sceneDesc,
      session: metadata.session,
      eventTitle: metadata.eventTitle,
      eventType: metadata.eventType,
      splitNo: metadata.splitNo,
      trackScene,
      trackAiw,
      trackFolder,
      trackVersion,
      trackContentHash,
      originInstallPath,
      drivers: readDrivers(tail, cursor),
    };
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
};
