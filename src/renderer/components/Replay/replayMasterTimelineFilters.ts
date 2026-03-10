import { ReplayIncidentEvent, ReplayIncidentType } from './ReplayMasterIncidentTimeline';

export const buildFilteredReplayTimelineEvents = ({
  events,
  hideLimitedData,
  selectedTypes,
  selectedClass,
  searchQuery,
}: {
  events: ReplayIncidentEvent[];
  hideLimitedData: boolean;
  selectedTypes: ReplayIncidentType[];
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
