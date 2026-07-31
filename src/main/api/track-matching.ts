import { CONSTANTS } from '@constants';

/**
 * Track name matching, shared by replay sync and import validation.
 *
 * LMU names a track three different ways and none of them agree: a replay
 * carries a scene id (`MONZAWEC`), a result log carries free text
 * (`Autodromo Nazionale Monza`, `Monza Curva Grande Circuit`), and the replay
 * file name carries a display name. Matching is therefore alias-based rather
 * than exact, with a few rewrites for layouts the game names inconsistently.
 *
 * Extracted so sync and import cannot drift apart on what counts as the same
 * track — a divergence would show up as an import being rejected for a pairing
 * that sync would happily have made, or the reverse.
 */

const TRACK_ALIAS_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bout(er)?\s+circuit\b/g, 'international circuit'],
  [/\bcurva\s+grande\s+circuit\b/g, 'nazionale monza'],
  [/\s*-\s*elms\b/g, ''],
];

export const normalizeTrackText = (value: string): string => {
  let normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  TRACK_ALIAS_REPLACEMENTS.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement).trim();
  });

  return normalized.replace(/\s+/g, ' ').trim();
};

interface TrackMetaEntry {
  displayName?: string;
  aliases?: readonly string[];
}

/**
 * Every name a track might be known by, normalised. The replay name is included
 * as a fallback for scenes missing from TRACK_META_DATA, with its trailing
 * session marker ("R1 2") stripped.
 */
export const getTrackAliases = (
  sceneDesc: string,
  replayName?: string,
): string[] => {
  const meta = CONSTANTS.TRACK_META_DATA[
    sceneDesc as keyof typeof CONSTANTS.TRACK_META_DATA
  ] as TrackMetaEntry | undefined;

  let aliases: string[] = [];

  if (meta) {
    if (typeof meta.displayName === 'string') {
      aliases.push(meta.displayName);
    }
    if (Array.isArray(meta.aliases)) {
      aliases = aliases.concat(meta.aliases);
    }
  }

  const replayTrack = String(replayName ?? '').replace(
    /\s+[RQP]\d+\s+\d+$/i,
    '',
  );

  if (replayTrack && !aliases.includes(replayTrack)) {
    aliases.push(replayTrack);
  }

  return aliases
    .filter((alias): alias is string => typeof alias === 'string' && !!alias)
    .map((alias) => normalizeTrackText(alias))
    .filter(Boolean);
};

/**
 * True when any alias matches any of the log's track fields, in either
 * direction. Substring matching is deliberate — a log's course name is often a
 * longer or shorter form of the venue.
 */
export const tracksLikelyMatch = (
  trackAliases: string[],
  logTrackVenue: string,
  logTrackCourse?: string,
  logTrackEvent?: string,
): boolean => {
  const logFields = [logTrackVenue, logTrackCourse, logTrackEvent]
    .map((field) => normalizeTrackText(String(field ?? '')))
    .filter(Boolean);

  return trackAliases.some((alias) =>
    logFields.some(
      (field) =>
        alias === field || alias.includes(field) || field.includes(alias),
    ),
  );
};
