import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CONSTANTS } from '@constants';
import {
  GetReplaysRequest,
  ImportedReplayRecord,
  LiveSessionStatus,
  LMUReplay,
  StewardDecision,
  StewardDecisionStore,
  LoadingState,
  PersistedDashboardView,
  ReplaySyncStatus,
} from '@types';
import { initializeMessageBus, sendMessage } from '../utils/postMessage';

interface ReplayResponse {
  status: string;
  data: LMUReplay[];
}

interface UserSettingsResponse {
  status?: string;
  data?: {
    quickViewEnabled?: boolean;
    experimentalFeaturesEnabled?: boolean;
    liveCaptureEnabled?: boolean;
    persistDashboardFiltersEnabled?: boolean;
    dashboardView?: PersistedDashboardView | null;
  };
}

type ApiChannel = (typeof CONSTANTS.API)[keyof typeof CONSTANTS.API];
type ApiChannelCallback = (data: unknown) => void;

export interface ImportSelectionPayload {
  id: string;
  logPath: string;
  method: 'roster' | 'manual' | 'manifest';
  confidence: number | null;
  /** Event time from a manifest, preferred over the log's own when present. */
  timestamp?: number;
  /** The steward's note about this hand-off. */
  note?: string;
}

export interface ExportReplayPayload {
  hash: string;
  replayName: string;
  sceneDesc: string;
  session: string;
  timestamp: number;
  logDataFileName: string;
}

export interface ExportSessionDataPayload {
  /** Suggested filename only; the main process owns the actual path. */
  fileName: string;
  contents: string;
  format: 'csv' | 'markdown' | 'json';
}

export interface ExportWeekendPayload {
  /** Track display name, used only to name the archive. Never a path. */
  weekendLabel: string;
  timestamp: number;
  sessions: ExportReplayPayload[];
}

export interface ExportProgressState {
  status: 'in-progress' | 'success' | 'error';
  /** Sessions fully written. */
  processed: number;
  total: number;
  bytesWritten: number;
  totalBytes: number;
  currentLabel: string;
  message?: string;
}

/** Where a finished export landed, so the user can be told rather than guess. */
export interface ExportResultState {
  status: 'success' | 'error';
  canceled: boolean;
  filePath: string;
  /** Sessions actually written. One for a session export. */
  exported: number;
  omitted: Array<{ replayName: string; session: string; reason: string }>;
  message: string;
}

export interface ImportFileSelection {
  kind: 'replay' | 'log';
  /** Set when the bulk preview asked, naming the row that did. */
  rowId?: string;
  filePath: string;
  fileName: string;
  size?: number;
  session?: string;
  driverCount?: number;
  trackVenue?: string;
  trackFolder?: string;
  eventDateTime?: number | null;
  originInstallPath?: string;
}

