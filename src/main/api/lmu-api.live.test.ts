/**
 * Live-API contract tests — what the app believes about Le Mans Ultimate,
 * checked against a Le Mans Ultimate that is actually running.
 *
 * WHY THIS EXISTS
 *
 * Two defects in two sessions had the same shape: something the app believed
 * about LMU that it had never checked. A committed dev mock for
 * `GET /rest/watch/focus` carried `{slotID: 0}` when the endpoint returns a
 * bare number, and nothing caught it for as long as it existed because no
 * renderer code had ever read that channel. Rewatch shipped seeking without
 * focusing, and the ordering test asserted the order of the three calls it knew
 * about — every one of them correct. In both cases the test shared the omission
 * with the code. A unit test cannot close that gap, because both sides of it
 * are written from the same belief. Only the game can settle it.
 *
 * HOW THESE ARE GATED — and why not the other ways
 *
 * A separate jest project (`jest.live-api.config.js`, `npm run test:live-api`).
 * The default `npx jest` cannot collect this file: it matches `*.live.test.ts`,
 * which the package.json config ignores. The suffix is deliberately not
 * `.contract.test.ts` — `session.contract.test.ts` already owns that name and
 * is an offline fixture test that must stay in the default suite.
 *
 *   - NOT `describe.skipIf` on a reachability probe. A suite that reports green
 *     when it skipped is indistinguishable at a glance from one that reports
 *     green when it passed. That is the same "everyone learns to ignore it"
 *     failure as a permanently red suite, just quieter.
 *   - NOT an env var on the default suite. It leaves the tests one stray
 *     variable away from running in CI, and it hides them from anyone reading
 *     the config to find out what runs.
 *
 * Because running this suite is an explicit act, an unreachable game is a hard
 * failure, not a skip: you asked for it, so the absence of a game is an error.
 * The one thing that IS skipped is the Swagger comparison when the spec file is
 * missing — that is a missing input, not a missing game, and `plans/` is
 * gitignored so a fresh clone legitimately will not have it.
 *
 * SAFETY: THIS SUITE NEVER MUTATES GAME STATE.
 *
 * Every call below is a GET, chosen from an explicit allowlist. Endpoints that
 * write are checked statically against the Swagger spec and never called. Two
 * of them would end the session outright (`NAV_EXIT`, `NAV_TO_MAIN_MENU`), and
 * `/rest/watch/play/{id}` loads a stored replay over whatever is running.
 * Adding an endpoint to the safe list is a decision to make deliberately.
 */
/*
 * The endpoint tables below quote the app's source text verbatim, `${trackId}`
 * placeholders and all, because that text is the lookup key discovery produces.
 * They are keys to match on, never strings meant to interpolate.
 */
/* eslint-disable no-template-curly-in-string */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CONSTANTS } from '@constants';

const BASE_URL = CONSTANTS.LMU_API_BASE_URL;

/** `src/main/api` → repo root. */
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const MAIN_SRC = path.join(REPO_ROOT, 'src', 'main');
const SWAGGER_PATH = path.join(REPO_ROOT, 'plans', 'lmu-swagger-schema.json');

// ---------------------------------------------------------------------------
// Endpoint discovery
// ---------------------------------------------------------------------------

/**
 * The endpoint list is DERIVED from the source, never hand-listed. A hardcoded
 * inventory would drift the moment somebody added a call, which is the exact
 * class of bug this file exists to catch.
 *
 * Test files are excluded so the inventory reflects production call sites; the
 * literal `/rest/race/track/77/thumbnail` in `session.test.ts` is a fixture,
 * not a thing the app does.
 */
const collectTsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return collectTsFiles(full);
    if (!full.endsWith('.ts') && !full.endsWith('.tsx')) return [];
    if (full.endsWith('.test.ts') || full.endsWith('.test.tsx')) return [];
    return [full];
  });

