export interface ExperimentalFeature {
  id: string;
  name: string;
  description: string;
}

/**
 * Everything currently gated behind the Experimental Features setting.
 *
 * This is the only list. The settings card renders straight from it, so
 * graduating a feature is deleting its entry and removing the gate — there is
 * no second place that can be left claiming something is still experimental.
 *
 * Annotated rather than left to `as const` inference on purpose: a const
 * assertion narrows this to a fixed-length tuple, which makes TypeScript reject
 * the `length === 0` check the card's empty state depends on. Emptying this
 * array is the expected end state, not an edge case.
 */
const EXPERIMENTAL_FEATURES: ExperimentalFeature[] = [
  {
    id: 'replay-import-export',
    name: 'Replay Import & Export',
    description:
      'Import replays recorded on another PC, and export a replay with its result log to share with someone else.',
  },
  {
    id: 'live-stewarding',
    name: 'Live Stewarding',
    description:
      'Watch a session as it runs and capture incidents in real time, with evidence and camera dispatch. Needs its own switch under Live Capture, and reads LMU shared memory while the game is running.',
  },
];

/**
 * How far before an incident the picture lands when the app seeks to it.
 *
 * A steward dropped exactly on the contact sees the aftermath; what they are
 * adjudicating is the approach. Five seconds was already the replay view's
 * answer in two places, and the live view's Rewatch has to agree with it — the
 * same button on two screens seeking to two different moments is the kind of
 * disagreement nobody reports as a bug and everybody distrusts.
 */
export const REPLAY_INCIDENT_LEAD_IN_SECONDS = 5;

/** The seek target for an incident at `etSeconds`, never before the session start. */
export const replayJumpTargetSeconds = (etSeconds: number): number =>
  Math.max(etSeconds - REPLAY_INCIDENT_LEAD_IN_SECONDS, 0);