export interface ImportPairIssueState {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ImportPairValidationState {
  issues: ImportPairIssueState[];
  confidence: number | null;
  rosterOverlap: {
    intersection: number;
    vcrCount: number;
    logCount: number;
  } | null;
  canImport: boolean;
}

/**
 * One scanned replay, as the preview renders it.
 *
 * Mirrors `ImportPreviewRow` in the main process. Paths are carried through
 * untouched and handed back on import — the renderer reads them for display and
 * never builds or edits one.
 */
export interface ImportPreviewRowState {
  id: string;
  vcrPath: string;
  vcrFileName: string;
  replayName: string;
  sceneDesc: string;
  session: string;
  size: number;
  alreadyImportedHash: string | null;
  manifest: { logPath: string; timestamp: number } | null;
  pairing: {
    ranked: Array<{
      candidate: {
        fileName: string;
        filePath: string;
        session: string | null;
        eventDateTime: number | null;
        trackVenue: string;
        driverNames: string[];
      };
      confidence: number;
      intersection: number;
      vcrCount: number;
      logCount: number;
    }>;
    proposed: {
      candidate: { fileName: string; filePath: string };
      confidence: number;
      intersection: number;
      vcrCount: number;
    } | null;
    reason:
      | 'proposed'
      | 'manifest'
      | 'only-candidate'
      | 'roster-too-small'
      | 'no-candidates'
      | 'below-floor'
      | 'ambiguous';
  };
}

export interface ImportPreviewState {
  kind: 'folder' | 'zip';
  /** What the user picked. For a zip, not where it was unpacked. */
  sourceLabel: string;
  rows: ImportPreviewRowState[];
  /** Rows a Steward manifest settled without scoring. */
  manifestSessionCount: number;
  omittedSessions: Array<{
    replayName: string;
    session: string;
    reason: string;
  }>;
  /** Archive entries refused by the path guard. */
  rejectedEntries: string[];
}

export interface ImportProgressState {
  status: 'idle' | 'in-progress' | 'success' | 'error';
  /** Unpacking counts bytes; importing counts replays. */
  phase?: 'extracting' | 'scanning' | 'importing';
  processed: number;
  total: number;
  currentLabel?: string;
  message?: string;
}

export interface ImportOutcomeState {
  id: string;
  replayName: string;
  status: 'imported' | 'skipped' | 'failed';
  message?: string;
}

/**
 * Normalises both export replies into one shape.
 *
 * A session export and a weekend export differ only in how many sessions they
 * wrote and whether any were left out, so the UI that reports the outcome does
 * not need to know which one it was watching.
 */
const toExportResult = (
  data: unknown,
  defaultExported = 0,
): ExportResultState => {
  const payload = data as {
    status?: string;
    data?: {
      canceled?: boolean;
      filePath?: string;
      exported?: number;
      omitted?: ExportResultState['omitted'];
    };
    message?: string;
  };

  if (payload?.status !== 'success') {
    return {
      status: 'error',
      canceled: false,
      filePath: '',
      exported: 0,
      omitted: [],
      message: payload?.message ?? 'The export could not be completed.',
    };
  }

  return {
    status: 'success',
    canceled: Boolean(payload.data?.canceled),
    filePath: payload.data?.filePath ?? '',
    exported: payload.data?.exported ?? defaultExported,
    omitted: payload.data?.omitted ?? [],
    message: '',
  };
};

interface ApiContextType {
  isConnected: boolean;
  hasApiStatusResponse: boolean;
  liveSessionStatus: LiveSessionStatus;
  hasUserSettingsResponse: boolean;
  quickViewEnabled: boolean;
  experimentalFeaturesEnabled: boolean;
  /** True only when experimental features AND the live capture switch are on. */
  liveCaptureEnabled: boolean;
  persistDashboardFiltersEnabled: boolean;
  persistedDashboardView: PersistedDashboardView | null;
  lastReplaySyncAt: number | null;
  isReplaySyncInProgress: boolean;
  replaySyncStatus: ReplaySyncStatus;
  isReplayActive: boolean | null;
  currentTrackMap: { data?: unknown } | null;
  replays: ReplayResponse | null;
  importedReplays: ImportedReplayRecord[];
  importPreview: ImportPreviewState | null;
  importProgress: ImportProgressState | null;
  currentReplay: LMUReplay | null;
  loadingState: LoadingState;
  markReplayCacheResetRequired: () => void;
  requestReplays: (options?: GetReplaysRequest) => void;
  archiveReplays: (hashes: string[], note?: string) => void;
  restoreReplays: (hashes: string[]) => void;
  setArchiveNote: (hashes: string[], note: string) => void;
  requestImportedReplays: () => void;
  selectImportSource: (kind: 'folder' | 'zip') => void;
  /** The log the user browsed to for one preview row, keyed by row id. */
  importRowLogSelections: Record<string, ImportFileSelection>;
  importOutcomes: ImportOutcomeState[] | null;
  clearImportOutcomes: () => void;
  importReplayFile: ImportFileSelection | null;
  importLogFile: ImportFileSelection | null;
  importPairValidation: ImportPairValidationState | null;
  importPairError: string;
  isImportingPair: boolean;
  selectImportFile: (kind: 'replay' | 'log', rowId?: string) => void;
  importReplayPair: (note?: string) => void;
  setImportedNote: (hashes: string[], note: string) => void;
  resetImportPair: () => void;
  clearImportPreview: () => void;
  importSelectedReplays: (
    rows: unknown[],
    selections: ImportSelectionPayload[],
  ) => void;
  deleteImportedReplays: (hashes: string[]) => void;
  exportReplay: (request: ExportReplayPayload) => void;
  exportWeekend: (request: ExportWeekendPayload) => void;
  exportSessionData: (request: ExportSessionDataPayload) => void;
  stewardDecisions: StewardDecisionStore;
  saveStewardDecision: (decision: StewardDecision) => void;
  exportProgress: ExportProgressState | null;
  exportResult: ExportResultState | null;
  clearExportResult: () => void;
  subscribeToApiChannel: (
    channel: ApiChannel,
    callback: ApiChannelCallback,
  ) => () => void;
}

const ApiContext = createContext<ApiContextType>({
  isConnected: false,
  hasApiStatusResponse: false,
  liveSessionStatus: { state: 'detached' },
  hasUserSettingsResponse: false,
  quickViewEnabled: false,
  experimentalFeaturesEnabled: false,
  liveCaptureEnabled: false,
  persistDashboardFiltersEnabled: false,
  persistedDashboardView: null,
  lastReplaySyncAt: null,
  isReplaySyncInProgress: false,
  replaySyncStatus: {
    status: 'idle',
    percentage: 0,
    processed: 0,
    total: 0,
  },
  isReplayActive: null,
  currentTrackMap: null,
  replays: null,
  importedReplays: [],
  importPreview: null,
  importProgress: null,
  currentReplay: null,
  loadingState: { loading: false, percentage: -1 },
  markReplayCacheResetRequired: () => {},
  requestReplays: () => {},
  archiveReplays: () => {},
  requestImportedReplays: () => {},
  selectImportSource: () => {},
  importRowLogSelections: {},
  importOutcomes: null,
  clearImportOutcomes: () => {},
  importReplayFile: null,
  importLogFile: null,
  importPairValidation: null,
  importPairError: '',
  isImportingPair: false,
  selectImportFile: () => {},
  importReplayPair: () => {},
  setImportedNote: () => {},
  resetImportPair: () => {},
  clearImportPreview: () => {},
  importSelectedReplays: () => {},
  deleteImportedReplays: () => {},
  exportReplay: () => {},
  exportWeekend: () => {},
  exportSessionData: () => {},
  stewardDecisions: {},
  saveStewardDecision: () => {},
  exportProgress: null,
  exportResult: null,
  clearExportResult: () => {},
  restoreReplays: () => {},
  setArchiveNote: () => {},
  subscribeToApiChannel: () => () => {},
});

export const ApiProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [hasApiStatusResponse, setHasApiStatusResponse] = useState(false);
  const [hasUserSettingsResponse, setHasUserSettingsResponse] = useState(false);
  const [quickViewEnabled, setQuickViewEnabled] = useState(false);
  const [experimentalFeaturesEnabled, setExperimentalFeaturesEnabled] =
    useState(false);
  const [liveCaptureSettingEnabled, setLiveCaptureSettingEnabled] =
    useState(false);
  const [persistDashboardFiltersEnabled, setPersistDashboardFiltersEnabled] =
    useState(false);
  const [persistedDashboardView, setPersistedDashboardView] =
    useState<PersistedDashboardView | null>(null);
  const [lastReplaySyncAt, setLastReplaySyncAt] = useState<number | null>(null);
  const [activeReplaySyncRequestCount, setActiveReplaySyncRequestCount] =
    useState(0);
  const [replaySyncStatus, setReplaySyncStatus] = useState<ReplaySyncStatus>({
    status: 'idle',
    percentage: 0,
    processed: 0,
    total: 0,
  });
  const [liveSessionStatus, setLiveSessionStatus] = useState<LiveSessionStatus>(
    {
      state: 'detached',
    },
  );
  const [isReplayActive, setIsReplayActive] = useState<boolean | null>(null);
  const [isReplayCacheResetRequired, setIsReplayCacheResetRequired] =
    useState(false);
  const [currentTrackMap, setCurrentTrackMap] = useState<{
    data?: unknown;
  } | null>(null);
  const [replays, setReplays] = useState<ReplayResponse | null>(null);
  const [importedReplays, setImportedReplays] = useState<
    ImportedReplayRecord[]
  >([]);
  const [importPreview, setImportPreview] = useState<ImportPreviewState | null>(
    null,
  );
  const [importRowLogSelections, setImportRowLogSelections] = useState<
    Record<string, ImportFileSelection>
  >({});
  const [importOutcomes, setImportOutcomes] = useState<
    ImportOutcomeState[] | null
  >(null);
  const [importProgress, setImportProgress] =
    useState<ImportProgressState | null>(null);
  const [exportProgress, setExportProgress] =
    useState<ExportProgressState | null>(null);
  const [exportResult, setExportResult] = useState<ExportResultState | null>(
    null,
  );
  const [importReplayFile, setImportReplayFile] =
    useState<ImportFileSelection | null>(null);
  const [importLogFile, setImportLogFile] =
    useState<ImportFileSelection | null>(null);
  const [importPairValidation, setImportPairValidation] =
    useState<ImportPairValidationState | null>(null);
  const [importPairError, setImportPairError] = useState('');
  const [isImportingPair, setIsImportingPair] = useState(false);
  const [currentReplay, setCurrentReplay] = useState<LMUReplay | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>({
    loading: false,
    percentage: -1,
  });
  const [apiStatusInterval, setApiStatusInterval] = useState<number>(5000);
  const additionalCallbacksRef = useRef<
    Partial<Record<ApiChannel, Set<ApiChannelCallback>>>
  >({});
  // Archive actions reply with a fresh replay list, so they need the same
  // game-type scope the dashboard last asked for or the reply would silently
  // widen the list.
  const lastReplayRequestRef = useRef<GetReplaysRequest | undefined>(undefined);

