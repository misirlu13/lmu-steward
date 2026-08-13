import { LiveIncidentParty } from '@types';
import { ReplayIncidentEvent } from '../components/Replay/replayTimelineTypes';
import {
  extractNameAndCarNumberFromIncident,
  extractSecondaryIncidentDriver,
} from './replayTimeline';

/**
 * Attaches live capture's evidence to the incidents the session XML reported.
 *
 * The XML is authoritative and builds the list; live capture is enrichment.
 * Nothing here ever adds, removes or reorders an incident — a live incident
 * with no XML counterpart is dropped, because the replay view's counts and
 * timeline are the log's and must stay that way.
 *
 * See plans/live-replay-reconciliation-design.md, "Reconciling Incidents".
 */

/**
 * How far apart the two clocks may be for the same incident.
 *
 * Both sides quote `mCurrentET`, so they should agree exactly. Measured across
 * three real captured sessions the largest disagreement on a confirmed match
 * was 0.1s — one scoring tick — so this is slack, not a search radius.
 */
export const LIVE_MERGE_ET_TOLERANCE_SECONDS = 0.5;

export interface MergeableLiveIncident {
  /** The persisted, content-derived id — stable across an app restart. */
  id: string;
  etSeconds: number;
  raw: string;
  parties: LiveIncidentParty[];
  evidence?: ReplayIncidentEvent['liveEvidence'];
  hasContext?: boolean;
}

const decodeXmlText = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** The body of `<Incident ...>body</Incident>`, or the value itself if untagged. */
const incidentText = (raw: string): string => {
  const match = String(raw ?? '').match(/>([^<]*)</);
  return decodeXmlText(match ? match[1] : String(raw ?? ''))
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeText = (value: string): string =>
  decodeXmlText(String(value ?? ''))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * The two cars in a collision, as an order-independent key.
 *
 * The number LMU prints beside a name — `Rui Andrade(22)` — is the same number
 * on both sides, because both sides read the same string. Whether it is a slot
 * or a car number does not matter here; what matters is that it discriminates
 * between two drivers with similar names and is written identically in the log
 * and in shared memory.
 */
const participantKey = (
  parties: Array<{ name: string; id?: string | number }>,
): string =>
  parties
    .filter((party) => party.name)
    .map(
      (party) =>
        `${normalizeText(party.name)}#${String(party.id ?? '').trim()}`,
    )
    .sort()
    .join('|');

const eventParticipantKey = (sourceText: string): string => {
  const primary = extractNameAndCarNumberFromIncident(sourceText);
  const secondary = extractSecondaryIncidentDriver(sourceText);

  if (!primary || !secondary) {
    return '';
  }

  return participantKey([
    { name: primary.name, id: primary.carNumber },
    { name: secondary.name, id: secondary.carNumber },
  ]);
};

const liveParticipantKey = (parties: LiveIncidentParty[]): string => {
  if ((parties ?? []).length < 2) {
    return '';
  }

  return participantKey(
    parties.map((party) => ({ name: party.displayName, id: party.slotId })),
  );
};

interface IndexedLiveIncident {
  incident: MergeableLiveIncident;
  text: string;
  participants: string;
}

/**
 * Merges live evidence onto already-built timeline events.
 *
 * Two keys, both anchored on elapsed time:
 *
 * 1. **Same text.** The log's incident string and live capture's `raw` come
 *    from the same place and are byte-identical, which makes this exact rather
 *    than fuzzy. It is the only key that separates records the parsed fields
 *    cannot — one real log holds three incidents at et 122.3 for one driver
 *    hitting one post, differing only in impact force.
 *
 * 2. **Same pair of cars.** LMU can write a collision twice, once from each
 *    driver's perspective, at the same elapsed time with different impact
 *    forces. The sidecar folds those into one live incident, so the mirrored
 *    row's text never matches — it names the drivers the other way round. This
 *    key attaches the same evidence to both, which is why the merge is
 *    deliberately one-to-many.
 *
 * Elapsed time is required in both, and for good reason: the same incident text
 * recurs. One real log repeats `Bradley Drake(0) reported contact (20.56) with
 * Immovable` seven times across a session, minutes apart. Keying on text alone
 * would smear one incident's evidence across all seven.
 */
export const attachLiveEvidenceToEvents = (
  events: ReplayIncidentEvent[],
  liveIncidents: MergeableLiveIncident[],
): ReplayIncidentEvent[] => {
  if (!events.length || !liveIncidents?.length) {
    return events;
  }

  const indexed: IndexedLiveIncident[] = liveIncidents
    .filter((incident) => Number.isFinite(incident?.etSeconds))
    .map((incident) => ({
      incident,
      text: normalizeText(incidentText(incident.raw)),
      participants: liveParticipantKey(incident.parties),
    }));

  return events.map((event) => {
    /*
      Collisions only. Track limits and solo penalties never get a context
      window — that bound is what keeps captured storage tolerable — so there is
      no evidence for them to carry and matching them would only risk attaching
      something to the wrong row.
    */
    if (
      event.type !== 'collision' ||
      !event.sourceText ||
      !Number.isFinite(event.etSeconds)
    ) {
      return event;
    }

    const eventEt = event.etSeconds as number;
    const eventText = normalizeText(event.sourceText);
    const eventParticipants = eventParticipantKey(event.sourceText);

    const withinTolerance = indexed.filter(
      (entry) =>
        Math.abs(entry.incident.etSeconds - eventEt) <=
        LIVE_MERGE_ET_TOLERANCE_SECONDS,
    );

    if (!withinTolerance.length) {
      return event;
    }

    const byText = withinTolerance.filter((entry) => entry.text === eventText);
    const byParticipants = eventParticipants
      ? withinTolerance.filter(
          (entry) => entry.participants === eventParticipants,
        )
      : [];

    // Text first: it is exact where the participant key is only a pairing, and
    // the mirrored row is the one case where no text can match.
    const candidates = byText.length ? byText : byParticipants;

    if (!candidates.length) {
      return event;
    }

    const [best] = [...candidates].sort(
      (a, b) =>
        Math.abs(a.incident.etSeconds - eventEt) -
        Math.abs(b.incident.etSeconds - eventEt),
    );

    return {
      ...event,
      liveIncidentId: best.incident.id,
      liveEvidence: best.incident.evidence,
      hasLiveContext: Boolean(best.incident.hasContext),
    };
  });
};