export const CONSTANTS = {
  LMU_API_BASE_URL: 'http://localhost:6397',
  LMU_DEFAULT_EXECUTABLE_PATH:
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\Le Mans Ultimate.exe',
  LMU_DEFAULT_REPLAY_DIRECTORY_PATH:
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays',
  API: {
    GET_TRACK_MAP: 'get.track-map',
    /**
     * The same `/rest/watch/trackMap` geometry, on a channel of its own.
     *
     * Deliberately not `GET_TRACK_MAP`. That channel's reply is handled in
     * `ApiContext` and written to `currentTrackMap`, which the replay view reads
     * in preference to the map cached against the replay it has open — so a live
     * fetch on the shared channel would silently substitute the running
     * session's geometry into a replay's heatmap, and a later replay fetch would
     * do the same to the live map. The two also want different fetch
     * lifecycles: the replay asks once when a replay loads, the live map retries
     * until the game has geometry to give.
     */
    GET_LIVE_TRACK_MAP: 'get.live-track-map',
    GET_API_STATUS: 'get.api-status',
    GET_LIVE_SESSION_STATUS: 'get.live-session-status',
    GET_LIVE_SESSION_DATA: 'get.live-session-data',
    /**
     * Where every car is, and nothing else, at the rate the game publishes it.
     *
     * `/rest/watch/standings` updates `carPosition` at ~5 Hz — LMU's scoring
     * rate — while the sidecar emits the whole session line at a flat 1 Hz. Four
     * of every five position samples were being discarded, and at Laguna's top
     * speed a car covers five marker-widths between 1 Hz ticks.
     *
     * Deliberately not `GET_LIVE_SESSION_DATA` at 5 Hz. That channel serialises
     * the whole retained incident array every tick (`MAX_RETAINED_INCIDENTS` is
     * 500), which is the cost Step 2 exists to contain — and it would still
     * deliver 1 Hz positions, because the sidecar only emits that often. This
     * one reduces a 71 KB response to a few hundred bytes in main, before
     * anything crosses IPC.
     */
    GET_LIVE_CAR_POSITIONS: 'get.live-car-positions',
    GET_REPLAYS: 'get.replays',
    GET_USER_SETTINGS: 'get.user-settings',
    PUSH_USER_SETTINGS: 'push.user-settings',
    PUSH_REPLAY_SYNC_STATUS: 'push.replay-sync-status',
    GET_PROFILE_INFO: 'get.profile-info',
    GET_STANDINGS_HISTORY: 'get.standings-history',
    GET_STANDINGS: 'get.standings',
    GET_IS_REPLAY_ACTIVE: 'get.is-replay-active',
    GET_SESSION_INFO: 'get.session-info',
    GET_FOCUSED_CAR: 'get.focused-car',
    /**
     * What the game's camera is actually set to — `{cameraName,
     * currentCameraGroup}` from `/rest/replay/CameraController/getCameraInfo`.
     *
     * The other half of "ask the game what it is showing". `GET_FOCUSED_CAR`
     * answers *which car* and carries no camera group; this answers *which
     * group* and carries no slot id. Neither can reconcile the other's value,
     * so the camera bar reads both.
     */
    GET_CAMERA_INFO: 'get.camera-info',
    GET_STORAGE_DEBUG_INFO: 'get.storage-debug-info',
    GET_CAREER_SUMMARY: 'get.career-summary',
    POST_CAREER_RESCAN: 'post.career-rescan',
    POST_CAREER_CLAIM_IDENTITY: 'post.career-claim-identity',
    POST_CAREER_EXCLUDE_SESSION: 'post.career-exclude-session',
    POST_USER_SETTINGS: 'post.user-settings',
    POST_DASHBOARD_VIEW: 'post.dashboard-view',
    POST_WATCH_REPLAY: 'post.watch-replay',
    POST_ARCHIVE_REPLAYS: 'post.archive-replays',
    POST_RESTORE_REPLAYS: 'post.restore-replays',
    POST_ARCHIVE_NOTE: 'post.archive-note',
    POST_CAMERA_ANGLE: 'post.camera-angle',
    /**
     * Show the steward a moment from the live session's own replay buffer.
     *
     * Two intent-named channels rather than one `toggleactive` passthrough,
     * because `/rest/replay/toggleactive` is a **toggle with no setter** —
     * there is no `setActive` among LMU's 179 endpoints. Every caller therefore
     * has to read `/rest/replay/isActive` first and act on the answer, and a
     * renderer holding a polled copy would eventually act on a stale one: the
     * steward can press the game's own LIVE button between the poll and the
     * click, and the bar would then do the exact opposite of what its label
     * says.
     *
     * So the read-then-act sequence lives in main, next to the calls, and the
     * raw toggle is never exposed. That also settles the ordering constraint
     * for free — `replaytime` is inert while `isActive` is false, returning 200
     * and doing nothing — and makes it impossible to enter replay mode without
     * a seek target, which would drop the steward at lap 1.
     */
    POST_REPLAY_REWATCH: 'post.replay-rewatch',
    /** Return the game's picture to the live edge. A no-op if already live. */
    POST_REPLAY_RETURN_TO_LIVE: 'post.replay-return-to-live',
    POST_CLOSE_REPLAY: 'post.close-replay',
    POST_CLOSE_LMU: 'post.close-lmu',
    POST_CLEAR_LOCAL_STORAGE: 'post.clear-local-storage',
    POST_LAUNCH_LMU: 'post.launch-lmu',
    POST_OPEN_SETTINGS: 'post.open-settings',
    POST_SELECT_LMU_EXECUTABLE: 'post.select-lmu-executable',
    POST_SELECT_LMU_REPLAY_DIRECTORY: 'post.select-lmu-replay-directory',
    POST_RENDERER_ERROR: 'post.renderer-error',
    REQUEST_APP_EXIT_CONFIRM: 'request.app-exit-confirm',
    REPLY_APP_EXIT_CONFIRM: 'reply.app-exit-confirm',
    PUT_REPLAY_COMMAND_SCAN: 'put.replay-command-scan',
    PUT_REPLAY_COMMAND_TIME: 'put.replay-command-time',
    PUT_REPLAY_COMMAND_FOCUS_CAR: 'put.replay-command-focus-car',
    POST_REPLAY_COMMAND_UI: 'post.replay-command-ui',
    PUT_FOCUS_CAR: 'put.focus-car',
    GET_IMPORTED_REPLAYS: 'get.imported-replays',
    POST_SELECT_IMPORT_SOURCE: 'post.select-import-source',
    POST_DISCARD_IMPORT_PREVIEW: 'post.discard-import-preview',
    POST_SELECT_IMPORT_FILE: 'post.select-import-file',
    POST_VALIDATE_IMPORT_PAIR: 'post.validate-import-pair',
    POST_IMPORT_REPLAY_PAIR: 'post.import-replay-pair',
    POST_IMPORT_REPLAYS: 'post.import-replays',
    POST_DELETE_IMPORTED_REPLAYS: 'post.delete-imported-replays',
    GET_LIVE_SESSIONS: 'get.live-sessions',
    /**
     * The segments of the weekend the live view is showing, and on request the
     * persisted record of one of them.
     *
     * Deliberately not `GET_LIVE_SESSIONS`, which answers with *every* captured
     * session ever and runs a replay-matching pass over the replay directory as
     * it does so. That pass is right when a human opens the captured-sessions
     * list and wrong on a channel the live view refreshes while a race is
     * running. This one reads two collections off disk and nothing else.
     *
     * One channel rather than two — a list channel and a record channel — for a
     * blunter reason: a channel with no `messageBusHandlers` entry in
     * `ApiContext` is silently dead, and that has cost three debugging sessions.
     * Fewer channels, fewer chances.
     */
    GET_LIVE_SESSION_SEGMENTS: 'get.live-session-segments',
    POST_DELETE_LIVE_SESSION: 'post.delete-live-session',
    /** Ranked replays a captured session might belong to. Nothing is linked. */
    GET_LIVE_SESSION_MATCHES: 'get.live-session-matches',
    POST_LINK_LIVE_SESSION: 'post.link-live-session',
    POST_DISMISS_LIVE_SESSION_MATCH: 'post.dismiss-live-session-match',
    /** A replay's linked captured session, for merging onto its incidents. */
    GET_LIVE_DATA_FOR_REPLAY: 'get.live-data-for-replay',
    /** One incident's trace window. Fetched only when a dossier opens. */
    GET_LIVE_INCIDENT_CONTEXT: 'get.live-incident-context',
    /** What a retention window would delete, before anything is deleted. */
    GET_LIVE_RETENTION_PREVIEW: 'get.live-retention-preview',
    /** Counts for the clear-storage warning: what exists nowhere else. */
    GET_LOCAL_DATA_SUMMARY: 'get.local-data-summary',
    POST_SET_IMPORTED_NOTE: 'post.set-imported-note',
    POST_EXPORT_REPLAY: 'post.export-replay',
    POST_EXPORT_WEEKEND: 'post.export-weekend',
    /** The session *record* as CSV/Markdown/JSON — not the replay archive. */
    POST_EXPORT_SESSION_DATA: 'post.export-session-data',
    GET_STEWARD_DECISIONS: 'get.steward-decisions',
    POST_STEWARD_DECISION: 'post.steward-decision',
    PUSH_IMPORT_PROGRESS: 'push.import-progress',
    PUSH_EXPORT_PROGRESS: 'push.export-progress',
  },
  TRACK_META_DATA: {
    PORTIMAOELMS: {
      displayName: 'Algarve International Circuit',
      background: '/start/images/tracks/backgrounds/portimaowec.webp',
      logo: '/start/images/tracks/logos/portimaowec.svg',
      abbr: 'AIA',
      location: 'Portimão, Portugal',
      aliases: [
        'Algarve International Circuit',
        '4 Hours of Portimao',
        'Algarve International Circuit 1.23',
      ],
    },
    PORTIMAOWEC: {
      displayName: 'Algarve International Circuit',
      background: '/start/images/tracks/backgrounds/portimaowec.webp',
      logo: '/start/images/tracks/logos/portimaowec.svg',
      abbr: 'AIA',
      location: 'Portimão, Portugal',
      aliases: [
        'Algarve International Circuit',
        '6 Hours of Portimao',
        'Algarve International Circuit 1.21',
        'Algarve International Circuit 1.23',
      ],
    },
    IMOLAELMS: {
      displayName: 'Autodromo Enzo e Dino Ferrari (ELMS)',
      background: '/start/images/tracks/backgrounds/imolawec.webp',
      logo: '/start/images/tracks/logos/imolawec.svg',
      abbr: 'IML',
      location: 'Imola, Italy',
      aliases: [
        'Autodromo Enzo e Dino Ferrari',
        '4 Hours of Imola',
        'Autodromo Enzo e Dino Ferrari 1.23',
        'Autodromo Enzo e Dino Ferrari 1.27',
      ],
    },
    IMOLAWEC: {
      displayName: 'Autodromo Enzo e Dino Ferrari',
      background: '/start/images/tracks/backgrounds/imolawec.webp',
      logo: '/start/images/tracks/logos/imolawec.svg',
      abbr: 'IML',
      location: 'Imola, Italy',
      aliases: [
        'Autodromo Enzo e Dino Ferrari',
        '6 Hours of Imola',
        'Autodromo Enzo e Dino Ferrari 1.21',
        'Autodromo Enzo e Dino Ferrari 1.23',
        'Autodromo Enzo e Dino Ferrari 1.27',
      ],
    },
    MONZAWEC: {
      displayName: 'Autodromo Nazionale Monza',
      background: '/start/images/tracks/backgrounds/monzawec.webp',
      logo: '/start/images/tracks/logos/monzawec.svg',
      abbr: 'MNZ',
      location: 'Monza, Italy',
      aliases: [
        'Autodromo Nazionale Monza',
        '6 Hours of Monza',
        'Autodromo Nazionale Monza 1.21',
        'Autodromo Nazionale Monza 1.27',
        'Autodromo Nazionale Monza 1.29',
      ],
    },
    MONZAWEC_GRANDE: {
      displayName: 'Autodromo Nazionale Monza (Grande)',
      background: '/start/images/tracks/backgrounds/monzawec.webp',
      logo: '/start/images/tracks/logos/monzawec.svg',
      abbr: 'MNZ',
      location: 'Monza, Italy',
      aliases: [
        'Autodromo Nazionale Monza',
        'Monza Curva Grande Circuit',
        'Autodromo Nazionale Monza 1.21',
        'Autodromo Nazionale Monza 1.27',
        'Autodromo Nazionale Monza 1.29',
      ],
    },
    INTERLAGOSWEC: {
      displayName: 'Autódromo José Carlos Pace',
      background: '/start/images/tracks/backgrounds/interlagoswec.webp',
      logo: '/start/images/tracks/logos/interlagoswec.svg',
      abbr: 'IGL',
      location: 'São Paulo, Brazil',
      aliases: [
        'Autódromo José Carlos Pace',
        'Rolex 6 Hours Of Sao Paulo',
        'Autódromo José Carlos Pace 1.21',
        'Autódromo José Carlos Pace 1.27',
      ],
    },
    BAHRAINWEC: {
      displayName: 'Bahrain International Circuit',
      background: '/start/images/tracks/backgrounds/bahrainwec.webp',
      logo: '/start/images/tracks/logos/bahrainwec.svg',
      abbr: 'BIC',
      location: 'Sakhir, Bahrain',
      aliases: [
        'Bahrain International Circuit',
        '8 Hours of Bahrain',
        'Bahrain International Circuit 1.23',
        'Bahrain International Circuit 1.25',
      ],
    },
    BAHRAINWEC_ENDCE: {
      displayName: 'Bahrain International Circuit (Endurance)',
      background: '/start/images/tracks/backgrounds/bahrainwec.webp',
      logo: '/start/images/tracks/logos/bahrainwec.svg',
      abbr: 'BIC',
      location: 'Sakhir, Bahrain',
      aliases: [
        'Bahrain Endurance Circuit',
        'Bahrain International Circuit',
        'Bahrain International Circuit 1.23',
        'Bahrain International Circuit 1.25',
      ],
    },
    BAHRAINWEC_OUTER: {
      displayName: 'Bahrain International Circuit (Outer)',
      background: '/start/images/tracks/backgrounds/bahrainwec.webp',
      logo: '/start/images/tracks/logos/bahrainwec.svg',
      abbr: 'BIC',
      location: 'Sakhir, Bahrain',
      aliases: [
        'Bahrain Outer Circuit',
        'Bahrain International Circuit',
        'Bahrain International Circuit 1.23',
        'Bahrain International Circuit 1.25',
      ],
    },
    BAHRAINWEC_PADDOCK: {
      displayName: 'Bahrain International Circuit (Paddock)',
      background: '/start/images/tracks/backgrounds/bahrainwec.webp',
      logo: '/start/images/tracks/logos/bahrainwec.svg',
      abbr: 'BIC',
      location: 'Sakhir, Bahrain',
      aliases: [
        'Bahrain Paddock Circuit',
        'Bahrain International Circuit',
        'Bahrain International Circuit 1.23',
        'Bahrain International Circuit 1.25',
      ],
    },
    BARCELONAELMS: {
      displayName: 'Circuit de Barcelona-Catalunya',
      background: '/start/images/tracks/backgrounds/barcelonaelms.webp',
      logo: '/start/images/tracks/logos/barcelonaelms.svg',
      abbr: 'BCN',
      location: 'Barcelona, Spain',
      aliases: [
        '4 Hours of Barcelona',
        'Circuit de Barcelona',
        'Circuit de Barcelona 1.01',
        'Circuit de Barcelona 1.03',
      ],
    },
    SPAELMS: {
      displayName: 'Circuit de Spa-Francorchamps (ELMS)',
      background: '/start/images/tracks/backgrounds/spawec.webp',
      logo: '/start/images/tracks/logos/spawec.svg',
      abbr: 'SPA',
      location: 'Stavelot, Belgium',
      aliases: [
        '4 Hours of Spa-Francorchamps',
        'Circuit de Spa-Francorchamps',
        'Circuit de Spa-Francorchamps 1.23',
        'Circuit de Spa-Francorchamps 1.29',
      ],
    },
    SPAWEC: {
      displayName: 'Circuit de Spa-Francorchamps',
      background: '/start/images/tracks/backgrounds/spawec.webp',
      logo: '/start/images/tracks/logos/spawec.svg',
      abbr: 'SPA',
      location: 'Stavelot, Belgium',
      aliases: [
        '6 Hours of Spa-Francorchamps',
        'Circuit de Spa-Francorchamps',
        'Circuit de Spa-Francorchamps 1.21',
        'Circuit de Spa-Francorchamps 1.23',
        'Circuit de Spa-Francorchamps 1.29',
      ],
    },
    SPAWEC_ENDCE: {
      displayName: 'Circuit de Spa-Francorchamps (Endurance)',
      background: '/start/images/tracks/backgrounds/spawec.webp',
      logo: '/start/images/tracks/logos/spawec.svg',
      abbr: 'SPA',
      location: 'Stavelot, Belgium',
      aliases: [
        'Circuit de Spa-Francorchamps Endurance',
        'Circuit de Spa-Francorchamps',
        'Circuit de Spa-Francorchamps 1.21',
        'Circuit de Spa-Francorchamps 1.23',
        'Circuit de Spa-Francorchamps 1.29',
      ],
    },
    LEMANSWEC: {
      displayName: 'Circuit de la Sarthe',
      background: '/start/images/tracks/backgrounds/lemanswec.webp',
      logo: '/start/images/tracks/logos/lemanswec.svg',
      abbr: 'LM',
      location: 'Le Mans, France',
      aliases: [
        '24 Heures du Mans',
        'Circuit de la Sarthe',
        'Circuit de la Sarthe 1.21',
        'Circuit de la Sarthe 1.27',
        'Circuit de la Sarthe 1.33',
      ],
    },
    LEMANSWEC_MULSANNE: {
      displayName: 'Circuit de la Sarthe (Mulsanne)',
      background: '/start/images/tracks/backgrounds/lemanswec.webp',
      logo: '/start/images/tracks/logos/lemanswec.svg',
      abbr: 'LM',
      location: 'Le Mans, France',
      aliases: [
        'Circuit de la Sarthe Mulsanne',
        'Circuit de la Sarthe',
        'Circuit de la Sarthe 1.21',
        'Circuit de la Sarthe 1.27',
        'Circuit de la Sarthe 1.33',
      ],
    },
    COTAWEC: {
      displayName: 'Circuit of the Americas',
      background: '/start/images/tracks/backgrounds/cotawec.webp',
      logo: '/start/images/tracks/logos/cotawec.svg',
      abbr: 'COTA',
      location: 'Austin, Texas, USA',
      aliases: [
        'Lone Star Le Mans',
        'Circuit of the Americas',
        'Circuit of the Americas 1.21',
        'Circuit of the Americas 1.27',
      ],
    },
    COTAWEC_NATIONAL: {
      displayName: 'Circuit of the Americas (National)',
      background: '/start/images/tracks/backgrounds/cotawec.webp',
      logo: '/start/images/tracks/logos/cotawec.svg',
      abbr: 'COTA',
      location: 'Austin, Texas, USA',
      aliases: [
        'COTA National Circuit',
        'Circuit of the Americas',
        'Circuit of the Americas 1.21',
        'Circuit of the Americas 1.27',
      ],
    },
    DAYTONARC: {
      displayName: 'Daytona International Speedway',
      background: '/start/images/tracks/backgrounds/daytona.webp',
      logo: '/start/images/tracks/logos/daytona.svg',
      abbr: 'DAY',
      location: 'Daytona Beach, Florida, USA',
      aliases: [
        'Daytona International Speedway Road Course',
        'Daytona International Speedway',
        'Daytona International Speedway 1.01',
      ],
    },
    FUJIWEC: {
      displayName: 'Fuji Speedway',
      background: '/start/images/tracks/backgrounds/fujiwec.webp',
      logo: '/start/images/tracks/logos/fujiwec.svg',
      abbr: 'FSW',
      location: 'Oyama, Japan',
      aliases: [
        '6 Hours of Fuji',
        'Fuji Speedway',
        'Fuji Speedway 1.21',
        'Fuji Speedway 1.27',
      ],
    },
    FUJIWEC_CL: {
      displayName: 'Fuji Speedway (Classic)',
      background: '/start/images/tracks/backgrounds/fujiwec.webp',
      logo: '/start/images/tracks/logos/fujiwec.svg',
      abbr: 'FSW',
      location: 'Oyama, Japan',
      aliases: [
        'Fuji Speedway Classic',
        'Fuji Speedway',
        'Fuji Speedway 1.21',
        'Fuji Speedway 1.27',
      ],
    },
    QATARWEC: {
      displayName: 'Lusail International Circuit',
      background: '/start/images/tracks/backgrounds/qatarwec.webp',
      logo: '/start/images/tracks/logos/qatarwec.svg',
      abbr: 'LIC',
      location: 'Lusail, Qatar',
      aliases: [
        'Qatar 1812KM',
        'Lusail International Circuit',
        'Lusail International Circuit 1.21',
        'Lusail International Circuit 1.27',
      ],
    },
    QATARWEC_SHORT: {
      displayName: 'Lusail International Circuit (Short)',
      background: '/start/images/tracks/backgrounds/qatarwec.webp',
      logo: '/start/images/tracks/logos/qatarwec.svg',
      abbr: 'LIC',
      location: 'Lusail, Qatar',
      aliases: [
        'Lusail Short Circuit',
        'Lusail International Circuit',
        'Lusail International Circuit 1.21',
        'Lusail International Circuit 1.27',
      ],
    },
    PAULRICARDELMS: {
      displayName: 'Paul Ricard Circuit',
      background: '/start/images/tracks/backgrounds/paulricardelms.webp',
      logo: '/start/images/tracks/logos/paulricardelms.svg',
      abbr: 'PR',
      location: 'Le Castellet, France',
      aliases: [
        '4 Hours of Castellet',
        'Paul Ricard Circuit',
        'Paul Ricard Circuit 1.05',
        'Paul Ricard Circuit 1.07',
      ],
    },
    PAULRICARD1A: {
      displayName: 'Paul Ricard Circuit (1A)',
      background: '/start/images/tracks/backgrounds/paulricardelms.webp',
      logo: '/start/images/tracks/logos/paulricardelms.svg',
      abbr: 'PR',
      location: 'Le Castellet, France',
      aliases: [
        'Paul Ricard - 1A',
        'Paul Ricard Circuit',
        'Paul Ricard Circuit 1.07',
      ],
    },
    'PAULRICARD1A-V2': {
      displayName: 'Paul Ricard Circuit (1A-V2)',
      background: '/start/images/tracks/backgrounds/paulricardelms.webp',
      logo: '/start/images/tracks/logos/paulricardelms.svg',
      abbr: 'PR',
      location: 'Le Castellet, France',
      aliases: [
        'Paul Ricard - 1A-V2',
        'Paul Ricard Circuit',
        'Paul Ricard Circuit 1.07',
      ],
    },
    'PAULRICARD1A-V2-SHORT': {
      displayName: 'Paul Ricard Circuit (1A-V2-Short)',
      background: '/start/images/tracks/backgrounds/paulricardelms.webp',
      logo: '/start/images/tracks/logos/paulricardelms.svg',
      abbr: 'PR',
      location: 'Le Castellet, France',
      aliases: [
        'Paul Ricard - 1A-V2-Short',
        'Paul Ricard Circuit',
        'Paul Ricard Circuit 1.07',
      ],
    },
    PAULRICARD3A: {
      displayName: 'Paul Ricard Circuit (3A)',
      background: '/start/images/tracks/backgrounds/paulricardelms.webp',
      logo: '/start/images/tracks/logos/paulricardelms.svg',
      abbr: 'PR',
      location: 'Le Castellet, France',
      aliases: [
        'Paul Ricard - 3A',
        'Paul Ricard Circuit',
        'Paul Ricard Circuit 1.07',
      ],
    },
    SEBRINGWEC: {
      displayName: 'Sebring International Raceway',
      background: '/start/images/tracks/backgrounds/sebringwec.webp',
      logo: '/start/images/tracks/logos/sebringwec.svg',
      abbr: 'SEB',
      location: 'Sebring, Florida, USA',
      aliases: [
        '1000 Miles of Sebring',
        'Sebring International Raceway',
        'Sebring International Raceway 1.23',
        'Sebring International Raceway 1.27',
      ],
    },
    SEBRINGWEC_SCHOOL: {
      displayName: 'Sebring International Raceway (School)',
      background: '/start/images/tracks/backgrounds/sebringwec.webp',
      logo: '/start/images/tracks/logos/sebringwec.svg',
      abbr: 'SEB',
      location: 'Sebring, Florida, USA',
      aliases: [
        'Sebring School Circuit',
        'Sebring International Raceway',
        'Sebring International Raceway 1.23',
        'Sebring International Raceway 1.27',
      ],
    },
    SILVERSTONEELMS: {
      displayName: 'Silverstone Circuit',
      background: '/start/images/tracks/backgrounds/silverstoneelms.webp',
      logo: '/start/images/tracks/logos/silverstoneelms.svg',
      abbr: 'SIL',
      location: 'Silverstone, United Kingdom',
      aliases: [
        '4 Hours of Silverstone',
        'Silverstone Circuit',
        'Silverstone Circuit 1.07',
        'Silverstone Circuit 1.09',
        'Silverstone Circuit 1.11',
      ],
    },
    SILVERSTONEWEC: {
      displayName: 'Silverstone Circuit (WEC)',
      background: '/start/images/tracks/backgrounds/silverstoneelms.webp',
      logo: '/start/images/tracks/logos/silverstoneelms.svg',
      abbr: 'SIL',
      location: 'Silverstone, United Kingdom',
      aliases: [
        '6 Hours of Silverstone',
        'Silverstone Circuit',
        'Silverstone Circuit 1.09',
        'Silverstone Circuit 1.11',
      ],
    },
    SILVERSTONE_INTERNATIONAL: {
      displayName: 'Silverstone Circuit (International)',
      background: '/start/images/tracks/backgrounds/silverstoneelms.webp',
      logo: '/start/images/tracks/logos/silverstoneelms.svg',
      abbr: 'SIL',
      location: 'Silverstone, United Kingdom',
      aliases: [
        'Silverstone International Circuit',
        'Silverstone Circuit',
        'Silverstone Circuit 1.09',
        'Silverstone Circuit 1.11',
      ],
    },
    SILVERSTONE_NATIONAL: {
      displayName: 'Silverstone Circuit (National)',
      background: '/start/images/tracks/backgrounds/silverstoneelms.webp',
      logo: '/start/images/tracks/logos/silverstoneelms.svg',
      abbr: 'SIL',
      location: 'Silverstone, United Kingdom',
      aliases: [
        'Silverstone National Circuit',
        'Silverstone Circuit',
        'Silverstone Circuit 1.09',
        'Silverstone Circuit 1.11',
      ],
    },
    LAGUNASECA: {
      displayName: 'WeatherTech Raceway Laguna Seca',
      background: '/start/images/tracks/backgrounds/lagunaseca.webp',
      logo: '/start/images/tracks/logos/lagunaseca.svg',
      abbr: 'LAG',
      location: 'Monterey, California, USA',
      aliases: [
        'WeatherTech Raceway Laguna Seca',
        'Laguna Seca',
        'WeatherTech Raceway Laguna Seca 1.01',
      ],
    },
  },
  REPLAY_COMMANDS: {
    UI: {
      TOGGLE_SPEEDOMETER: 'speedo',
      TOGGLE_TRACK_MAP: 'trackMap',
      TOGGLE_HUD: 'hud',
      TOGGLE_REPLAY_UI: 'replayUI',
      TOGGLE_ALL: 'all',
    },
    TIME: {
      SET_TIME: 'replayTime',
    },
    FOCUS_CAR: {
      NEXT_CAR: 'focusForward',
      PREVIOUS_CAR: 'focusBackward',
      FOCUS_CAR: 'focusCar',
    },
    SCAN: {
      REVERSE_SCAN: 'VCRCOMMAND_REVERSESCAN',
      PLAYBACK_BACKWARDS: 'VCRCOMMAND_PLAYBACKWARDS',
      SLOW_BACKWARDS: 'VCRCOMMAND_SLOWBACKWARDS',
      STOP: 'VCRCOMMAND_STOP',
      SLOW: 'VCRCOMMAND_SLOW',
      PLAY: 'VCRCOMMAND_PLAY',
      FORWARD_SCAN: 'VCRCOMMAND_FORWARDSCAN',
    },
    CAMERA: {
      DRIVING_ANGLE_NEXT: { cameraGroup: 'Driving', direction: 1 },
      DRIVING_ANGLE_PREVIOUS: { cameraGroup: 'Driving', direction: 0 },
      TRACKSIDE_ANGLE_NEXT: { cameraGroup: 'Trackside', direction: 1 },
      TRACKSIDE_ANGLE_PREVIOUS: { cameraGroup: 'Trackside', direction: 0 },
      ONBOARD_ANGLE_NEXT: { cameraGroup: 'Onboard', direction: 1 },
      ONBOARD_ANGLE_PREVIOUS: { cameraGroup: 'Onboard', direction: 0 },
    },
  },
  SESSION_TYPE_MAPPINGS: {
    RACE: 'Race',
    QUALIFY: 'Qualify',
    PRACTICE: 'Practice1', // Assuming Practice sessions are labeled as Practice1 in the log data
  },
  CAR_CLASS_MAPPINGS: {
    GT3: 'GT3',
    GTE: 'GTE',
    LMP2: 'LMP2',
    LMP3: 'LMP3',
    HYPERCAR: 'Hypercar',
  },
  EXPERIMENTAL_FEATURES,
} as const;