  const subscribeToApiChannel = useCallback(
    (channel: ApiChannel, callback: ApiChannelCallback) => {
      if (!additionalCallbacksRef.current[channel]) {
        additionalCallbacksRef.current[channel] = new Set<ApiChannelCallback>();
      }

      additionalCallbacksRef.current[channel]?.add(callback);

      return () => {
        additionalCallbacksRef.current[channel]?.delete(callback);
      };
    },
    [],
  );

  const runAdditionalCallbacks = useCallback(
    (channel: ApiChannel, data: unknown) => {
      additionalCallbacksRef.current[channel]?.forEach((callback) => {
        callback(data);
      });
    },
    [],
  );

  const markReplayCacheResetRequired = useCallback(() => {
    setIsReplayCacheResetRequired(true);
  }, []);

  const applyUserSettingsPayload = useCallback((data: unknown) => {
    const payload = data as UserSettingsResponse;

    // Flagged regardless of status so consumers waiting on settings (such as
    // the dashboard restoring persisted filters) can fall back to defaults
    // instead of blocking forever when settings fail to load.
    setHasUserSettingsResponse(true);

    if (payload?.status !== 'success') {
      return;
    }

    if (typeof payload?.data?.experimentalFeaturesEnabled === 'boolean') {
      setExperimentalFeaturesEnabled(payload.data.experimentalFeaturesEnabled);
    }

    if (typeof payload?.data?.liveCaptureEnabled === 'boolean') {
      setLiveCaptureSettingEnabled(payload.data.liveCaptureEnabled);
    }

    if (typeof payload?.data?.quickViewEnabled === 'boolean') {
      setQuickViewEnabled(payload.data.quickViewEnabled);
    }

    if (typeof payload?.data?.persistDashboardFiltersEnabled === 'boolean') {
      setPersistDashboardFiltersEnabled(
        payload.data.persistDashboardFiltersEnabled,
      );
    }

    if (payload?.data && 'dashboardView' in payload.data) {
      setPersistedDashboardView(payload.data.dashboardView ?? null);
    }
  }, []);

