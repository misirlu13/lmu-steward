export const CONSTANTS = {
  LMU_API_BASE_URL: 'http://localhost:6397',
  LMU_DEFAULT_EXECUTABLE_PATH:
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\Le Mans Ultimate.exe',
  LMU_DEFAULT_REPLAY_DIRECTORY_PATH:
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Replays',
  API: {
    GET_TRACK_MAP: 'get.track-map',
    GET_API_STATUS: 'get.api-status',
    GET_REPLAYS: 'get.replays',
    GET_TRACK_THUMBNAIL: 'get.track-thumbnail',
    GET_USER_SETTINGS: 'get.user-settings',
    PUSH_USER_SETTINGS: 'push.user-settings',
    PUSH_REPLAY_SYNC_STATUS: 'push.replay-sync-status',
    GET_PROFILE_INFO: 'get.profile-info',
    GET_STANDINGS_HISTORY: 'get.standings-history',
    GET_STANDINGS: 'get.standings',
    GET_IS_REPLAY_ACTIVE: 'get.is-replay-active',
    GET_SESSION_INFO: 'get.session-info',
    GET_FOCUSED_CAR: 'get.focused-car',
    POST_USER_SETTINGS: 'post.user-settings',
    POST_WATCH_REPLAY: 'post.watch-replay',
    POST_CAMERA_ANGLE: 'post.camera-angle',
    POST_CLOSE_REPLAY: 'post.close-replay',
    POST_CLOSE_LMU: 'post.close-lmu',
    POST_CLEAR_LOCAL_STORAGE: 'post.clear-local-storage',
    POST_LAUNCH_LMU: 'post.launch-lmu',
    POST_OPEN_SETTINGS: 'post.open-settings',
    POST_SELECT_LMU_EXECUTABLE: 'post.select-lmu-executable',
    POST_SELECT_LMU_REPLAY_DIRECTORY: 'post.select-lmu-replay-directory',
    REQUEST_APP_EXIT_CONFIRM: 'request.app-exit-confirm',
    REPLY_APP_EXIT_CONFIRM: 'reply.app-exit-confirm',
    PUT_REPLAY_COMMAND_SCAN: 'put.replay-command-scan',
    PUT_REPLAY_COMMAND_TIME: 'put.replay-command-time',
    PUT_REPLAY_COMMAND_FOCUS_CAR: 'put.replay-command-focus-car',
    POST_REPLAY_COMMAND_UI: 'post.replay-command-ui',
    PUT_FOCUS_CAR: 'put.focus-car',
  },
  TRACK_META_DATA: {
    PORTIMAOWEC: {
      displayName: 'Algarve International Circuit',
      background: '/start/images/tracks/backgrounds/portimaowec.webp',
      logo: '/start/images/tracks/logos/portimaowec.svg',
      abbr: 'AIA',
      location: 'Portimão, Portugal',
      aliases: [
        'Algarve International Circuit',
        '6 Hours of Portimao',
        'Algarve International Circuit 1.21'
      ]
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
        'Autodromo Enzo e Dino Ferrari 1.21'
      ]
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
        'Autodromo Nazionale Monza 1.21'
      ]
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
        'Autodromo Nazionale Monza 1.21'
      ]
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
        'Autódromo José Carlos Pace 1.21'
      ]
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
        'Bahrain International Circuit 1.23'
      ]
    },
    BAHRAINWEC_ENDCE: {
      displayName: 'Bahrain International Circuit (Endurance)',
      background: '/start/images/tracks/backgrounds/bahrainwec.webp',
      logo: '/start/images/tracks/logos/bahrainwec.svg',
      abbr: 'BIC',
      location: 'Sakhir, Bahrain',
    },
    BAHRAINWEC_OUTER: {
      displayName: 'Bahrain International Circuit (Outer)',
      background: '/start/images/tracks/backgrounds/bahrainwec.webp',
      logo: '/start/images/tracks/logos/bahrainwec.svg',
      abbr: 'BIC',
      location: 'Sakhir, Bahrain',
    },
    BAHRAINWEC_PADDOCK: {
      displayName: 'Bahrain International Circuit (Paddock)',
      background: '/start/images/tracks/backgrounds/bahrainwec.webp',
      logo: '/start/images/tracks/logos/bahrainwec.svg',
      abbr: 'BIC',
      location: 'Sakhir, Bahrain',
    },
    SPAWEC: {
      displayName: 'Circuit de Spa-Francorchamps',
      background: '/start/images/tracks/backgrounds/spawec.webp',
      logo: '/start/images/tracks/logos/spawec.svg',
      abbr: 'SPA',
      location: 'Stavelot, Belgium',
    },
    SPAWEC_ENDCE: {
      displayName: 'Circuit de Spa-Francorchamps (Endurance)',
      background: '/start/images/tracks/backgrounds/spawec.webp',
      logo: '/start/images/tracks/logos/spawec.svg',
      abbr: 'SPA',
      location: 'Stavelot, Belgium',
    },
    LEMANSWEC: {
      displayName: 'Circuit de la Sarthe',
      background: '/start/images/tracks/backgrounds/lemanswec.webp',
      logo: '/start/images/tracks/logos/lemanswec.svg',
      abbr: 'LM',
      location: 'Le Mans, France',
    },
    LEMANSWEC_MULSANNE: {
      displayName: 'Circuit de la Sarthe (Mulsanne)',
      background: '/start/images/tracks/backgrounds/lemanswec.webp',
      logo: '/start/images/tracks/logos/lemanswec.svg',
      abbr: 'LM',
      location: 'Le Mans, France',
    },
    COTAWEC: {
      displayName: 'Circuit of the Americas',
      background: '/start/images/tracks/backgrounds/cotawec.webp',
      logo: '/start/images/tracks/logos/cotawec.svg',
      abbr: 'COTA',
      location: 'Austin, Texas, USA',
    },
    COTAWEC_NATIONAL: {
      displayName: 'Circuit of the Americas (National)',
      background: '/start/images/tracks/backgrounds/cotawec.webp',
      logo: '/start/images/tracks/logos/cotawec.svg',
      abbr: 'COTA',
      location: 'Austin, Texas, USA',
    },
    FUJIWEC: {
      displayName: 'Fuji Speedway',
      background: '/start/images/tracks/backgrounds/fujiwec.webp',
      logo: '/start/images/tracks/logos/fujiwec.svg',
      abbr: 'FSW',
      location: 'Oyama, Japan',
    },
    FUJIWEC_CL: {
      displayName: 'Fuji Speedway (Classic)',
      background: '/start/images/tracks/backgrounds/fujiwec.webp',
      logo: '/start/images/tracks/logos/fujiwec.svg',
      abbr: 'FSW',
      location: 'Oyama, Japan',
    },
    QATARWEC: {
      displayName: 'Lusail International Circuit',
      background: '/start/images/tracks/backgrounds/qatarwec.webp',
      logo: '/start/images/tracks/logos/qatarwec.svg',
      abbr: 'LIC',
      location: 'Lusail, Qatar',
    },
    QATARWEC_SHORT: {
      displayName: 'Lusail International Circuit (Short)',
      background: '/start/images/tracks/backgrounds/qatarwec.webp',
      logo: '/start/images/tracks/logos/qatarwec.svg',
      abbr: 'LIC',
      location: 'Lusail, Qatar',
    },
    PAULRICARDELMS: {
      displayName: 'Paul Ricard Circuit',
      background: '/start/images/tracks/backgrounds/paulricardelms.webp',
      logo: '/start/images/tracks/logos/paulricardelms.svg',
      abbr: 'PR',
      location: 'Le Castellet, France',
    },
    SEBRINGWEC: {
      displayName: 'Sebring International Raceway',
      background: '/start/images/tracks/backgrounds/sebringwec.webp',
      logo: '/start/images/tracks/logos/sebringwec.svg',
      abbr: 'SEB',
      location: 'Sebring, Florida, USA',
    },
    SEBRINGWEC_SCHOOL: {
      displayName: 'Sebring International Raceway (School)',
      background: '/start/images/tracks/backgrounds/sebringwec.webp',
      logo: '/start/images/tracks/logos/sebringwec.svg',
      abbr: 'SEB',
      location: 'Sebring, Florida, USA',
    },
    SILVERSTONEELMS: {
      displayName: 'Silverstone Circuit',
      background: '/start/images/tracks/backgrounds/silverstoneelms.webp',
      logo: '/start/images/tracks/logos/silverstoneelms.svg',
      abbr: 'SIL',
      location: 'Silverstone, United Kingdom',
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
} as const;