const discoverEndpoints = (): string[] => {
  const pattern = /\$\{CONSTANTS\.LMU_API_BASE_URL\}([^`"']*)/g;
  const found = new Set<string>();

  collectTsFiles(MAIN_SRC).forEach((file) => {
    const source = readFileSync(file, 'utf8');
    let match = pattern.exec(source);
    while (match !== null) {
      found.add(match[1]);
      match = pattern.exec(source);
    }
  });

  return [...found].sort();
};

const APP_ENDPOINTS = discoverEndpoints();

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Endpoints safe to probe with a GET. Anything not listed here is treated as
 * mutating and is never called.
 *
 * `${...}` placeholders that need a real value are resolved at runtime; a
 * `null` value means "resolve in beforeAll".
 */
const SAFE_GET_ENDPOINTS: Record<string, string | null> = {
  '/navigation/state': '/navigation/state',
  '/rest/profile/profileInfo/getProfileInfo':
    '/rest/profile/profileInfo/getProfileInfo',
  '/rest/replay/CameraController/getCameraInfo':
    '/rest/replay/CameraController/getCameraInfo',
  '/rest/replay/isActive': '/rest/replay/isActive',
  '/rest/watch/focus': '/rest/watch/focus',
  '/rest/watch/replays': '/rest/watch/replays',
  '/rest/watch/sessionInfo': '/rest/watch/sessionInfo',
  '/rest/watch/standings': '/rest/watch/standings',
  '/rest/watch/standings/history': '/rest/watch/standings/history',
  '/rest/watch/trackMap': '/rest/watch/trackMap',
  // Needs a real track id from the live track list.
  '/rest/race/track/${trackId}/thumbnail': null,
};

/**
 * Endpoints deliberately never called, with the reason. The reason is the
 * point: it is the record of why this is not laziness.
 */
const MUTATING_ENDPOINTS: Record<string, string> = {
  '/navigation/action/NAV_EXIT': 'quits the game',
  '/navigation/action/NAV_TO_MAIN_MENU': 'abandons the running session',
  '/rest/hud/toggle/${element}': 'toggles the HUD under the steward',
  '/rest/replay/CameraController/setCamera': 'moves the camera',
  '/rest/replay/toggleactive': 'enters or leaves replay mode',
  '/rest/sessions/setHudOnWatchScreen': 'changes the watch-screen HUD',
  '/rest/watch/focus/${slotId}': 'moves the camera to another car',
  '/rest/watch/play/${replay.id}': 'loads a stored replay over the session',
  '/rest/watch/replay/setReplayUIVisible': "changes the game's own overlay",
  '/rest/watch/replayCommand/${command}': 'changes playback speed/direction',
  '/rest/watch/replaytime/${seekToSeconds}': 'seeks the replay clock',
  '/rest/watch/replaytime/${timeInSeconds}': 'seeks the replay clock',
};

/**
 * Endpoints the app calls that the game does not have. Excluded from the
 * "is routed" and "is documented" sweeps and owned instead by the pinned-defect
 * block at the bottom of this file, which asserts the absence directly.
 *
 * Keeping them out of the sweeps is not an excuse: the pin is a STRONGER
 * assertion, because it fails if the endpoint ever starts working — at which
 * point the app's handler needs fixing rather than the test relaxing.
 */
const KNOWN_ABSENT_ENDPOINTS: Record<string, string> = {
  '/rest/race/track/${trackId}/thumbnail':
    '404s for every track id, and is absent from the Swagger spec — see the pinned block below',
};

// ---------------------------------------------------------------------------
// Swagger matching
// ---------------------------------------------------------------------------

type SwaggerSpec = { paths?: Record<string, Record<string, unknown>> };

const loadSwaggerPaths = (): string[] | null => {
  try {
    const spec = JSON.parse(readFileSync(SWAGGER_PATH, 'utf8')) as SwaggerSpec;
    return Object.keys(spec.paths ?? {});
  } catch {
    return null;
  }
};

const SWAGGER_PATHS = loadSwaggerPaths();

/**
 * Match an app path against a spec path template.
 *
 * Case-insensitive, because LMU's router demonstrably is: `/rest/watch/trackMap`
 * (what the app calls) and `/rest/watch/trackmap` (what the spec documents)
 * return byte-identical payloads, as do `/rest/watch/STANDINGS` and
 * `/rest/replay/isactive`. Verified live 2026-08-08.
 *
 * Segment-wise rather than by string equality, so a literal the app substitutes
 * into a parameter slot still matches: `/navigation/action/NAV_EXIT` is the
 * spec's `/navigation/action/{action}`, and a naive string compare would call
 * that endpoint undocumented when it is nothing of the sort.
 */
const matchesSpecPath = (appPath: string, specPath: string): boolean => {
  const appSegments = appPath.split('/');
  const specSegments = specPath.split('/');
  if (appSegments.length !== specSegments.length) return false;

  return specSegments.every((specSegment, index) => {
    if (specSegment.startsWith('{') && specSegment.endsWith('}')) return true;
    return specSegment.toLowerCase() === appSegments[index].toLowerCase();
  });
};

const findSpecPath = (appPath: string): string | undefined =>
  (SWAGGER_PATHS ?? []).find((specPath) => matchesSpecPath(appPath, specPath));

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

type ProbeResult = { status: number; body: string };

/**
 * Node's global fetch pools connections through undici, which is what we want.
 * Never reach for PowerShell's Invoke-WebRequest to time these: it adds ~2 s of
 * connection setup per call and fakes a uniform latency across every endpoint.
 */
const probe = async (suffix: string): Promise<ProbeResult> => {
  const response = await fetch(`${BASE_URL}${suffix}`);
  return { status: response.status, body: await response.text() };
};

type LiveTrack = {
  id: string;
  name: string;
  shortName: string;
  sceneDesc: string;
  displayProperties?: { name?: string; shortName?: string };
};

let liveTracks: LiveTrack[] = [];

beforeAll(async () => {
  try {
    // Also warms the connection pool, so the ~2 s of first-call setup is not
    // billed to whichever test happens to run first.
    await probe('/rest/watch/sessionInfo');
  } catch (error) {
    throw new Error(
      `Le Mans Ultimate is not answering on ${BASE_URL}.\n` +
        'These are contract tests against the real game — start LMU and load a ' +
        'session, then re-run `npm run test:live-api`.\n' +
        'They are excluded from the default `npx jest` run by design.\n' +
        `Underlying error: ${String(error)}`,
    );
  }

  const tracks = await probe('/rest/race/track');
  liveTracks = JSON.parse(tracks.body) as LiveTrack[];
});

// ---------------------------------------------------------------------------

describe('LMU live contract — the endpoint inventory itself', () => {
  /**
   * Guards against a vacuous pass. If the discovery regex ever stops matching,
   * every `it.each` below would silently run zero cases and the suite would go
   * green having checked nothing — the failure mode this whole file is about.
   */
  it('discovers the endpoints the app calls, from the source', () => {
    expect(APP_ENDPOINTS.length).toBeGreaterThanOrEqual(20);
  });

  it('classifies every discovered endpoint as either safe to probe or mutating', () => {
    const unclassified = APP_ENDPOINTS.filter(
      (endpoint) =>
        !(endpoint in SAFE_GET_ENDPOINTS) && !(endpoint in MUTATING_ENDPOINTS),
    );

    // A new endpoint must be classified by hand before it can be probed. This
    // is the check that stops one being added and quietly escaping the contract.
    expect(unclassified).toEqual([]);
  });
});

describe('LMU live contract — every endpoint the app calls is routed', () => {
  const probeable = Object.keys(SAFE_GET_ENDPOINTS).filter(
    (endpoint) => !(endpoint in KNOWN_ABSENT_ENDPOINTS),
  );

  it.each(probeable)('%s does not 404', async (endpoint) => {
    const suffix = SAFE_GET_ENDPOINTS[endpoint] as string;
    const { status } = await probe(suffix);

    // 404 is a real, distinguishable signal from this server: a path one letter
    // wrong (`/rest/watch/trackMapp`) answers 404 with an empty body, so a
    // route that exists and one that does not are genuinely tellable apart.
    expect(status).not.toBe(404);
  });
});

describe('LMU live contract — response shapes the app hardcodes beliefs about', () => {
  it('GET /rest/watch/focus returns a bare number, not an object', async () => {
    const { body } = await probe('/rest/watch/focus');

    // The committed dev mock carried `{slotID: 0}`. It answered `30` against a
    // live session, and `14` against this one.
    expect(body.trim()).toMatch(/^\d+$/);
    expect(() => JSON.parse(body) as number).not.toThrow();
    expect(typeof (JSON.parse(body) as unknown)).toBe('number');
  });

  it('GET /rest/replay/isActive returns the text "true" or "false"', async () => {
    const { body } = await probe('/rest/replay/isActive');
    expect(['true', 'false']).toContain(body.trim());
  });

  it('getCameraInfo returns cameraName and currentCameraGroup, and no slot id', async () => {
    const { body } = await probe('/rest/replay/CameraController/getCameraInfo');
    const info = JSON.parse(body) as Record<string, unknown>;

    expect(Object.keys(info).sort()).toEqual([
      'cameraName',
      'currentCameraGroup',
    ]);

    // The absence matters as much as the presence: this endpoint cannot fix
    // `focusedSlotId`, which is why /rest/watch/focus is polled as well.
    expect(info).not.toHaveProperty('slotID');
  });

  it('currentCameraGroup is one of the four measured values', async () => {
    const { body } = await probe('/rest/replay/CameraController/getCameraInfo');
    const { currentCameraGroup } = JSON.parse(body) as {
      currentCameraGroup: string;
    };

    // `TracksideCycle` is the auto-director entry and `Trackside` the fixed
    // numbered groups. An equality compare on `Trackside` fails on the more
    // common of the two, which is why `cameraModeFromGroup` uses startsWith.
    expect(['Driving', 'Onboard', 'Trackside', 'TracksideCycle']).toContain(
      currentCameraGroup,
    );
  });

  it('GET /rest/watch/standings returns rows carrying the slot id the camera takes', async () => {
    const { body } = await probe('/rest/watch/standings');
    const standings = JSON.parse(body) as Record<string, unknown>[];

    expect(standings.length).toBeGreaterThan(0);
    expect(standings[0]).toHaveProperty('slotID');
    expect(standings[0]).toHaveProperty('carNumber');

    // slotID is NOT carNumber — slot 30 was car #11 in the COTA session. Any
    // join between the two has to go through standings, and this is the row
    // that makes that possible.
    expect(typeof standings[0].slotID).toBe('number');
  });
});

describe('LMU live contract — constants.ts against the running game', () => {
  type TrackMeta = { displayName: string; aliases: string[] };
  const trackMetaData = CONSTANTS.TRACK_META_DATA as unknown as Record<
    string,
    TrackMeta
  >;

  /**
   * Not a racing venue, so it legitimately has no metadata. Listed rather than
   * pattern-matched so that adding one is a visible decision.
   */
  const NON_VENUE_SCENES = ['LIVERYSHOWROOM'];

  it('has metadata for every venue the game offers', () => {
    const missing = liveTracks
      .map((track) => track.sceneDesc)
      .filter(
        (scene) =>
          !NON_VENUE_SCENES.includes(scene) && !(scene in trackMetaData),
      );

    expect(missing).toEqual([]);
  });

  it('has no metadata entry for a scene the game no longer ships', () => {
    const liveScenes = new Set(liveTracks.map((track) => track.sceneDesc));
    const stale = Object.keys(trackMetaData).filter(
      (scene) => !liveScenes.has(scene),
    );

    expect(stale).toEqual([]);
  });

  it("carries every name the game uses for a track in that track's aliases", () => {
    const mismatches: string[] = [];

    liveTracks.forEach((track) => {
      const meta = trackMetaData[track.sceneDesc];
      if (!meta) return;

      // shortName carries a version suffix ("Algarve International Circuit
      // 1.23") that moves with game updates, so this is the assertion that
      // notices an update before a steward does.
      [track.name, track.shortName].forEach((value) => {
        if (value && !meta.aliases.includes(value)) {
          mismatches.push(`${track.sceneDesc}: ${JSON.stringify(value)}`);
        }
      });
    });

    expect(mismatches).toEqual([]);
  });
});

describe('LMU live contract — the app against the Swagger spec', () => {
  // A missing spec is a missing input, not a missing game: plans/ is gitignored.
  const describeSpec = SWAGGER_PATHS ? describe : describe.skip;

  const documented = APP_ENDPOINTS.filter(
    (endpoint) => !(endpoint in KNOWN_ABSENT_ENDPOINTS),
  );

  describeSpec('spec coverage', () => {
    it.each(documented)('%s is documented in the spec', (endpoint) => {
      expect(findSpecPath(endpoint)).toBeDefined();
    });

    /**
     * The spec documents `/rest/watch/trackmap`; the app calls
     * `/rest/watch/trackMap`. Both answer 200 with byte-identical bodies, so
     * the spec is not stale — LMU's router simply folds case. This asserts the
     * case difference is real, so that "matched the spec" is never mistaken for
     * "spelled it the way the spec does".
     */
    it('matches /rest/watch/trackMap to the spec despite the case difference', () => {
      expect(findSpecPath('/rest/watch/trackMap')).toBe('/rest/watch/trackmap');
    });

    /**
     * `/navigation/action/NAV_EXIT` substitutes a literal into a parameter
     * slot. A string compare would call it undocumented when it is not.
     */
    it('matches a literal substituted into a spec parameter slot', () => {
      expect(findSpecPath('/navigation/action/NAV_EXIT')).toBe(
        '/navigation/action/{action}',
      );
    });
  });
});

describe('LMU live contract — known defects, pinned', () => {
  /**
   * PINNED FAILURE, NOT AN EXCUSE.
   *
   * `getTrackThumbnail` (`session.ts:164`) calls
   * `/rest/race/track/{id}/thumbnail`, and the endpoint 404s for EVERY track
   * id — including ids taken straight from the game's own track list, whose
   * `thumbnail` field advertises exactly that path. The handler's own docstring
   * says "Not sure confirmed this will work". It does not.
   *
   * It has gone unnoticed because no renderer code subscribes to
   * GET_TRACK_THUMBNAIL — the same reason the focus mock carried a wrong shape
   * for as long as it did.
   *
   * The assertion is written the way the world actually is, so the suite stays
   * honest. If LMU ever starts serving thumbnails this test fails, and that
   * failure is the signal to delete the pin and fix the handler.
   */
  it('track thumbnails 404 for every id, including ids the game itself advertises', async () => {
    const results = await Promise.all(
      liveTracks.slice(0, 3).map(async (track) => {
        const { status } = await probe(
          `/rest/race/track/${track.id}/thumbnail`,
        );
        return status;
      }),
    );

    expect(results).toEqual([404, 404, 404]);
  });

  it('track thumbnails are absent from the Swagger spec, consistent with the 404', () => {
    if (!SWAGGER_PATHS) return;

    // The spec has /rest/race/track/{id}/trackmap but no thumbnail sibling.
    // Undocumented AND unrouted is a coherent story: it does not exist.
    expect(
      findSpecPath('/rest/race/track/${trackId}/thumbnail'),
    ).toBeUndefined();
    expect(findSpecPath('/rest/race/track/${trackId}/trackmap')).toBe(
      '/rest/race/track/{id}/trackmap',
    );
  });

  /**
   * `getTrackThumbnail` types its parameter `trackId: number`. Track ids are
   * 40-character hex strings. Pinned so the wrong type is recorded rather than
   * rediscovered.
   */
  it('track ids are 40-character hex strings, not numbers', () => {
    expect(liveTracks.length).toBeGreaterThan(0);
    liveTracks.forEach((track) => {
      expect(track.id).toMatch(/^[0-9a-f]{40}$/);
    });
  });
});