  /**
   * Archive replies carry the full replay list, so the list is replaced rather
   * than patched. A failed action leaves the previous list untouched, which is
   * why no optimistic update is needed here.
   */
  const applyArchiveActionPayload = useCallback((data: unknown) => {
    const payload = data as ReplayResponse & { message?: string };

    if (payload?.status !== 'success') {
      console.error('Failed to update replay archive state:', payload?.message);
      return;
    }

    setReplays(payload);
  }, []);

  const requestReplays = useCallback(
    (options?: GetReplaysRequest) => {
      setActiveReplaySyncRequestCount((previousCount) => previousCount + 1);
      setReplaySyncStatus({
        status: 'in-progress',
        percentage: 0,
        processed: 0,
        total: 0,
      });

      const shouldForceReplayCacheReset =
        Boolean(options?.forceReplayCacheReset) || isReplayCacheResetRequired;
      const payload = shouldForceReplayCacheReset
        ? { ...options, forceReplayCacheReset: true }
        : options;

      if (shouldForceReplayCacheReset && isReplayCacheResetRequired) {
        setIsReplayCacheResetRequired(false);
      }

      lastReplayRequestRef.current = options;
      sendMessage(CONSTANTS.API.GET_REPLAYS, payload);
    },
    [isReplayCacheResetRequired],
  );

  /**
   * Archive, restore, and note changes all reply with the current replay list
   * read straight from the cache. None of them sync — the data was already
   * synced, and a full fetch-and-parse pass per row action would be unusable.
   */
  const sendArchiveMessage = useCallback(
    (channel: ApiChannel, hashes: string[], note?: string) => {
      if (hashes.length === 0) {
        return;
      }

      sendMessage(channel, {
        hashes,
        note,
        gameType: lastReplayRequestRef.current?.gameType,
      });
    },
    [],
  );

  const archiveReplays = useCallback(
    (hashes: string[], note?: string) => {
      sendArchiveMessage(CONSTANTS.API.POST_ARCHIVE_REPLAYS, hashes, note);
    },
    [sendArchiveMessage],
  );

  const restoreReplays = useCallback(
    (hashes: string[]) => {
      sendArchiveMessage(CONSTANTS.API.POST_RESTORE_REPLAYS, hashes);
    },
    [sendArchiveMessage],
  );

  /*
   * Validation is asked for as soon as both files are known rather than at
   * confirm time, so a mismatched pairing is visible before the user commits
   * to it.
   */
  useEffect(() => {
    if (!importReplayFile || !importLogFile) {
      setImportPairValidation(null);
      return;
    }

    sendMessage(CONSTANTS.API.POST_VALIDATE_IMPORT_PAIR, {
      vcrPath: importReplayFile.filePath,
      logPath: importLogFile.filePath,
    });
  }, [importReplayFile, importLogFile]);

  const requestImportedReplays = useCallback(() => {
    sendMessage(CONSTANTS.API.GET_IMPORTED_REPLAYS);
  }, []);

  const selectImportSource = useCallback((kind: 'folder' | 'zip') => {
    setImportPreview(null);
    setImportRowLogSelections({});
    setImportOutcomes(null);
    sendMessage(CONSTANTS.API.POST_SELECT_IMPORT_SOURCE, { kind });
  }, []);

  /**
   * Closing the preview tells the main process to delete anything it unpacked.
   * An abandoned archive would otherwise sit in temp at full size.
   */
  const clearImportPreview = useCallback(() => {
    setImportPreview(null);
    setImportProgress(null);
    setImportRowLogSelections({});
    sendMessage(CONSTANTS.API.POST_DISCARD_IMPORT_PREVIEW);
  }, []);

  const clearImportOutcomes = useCallback(() => {
    setImportOutcomes(null);
  }, []);

  const importSelectedReplays = useCallback(
    (rows: unknown[], selections: ImportSelectionPayload[]) => {
      if (selections.length === 0) {
        return;
      }

      setImportOutcomes(null);
      setImportProgress({
        status: 'in-progress',
        phase: 'importing',
        processed: 0,
        total: selections.length,
      });
      sendMessage(CONSTANTS.API.POST_IMPORT_REPLAYS, { rows, selections });
    },
    [],
  );

  const selectImportFile = useCallback(
    (kind: 'replay' | 'log', rowId?: string) => {
      setImportPairError('');
      sendMessage(CONSTANTS.API.POST_SELECT_IMPORT_FILE, { kind, rowId });
    },
    [],
  );

  const importReplayPair = useCallback(
    (note?: string) => {
      if (!importReplayFile || !importLogFile) {
        return;
      }

      setIsImportingPair(true);
      setImportPairError('');
      sendMessage(CONSTANTS.API.POST_IMPORT_REPLAY_PAIR, {
        vcrPath: importReplayFile.filePath,
        logPath: importLogFile.filePath,
        note,
      });
    },
    [importReplayFile, importLogFile],
  );

