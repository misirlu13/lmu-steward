import {
  extractIncidentImpactForce,
  getIncidentForceLevelLabel,
} from '../components/DriverAnalysis/driverAnalysisUtils';

export const buildDriverAnalysisPenaltyDescription = (
  penalty: { Penalty?: unknown; Reason?: unknown } | null | undefined,
): string | undefined => {
  const penaltyType = String(penalty?.Penalty ?? '').trim();
  const reason = String(penalty?.Reason ?? '').trim();

  if (penaltyType && reason) {
    return `${penaltyType} • ${reason}`;
  }

  if (penaltyType) {
    return penaltyType;
  }

  if (reason) {
    return reason;
  }

  return undefined;
};

export const buildDriverAnalysisTrackLimitDescription = (
  trackLimit:
    | { _?: unknown; WarningPoints?: unknown; CurrentPoints?: unknown }
    | null
    | undefined,
): string | undefined => {
  const outcome = String(trackLimit?._ ?? '').trim();
  const warningPoints = String(trackLimit?.WarningPoints ?? '').trim();
  const currentPoints = String(trackLimit?.CurrentPoints ?? '').trim();

  const details: string[] = [];
  if (outcome) {
    details.push(`Outcome: ${outcome}`);
  }

  if (warningPoints) {
    details.push(`Warning Points: ${warningPoints}`);
  }

  if (currentPoints) {
    details.push(`Current Points: ${currentPoints}`);
  }

  return details.length ? details.join(' • ') : undefined;
};

export const extractDriverAnalysisIncidentDescription = (
  incidentText: string,
): string | undefined => {
  const normalized = String(incidentText ?? '').trim();
  if (!normalized) {
    return undefined;
  }

  const withMatch = normalized.match(/\bwith\s+(.+)$/i);
  if (!withMatch) {
    return undefined;
  }

  const target = withMatch[1].trim();
  if (!target) {
    return undefined;
  }

  return `Contact with ${target}`;
};

export const buildDriverAnalysisIncidentForceSummary = (
  incidentText: string,
): string | undefined => {
  const impactForce = extractIncidentImpactForce(incidentText);
  if (impactForce === undefined || !Number.isFinite(impactForce)) {
    return undefined;
  }

  return `Impact Force: ${impactForce.toFixed(2)} (${getIncidentForceLevelLabel(impactForce)})`;
};
