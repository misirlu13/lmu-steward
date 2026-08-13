import { ReplayIncidentEvent, ReplayIncidentType } from './replayTimelineTypes';

/**
 * Where an incident's evidence comes from.
 *
 * Every incident on this timeline is the log's — the XML is authoritative and
 * builds the list, and live capture only ever enriches rows that are already
 * there. So this splits the list by whether capture *also* saw an incident, not
 * by where it came from.
 *
 * The distinction is worth filtering on because the two are reviewed
 * differently: a captured incident carries closing speeds and traces and can be
 * called on the evidence, while a log-only one can only be watched. On a
 * session where capture attached late — which is ordinary, since the app is
 * often started after the session — the two are interleaved through a list
 * hundreds of rows long.
 */
export type ReplayIncidentSource = 'captured' | 'log-only';

export const allIncidentSources: ReplayIncidentSource[] = [
  'captured',
  'log-only',
];

/**
 * Keyed on the merged incident id rather than on `hasLiveContext`.
 *
 * `hasLiveContext` means a trace *window* was recorded, which only car-to-car
 * contact ever gets. `liveIncidentId` means capture saw this incident at all,
 * which is what decides whether the dossier has anything to show — and that is
 * the question a steward is filtering on.
 */
export const incidentSourceOf = (
  event: ReplayIncidentEvent,
): ReplayIncidentSource => (event.liveIncidentId ? 'captured' : 'log-only');

export const buildFilteredReplayTimelineEvents = ({
  events,
  hideLimitedData,
  selectedTypes,
  selectedSources = allIncidentSources,
  selectedClass,
  searchQuery,
}: {
  events: ReplayIncidentEvent[];
  hideLimitedData: boolean;
  selectedTypes: ReplayIncidentType[];
  selectedSources?: ReplayIncidentSource[];
  selectedClass: string;
  searchQuery: string;
}): ReplayIncidentEvent[] => {
  return events
    .map((event) => ({
      ...event,
      drivers: hideLimitedData
        ? event.drivers.filter((driver) => driver.hasLapData !== false)
        : event.drivers,
    }))
    .filter((event) => {
      if (!event.drivers.length) {
        return false;
      }

      if (!selectedTypes.includes(event.type)) {
        return false;
      }

      if (!selectedSources.includes(incidentSourceOf(event))) {
        return false;
      }

      if (
        selectedClass !== 'all' &&
        !event.drivers.some((driver) => driver.carClass === selectedClass)
      ) {
        return false;
      }

      if (!searchQuery.trim()) {
        return true;
      }

      const normalized = searchQuery.toLowerCase();
      return event.drivers.some(
        (driver) =>
          driver.displayName.toLowerCase().includes(normalized) ||
          driver.carNumber.toLowerCase().includes(normalized),
      );
    })
    .sort((left, right) => {
      const leftEt = Number.isFinite(left.etSeconds)
        ? Number(left.etSeconds)
        : Number.MAX_SAFE_INTEGER;
      const rightEt = Number.isFinite(right.etSeconds)
        ? Number(right.etSeconds)
        : Number.MAX_SAFE_INTEGER;

      return leftEt - rightEt;
    });
};
