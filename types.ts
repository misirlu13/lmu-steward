export interface LMUReplay {
  id?: string;
  hash: string;
  multiplayer?: boolean;
  metadata: {
    sceneDesc: string;
    session: SessionType;
  };
  logData: any;
  logDataDirectory: string;
  logDataFileName: string;
  logDataLoaded?: boolean;
  replayDirectory: string;
  replayName: string;
  size: number;
  timestamp: number;
}

export interface LMUProfileInfo {
  language: string;
  name: string;
  nationality: string;
  nick: string;
  steamID: string;
}

export interface ProfileCacheStore {
  profileInfo: LMUProfileInfo | null;
  hasFetchedProfileInfo: boolean;
  lastFetchedAt: number | null;
}

export type SessionType = 'RACE' | 'QUALIFY' | 'PRACTICE';

export type ReplayGameType = 'race-weekend' | 'multiplayer';
export type ReplayGameTypeFilter = ReplayGameType | '';

export interface GetReplaysRequest {
  forceReplayCacheReset?: boolean;
  gameType?: ReplayGameType;
}

export type LMUReplayCommands =
  | 'VCRCOMMAND_REVERSESCAN'
  | 'VCRCOMMAND_PLAYBACKWARDS'
  | 'VCRCOMMAND_SLOWBACKWARDS'
  | 'VCRCOMMAND_STOP'
  | 'VCRCOMMAND_SLOW'
  | 'VCRCOMMAND_PLAY'
  | 'VCRCOMMAND_FORWARDSCAN';


export interface LMUStewardAPIResponse<T> {
  status: 'success' | 'error';
  data?: T;
  message?: string;
}

export interface LMUStewardStore {
  replays: Record<string, LMUReplay>;
  replayCacheSchemaVersion?: number;
  replayCacheMigratedFromAppVersion?: string;
  replayCacheMigratedToAppVersion?: string;
}

export type LiveCaptureState = 'detached' | 'live';

export interface LiveSessionStatus {
  state: LiveCaptureState;
  trackName?: string;
  sessionType?: SessionType;
  driverCount?: number;
  detail?: string;
}

export type LiveIndicatorState = 'unavailable' | 'standby' | 'live';

export interface SessionIncidents {
  trackLimits: number;
  incidents: number;
  penalties: number;
}

export interface SessionMetaData {
  fuelMultiplier: number;
  tireMultiplier: number;
  tireWarmers: boolean;
}

export interface LoadingState {
  loading: boolean;
  percentage: number;
}

export interface ReplaySyncStatus {
  status: 'idle' | 'in-progress' | 'success' | 'error';
  percentage: number;
  processed: number;
  total: number;
  message?: string;
}
