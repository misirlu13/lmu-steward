export interface LMUReplay {
  id?: string;
  hash: string;
  metadata: {
    sceneDesc: string;
    session: SessionType;
  };
  logData: any;
  logDataDirectory: string;
  logDataFileName: string;
  replayDirectory: string;
  replayName: string;
  size: number;
  timestamp: number;
}

export type SessionType = 'RACE' | 'QUALIFY' | 'PRACTICE';

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
}

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
