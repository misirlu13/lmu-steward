export interface ReplaySessionLogDataLike {
  Stream?: unknown;
  TrackLength?: unknown;
  MostLapsCompleted?: unknown;
  Driver?: unknown;
  [key: string]: unknown;
}

interface ReplayMetadataSource {
  metadata?: {
    sceneDesc?: string;
    session?: string;
  };
  logData?: Record<string, unknown> | null;
}

export const resolveReplayHeaderMetadata = ({
  replay,
  trackMetaData,
}: {
  replay: ReplayMetadataSource | null;
  trackMetaData: Record<string, { displayName?: string; location?: string }>;
}): { title: string | undefined; location: string | undefined } => {
  const sceneDesc = replay?.metadata?.sceneDesc as string | undefined;
  if (!sceneDesc) {
    return {
      title: undefined,
      location: undefined,
    };
  }

  const metaData = trackMetaData[sceneDesc];
  if (metaData) {
    return {
      title: metaData.displayName,
      location: metaData.location,
    };
  }

  return {
    title: sceneDesc,
    location: undefined,
  };
};

export const resolveReplaySessionLogData = ({
  replay,
  sessionTypeMappings,
}: {
  replay: ReplayMetadataSource | null;
  sessionTypeMappings: Record<string, string>;
}): ReplaySessionLogDataLike | null => {
  const sessionType = replay?.metadata?.session as string | undefined;
  const sessionKey = sessionType ? sessionTypeMappings[sessionType] : undefined;

  if (!sessionKey || !replay?.logData) {
    return null;
  }

  const sessionLogData = replay.logData[sessionKey];
  if (!sessionLogData || typeof sessionLogData !== 'object') {
    return null;
  }

  return sessionLogData as ReplaySessionLogDataLike;
};