  const setImportedNote = useCallback((hashes: string[], note: string) => {
    if (hashes.length === 0) {
      return;
    }

    sendMessage(CONSTANTS.API.POST_SET_IMPORTED_NOTE, { hashes, note });
  }, []);

  const resetImportPair = useCallback(() => {
    setImportReplayFile(null);
    setImportLogFile(null);
    setImportPairValidation(null);
    setImportPairError('');
    setIsImportingPair(false);
  }, []);

  const deleteImportedReplays = useCallback((hashes: string[]) => {
    if (hashes.length === 0) {
      return;
    }

    sendMessage(CONSTANTS.API.POST_DELETE_IMPORTED_REPLAYS, { hashes });
  }, []);

  const exportReplay = useCallback((request: ExportReplayPayload) => {
    setExportResult(null);
    sendMessage(CONSTANTS.API.POST_EXPORT_REPLAY, request);
  }, []);

  const [stewardDecisions, setStewardDecisions] =
    useState<StewardDecisionStore>({});

  const saveStewardDecision = useCallback((decision: StewardDecision) => {
    // Applied locally first so a call registers instantly under time pressure;
    // main replies with the authoritative collection.
    setStewardDecisions((previous) => ({
      ...previous,
      [decision.id]: decision,
    }));
    sendMessage(CONSTANTS.API.POST_STEWARD_DECISION, decision);
  }, []);

  const exportSessionData = useCallback((request: ExportSessionDataPayload) => {
    setExportResult(null);
    sendMessage(CONSTANTS.API.POST_EXPORT_SESSION_DATA, request);
  }, []);

  const exportWeekend = useCallback((request: ExportWeekendPayload) => {
    if (request.sessions.length === 0) {
      return;
    }

    setExportResult(null);
    sendMessage(CONSTANTS.API.POST_EXPORT_WEEKEND, request);
  }, []);

  const clearExportResult = useCallback(() => {
    setExportResult(null);
    setExportProgress(null);
  }, []);

  const setArchiveNote = useCallback(
    (hashes: string[], note: string) => {
      sendArchiveMessage(CONSTANTS.API.POST_ARCHIVE_NOTE, hashes, note);
    },
    [sendArchiveMessage],
  );

  useEffect(() => {
    const createHandler = (
      channel: ApiChannel,
      onData?: (data: unknown) => void,
    ) => {
      return (data: unknown) => {
        onData?.(data);
        runAdditionalCallbacks(channel, data);
      };
    };

    const messageBusHandlers = {
      [CONSTANTS.API.GET_LIVE_SESSION_STATUS]: createHandler(
        CONSTANTS.API.GET_LIVE_SESSION_STATUS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: LiveSessionStatus;
          };

          const next: LiveSessionStatus =
            payload?.status === 'success' && payload.data
              ? payload.data
              : { state: 'detached' };

          setLiveSessionStatus((previous) =>
            previous.state === next.state &&
            previous.trackName === next.trackName &&
            previous.driverCount === next.driverCount
              ? previous
              : next,
          );
        },
      ),
      // The provider holds no live session state of its own — the Live view
      // subscribes directly. It still needs an entry here, because the message
      // bus only dispatches channels present in this map, and without one main
      // replies into nothing.
      [CONSTANTS.API.GET_LIVE_SESSION_DATA]: createHandler(
        CONSTANTS.API.GET_LIVE_SESSION_DATA,
      ),
      // Same arrangement for the captured-sessions list: owned by the section
      // that renders it, but it still needs entries here to be dispatched.
      [CONSTANTS.API.GET_LIVE_SESSIONS]: createHandler(
        CONSTANTS.API.GET_LIVE_SESSIONS,
      ),
      [CONSTANTS.API.POST_DELETE_LIVE_SESSION]: createHandler(
        CONSTANTS.API.POST_DELETE_LIVE_SESSION,
      ),
      [CONSTANTS.API.GET_LIVE_SESSION_MATCHES]: createHandler(
        CONSTANTS.API.GET_LIVE_SESSION_MATCHES,
      ),
      [CONSTANTS.API.POST_LINK_LIVE_SESSION]: createHandler(
        CONSTANTS.API.POST_LINK_LIVE_SESSION,
      ),
      [CONSTANTS.API.POST_DISMISS_LIVE_SESSION_MATCH]: createHandler(
        CONSTANTS.API.POST_DISMISS_LIVE_SESSION_MATCH,
      ),
      [CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY]: createHandler(
        CONSTANTS.API.GET_LIVE_DATA_FOR_REPLAY,
      ),
      [CONSTANTS.API.GET_API_STATUS]: createHandler(
        CONSTANTS.API.GET_API_STATUS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: {
              loadingStatus?: {
                loading?: boolean;
                percentage?: number;
              };
            };
          };
          const nextLoading = payload?.data?.loadingStatus?.loading ?? false;
          const nextPercentage = payload?.data?.loadingStatus?.percentage ?? -1;

          setLoadingState((previous) => {
            if (
              previous.loading === nextLoading &&
              previous.percentage === nextPercentage
            ) {
              return previous;
            }

            return {
              loading: nextLoading,
              percentage: nextPercentage,
            };
          });
          setHasApiStatusResponse(true);
          setIsConnected(payload.status === 'success');
        },
      ),
      [CONSTANTS.API.GET_TRACK_MAP]: createHandler(
        CONSTANTS.API.GET_TRACK_MAP,
        (data: unknown) => {
          const payload = data as { status?: string; message?: string };
          if (payload?.status === 'success') {
            setCurrentTrackMap(payload as { data?: unknown });
            return;
          }

          console.error('Failed to fetch track map:', payload?.message || data);
        },
      ),
      [CONSTANTS.API.POST_SELECT_IMPORT_FILE]: createHandler(
        CONSTANTS.API.POST_SELECT_IMPORT_FILE,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: ImportFileSelection & { canceled?: boolean };
            message?: string;
          };

          if (payload?.status !== 'success') {
            setImportPairError(payload?.message ?? 'Unable to read that file.');
            return;
          }

          if (payload.data?.canceled) {
            return;
          }

          if (payload.data?.kind === 'log') {
            /*
             * A row id means the bulk preview asked, not the two-file dialog.
             * Kept apart so browsing for one row's log cannot overwrite the
             * single-import selection sitting behind it.
             */
            const rowId = payload.data.rowId ?? '';

            if (rowId) {
              setImportRowLogSelections((previous) => ({
                ...previous,
                [rowId]: payload.data as ImportFileSelection,
              }));
              return;
            }

            setImportLogFile(payload.data);
            return;
          }

          setImportReplayFile(payload.data ?? null);
        },
      ),
      [CONSTANTS.API.POST_VALIDATE_IMPORT_PAIR]: createHandler(
        CONSTANTS.API.POST_VALIDATE_IMPORT_PAIR,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: ImportPairValidationState;
            message?: string;
          };

          if (payload?.status === 'success') {
            setImportPairValidation(payload.data ?? null);
            return;
          }

          setImportPairError(
            payload?.message ?? 'Unable to check these files together.',
          );
        },
      ),
      [CONSTANTS.API.POST_IMPORT_REPLAY_PAIR]: createHandler(
        CONSTANTS.API.POST_IMPORT_REPLAY_PAIR,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: { replays?: ImportedReplayRecord[] };
            message?: string;
          };

          setIsImportingPair(false);

          if (payload?.status === 'success') {
            setImportedReplays(payload.data?.replays ?? []);
            setImportReplayFile(null);
            setImportLogFile(null);
            setImportPairValidation(null);
            return;
          }

          setImportPairError(
            payload?.message ?? 'The replay could not be imported.',
          );
        },
      ),
      [CONSTANTS.API.GET_IMPORTED_REPLAYS]: createHandler(
        CONSTANTS.API.GET_IMPORTED_REPLAYS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: ImportedReplayRecord[];
            message?: string;
          };

          if (payload?.status === 'success') {
            setImportedReplays(payload.data ?? []);
            return;
          }

          console.error('Failed to read imported replays:', payload?.message);
        },
      ),
      [CONSTANTS.API.POST_SELECT_IMPORT_SOURCE]: createHandler(
        CONSTANTS.API.POST_SELECT_IMPORT_SOURCE,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: Partial<ImportPreviewState> & { canceled?: boolean };
            message?: string;
          };

          if (payload?.status !== 'success') {
            setImportProgress({
              status: 'error',
              processed: 0,
              total: 0,
              message: payload?.message ?? 'That source could not be scanned.',
            });
            return;
          }

          if (payload.data?.canceled) {
            return;
          }

          setImportPreview({
            kind: payload.data?.kind ?? 'folder',
            sourceLabel: payload.data?.sourceLabel ?? '',
            rows: payload.data?.rows ?? [],
            manifestSessionCount: payload.data?.manifestSessionCount ?? 0,
            omittedSessions: payload.data?.omittedSessions ?? [],
            rejectedEntries: payload.data?.rejectedEntries ?? [],
          });
        },
      ),
      [CONSTANTS.API.PUSH_IMPORT_PROGRESS]: createHandler(
        CONSTANTS.API.PUSH_IMPORT_PROGRESS,
        (data: unknown) => {
          setImportProgress(data as ImportProgressState);
        },
      ),
      [CONSTANTS.API.PUSH_EXPORT_PROGRESS]: createHandler(
        CONSTANTS.API.PUSH_EXPORT_PROGRESS,
        (data: unknown) => {
          setExportProgress(data as ExportProgressState);
        },
      ),
      [CONSTANTS.API.GET_STEWARD_DECISIONS]: createHandler(
        CONSTANTS.API.GET_STEWARD_DECISIONS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: StewardDecisionStore;
          };
          if (payload?.status === 'success' && payload.data) {
            setStewardDecisions(payload.data);
          }
        },
      ),
      [CONSTANTS.API.POST_STEWARD_DECISION]: createHandler(
        CONSTANTS.API.POST_STEWARD_DECISION,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: StewardDecisionStore;
          };
          if (payload?.status === 'success' && payload.data) {
            setStewardDecisions(payload.data);
          }
        },
      ),
      [CONSTANTS.API.POST_EXPORT_SESSION_DATA]: createHandler(
        CONSTANTS.API.POST_EXPORT_SESSION_DATA,
        (data: unknown) => {
          setExportResult(toExportResult(data, 1));
        },
      ),
      [CONSTANTS.API.POST_EXPORT_REPLAY]: createHandler(
        CONSTANTS.API.POST_EXPORT_REPLAY,
        (data: unknown) => {
          setExportProgress(null);
          setExportResult(toExportResult(data, 1));
        },
      ),
      [CONSTANTS.API.POST_EXPORT_WEEKEND]: createHandler(
        CONSTANTS.API.POST_EXPORT_WEEKEND,
        (data: unknown) => {
          setExportProgress(null);
          setExportResult(toExportResult(data));
        },
      ),
      [CONSTANTS.API.POST_IMPORT_REPLAYS]: createHandler(
        CONSTANTS.API.POST_IMPORT_REPLAYS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: {
              replays?: ImportedReplayRecord[];
              outcomes?: ImportOutcomeState[];
            };
            message?: string;
          };

          if (payload?.status === 'success') {
            setImportedReplays(payload.data?.replays ?? []);
            /*
             * Outcomes are per row: a failed replay does not fail the run, so
             * "imported 5" is only half the story when the sixth rolled back.
             * Closing the preview is what clears them.
             */
            setImportOutcomes(payload.data?.outcomes ?? []);
            setImportPreview(null);
            setImportRowLogSelections({});
            return;
          }

          setImportOutcomes([]);
          console.error('Failed to import replays:', payload?.message);
        },
      ),
      [CONSTANTS.API.POST_SET_IMPORTED_NOTE]: createHandler(
        CONSTANTS.API.POST_SET_IMPORTED_NOTE,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: { replays?: ImportedReplayRecord[] };
            message?: string;
          };

          if (payload?.status === 'success') {
            setImportedReplays(payload.data?.replays ?? []);
            return;
          }

          console.error('Failed to save the note:', payload?.message);
        },
      ),
      [CONSTANTS.API.POST_DELETE_IMPORTED_REPLAYS]: createHandler(
        CONSTANTS.API.POST_DELETE_IMPORTED_REPLAYS,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: { replays?: ImportedReplayRecord[] };
            message?: string;
          };

          if (payload?.status === 'success') {
            setImportedReplays(payload.data?.replays ?? []);
            return;
          }

          console.error('Failed to delete imported replays:', payload?.message);
        },
      ),
      [CONSTANTS.API.GET_REPLAYS]: createHandler(
        CONSTANTS.API.GET_REPLAYS,
        (data: unknown) => {
          const payload = data as ReplayResponse & { message?: string };
          setActiveReplaySyncRequestCount((previousCount) =>
            Math.max(0, previousCount - 1),
          );
          setReplays(payload);

          if (payload?.status === 'success') {
            setLastReplaySyncAt(Date.now());
            setReplaySyncStatus((previous) => ({
              ...previous,
              status: 'success',
              percentage: 1,
            }));
            return;
          }

          setReplaySyncStatus((previous) => ({
            ...previous,
            status: 'error',
            message: payload?.message,
          }));
        },
      ),
      [CONSTANTS.API.POST_ARCHIVE_REPLAYS]: createHandler(
        CONSTANTS.API.POST_ARCHIVE_REPLAYS,
        applyArchiveActionPayload,
      ),
      [CONSTANTS.API.POST_RESTORE_REPLAYS]: createHandler(
        CONSTANTS.API.POST_RESTORE_REPLAYS,
        applyArchiveActionPayload,
      ),
      [CONSTANTS.API.POST_ARCHIVE_NOTE]: createHandler(
        CONSTANTS.API.POST_ARCHIVE_NOTE,
        applyArchiveActionPayload,
      ),
      [CONSTANTS.API.PUSH_REPLAY_SYNC_STATUS]: createHandler(
        CONSTANTS.API.PUSH_REPLAY_SYNC_STATUS,
        (data: unknown) => {
          const payload = data as ReplaySyncStatus;
          const normalizedPercentage = Math.max(
            0,
            Math.min(1, Number(payload?.percentage ?? 0)),
          );
          const normalizedProcessed = Math.max(
            0,
            Number(payload?.processed ?? 0),
          );
          const normalizedTotal = Math.max(0, Number(payload?.total ?? 0));

          setReplaySyncStatus({
            status: payload?.status ?? 'idle',
            percentage: normalizedPercentage,
            processed: normalizedProcessed,
            total: normalizedTotal,
            message: payload?.message,
          });
        },
      ),
      [CONSTANTS.API.GET_IS_REPLAY_ACTIVE]: createHandler(
        CONSTANTS.API.GET_IS_REPLAY_ACTIVE,
        (data: unknown) => {
          const payload = data as { status?: string; data?: boolean };
          if (payload?.status === 'success') {
            setIsReplayActive(Boolean(payload?.data));
            return;
          }

          setIsReplayActive(null);
        },
      ),
      [CONSTANTS.API.POST_WATCH_REPLAY]: createHandler(
        CONSTANTS.API.POST_WATCH_REPLAY,
        (data: unknown) => {
          const payload = data as {
            status?: string;
            data?: LMUReplay;
            message?: string;
          };

          if (payload.status === 'success') {
            setCurrentReplay(payload.data ?? null);
          } else {
            console.error('Failed to set replay as active:', payload.message);
          }
        },
      ),
      [CONSTANTS.API.GET_STANDINGS]: createHandler(CONSTANTS.API.GET_STANDINGS),
      [CONSTANTS.API.GET_STANDINGS_HISTORY]: createHandler(
        CONSTANTS.API.GET_STANDINGS_HISTORY,
      ),
      [CONSTANTS.API.GET_USER_SETTINGS]: createHandler(
        CONSTANTS.API.GET_USER_SETTINGS,
        applyUserSettingsPayload,
      ),
      [CONSTANTS.API.PUSH_USER_SETTINGS]: createHandler(
        CONSTANTS.API.PUSH_USER_SETTINGS,
        applyUserSettingsPayload,
      ),
      [CONSTANTS.API.POST_USER_SETTINGS]: createHandler(
        CONSTANTS.API.POST_USER_SETTINGS,
        applyUserSettingsPayload,
      ),
      [CONSTANTS.API.POST_DASHBOARD_VIEW]: createHandler(
        CONSTANTS.API.POST_DASHBOARD_VIEW,
        applyUserSettingsPayload,
      ),
      [CONSTANTS.API.GET_SESSION_INFO]: createHandler(
        CONSTANTS.API.GET_SESSION_INFO,
      ),
      [CONSTANTS.API.POST_CLOSE_REPLAY]: createHandler(
        CONSTANTS.API.POST_CLOSE_REPLAY,
      ),
    };

    initializeMessageBus(messageBusHandlers);
  }, [
    applyArchiveActionPayload,
    applyUserSettingsPayload,
    runAdditionalCallbacks,
    setIsConnected,
    setCurrentTrackMap,
    setReplays,
  ]);

  useEffect(() => {
    return () => {
      additionalCallbacksRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (loadingState.loading) {
      setApiStatusInterval(1000); // Check more frequently when loading
    } else {
      setApiStatusInterval(5000); // Check less frequently when not loading
    }
  }, [loadingState]);

  useEffect(() => {
    // Poll for API status updates
    const checkConnection = async () => {
      sendMessage(CONSTANTS.API.GET_API_STATUS);
      sendMessage(CONSTANTS.API.GET_LIVE_SESSION_STATUS);
    };
    checkConnection();
    sendMessage(CONSTANTS.API.GET_USER_SETTINGS);
    // Loaded once at startup; every later change comes back on the write reply.
    sendMessage(CONSTANTS.API.GET_STEWARD_DECISIONS);
    const _id = setInterval(checkConnection, apiStatusInterval);
    return () => {
      clearInterval(_id);
    };
  }, [apiStatusInterval]);

  const contextValue: ApiContextType = useMemo(
    () => ({
      isConnected,
      hasApiStatusResponse,
      liveSessionStatus,
      hasUserSettingsResponse,
      quickViewEnabled,
      experimentalFeaturesEnabled,
      liveCaptureEnabled:
        experimentalFeaturesEnabled && liveCaptureSettingEnabled,
      persistDashboardFiltersEnabled,
      persistedDashboardView,
      lastReplaySyncAt,
      isReplaySyncInProgress: activeReplaySyncRequestCount > 0,
      replaySyncStatus,
      isReplayActive,
      currentTrackMap,
      replays,
      importedReplays,
      importPreview,
      importProgress,
      currentReplay,
      loadingState,
      markReplayCacheResetRequired,
      requestReplays,
      archiveReplays,
      restoreReplays,
      setArchiveNote,
      requestImportedReplays,
      selectImportSource,
      importRowLogSelections,
      importOutcomes,
      clearImportOutcomes,
      importReplayFile,
      importLogFile,
      importPairValidation,
      importPairError,
      isImportingPair,
      selectImportFile,
      importReplayPair,
      setImportedNote,
      resetImportPair,
      clearImportPreview,
      importSelectedReplays,
      deleteImportedReplays,
      exportReplay,
      exportWeekend,
      exportSessionData,
      stewardDecisions,
      saveStewardDecision,
      exportProgress,
      exportResult,
      clearExportResult,
      subscribeToApiChannel,
    }),
    [
      isConnected,
      hasApiStatusResponse,
      liveSessionStatus,
      hasUserSettingsResponse,
      quickViewEnabled,
      experimentalFeaturesEnabled,
      liveCaptureSettingEnabled,
      persistDashboardFiltersEnabled,
      persistedDashboardView,
      lastReplaySyncAt,
      activeReplaySyncRequestCount,
      replaySyncStatus,
      isReplayActive,
      currentTrackMap,
      replays,
      importedReplays,
      importPreview,
      importProgress,
      currentReplay,
      loadingState,
      markReplayCacheResetRequired,
      requestReplays,
      archiveReplays,
      restoreReplays,
      setArchiveNote,
      requestImportedReplays,
      selectImportSource,
      importRowLogSelections,
      importOutcomes,
      clearImportOutcomes,
      importReplayFile,
      importLogFile,
      importPairValidation,
      importPairError,
      isImportingPair,
      selectImportFile,
      importReplayPair,
      setImportedNote,
      resetImportPair,
      clearImportPreview,
      importSelectedReplays,
      deleteImportedReplays,
      exportReplay,
      exportWeekend,
      exportSessionData,
      stewardDecisions,
      saveStewardDecision,
      exportProgress,
      exportResult,
      clearExportResult,
      subscribeToApiChannel,
    ],
  );

  return (
    <ApiContext.Provider value={contextValue}>{children}</ApiContext.Provider>
  );
};

export const useApi = () => useContext(ApiContext);
