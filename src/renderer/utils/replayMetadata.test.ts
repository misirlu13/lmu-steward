import {
  resolveReplayHeaderMetadata,
  resolveReplaySessionLogData,
} from './replayMetadata';

describe('replayMetadata', () => {
  it('resolves title/location from track metadata map when available', () => {
    const result = resolveReplayHeaderMetadata({
      replay: {
        metadata: {
          sceneDesc: 'SEBRINGWEC',
        },
      },
      trackMetaData: {
        SEBRINGWEC: {
          displayName: 'Sebring International Raceway',
          location: 'Sebring, Florida, USA',
        },
      },
    });

    expect(result).toEqual({
      title: 'Sebring International Raceway',
      location: 'Sebring, Florida, USA',
    });
  });

  it('falls back to sceneDesc when track metadata is missing', () => {
    const result = resolveReplayHeaderMetadata({
      replay: {
        metadata: {
          sceneDesc: 'UNKNOWN_TRACK',
        },
      },
      trackMetaData: {},
    });

    expect(result).toEqual({
      title: 'UNKNOWN_TRACK',
      location: undefined,
    });
  });

  it('returns undefined fields when replay metadata is absent', () => {
    const result = resolveReplayHeaderMetadata({
      replay: null,
      trackMetaData: {},
    });

    expect(result).toEqual({
      title: undefined,
      location: undefined,
    });
  });

  it('resolves current session log data using session mapping', () => {
    const replay = {
      metadata: { session: 'RACE' },
      logData: {
        Race: { Stream: { Score: [] } },
      },
    };

    const result = resolveReplaySessionLogData({
      replay,
      sessionTypeMappings: {
        RACE: 'Race',
        QUALIFY: 'Qualify',
      },
    });

    expect(result).toEqual({ Stream: { Score: [] } });
  });

  it('returns null when mapping or log data is unavailable', () => {
    expect(
      resolveReplaySessionLogData({
        replay: {
          metadata: { session: 'RACE' },
          logData: null,
        },
        sessionTypeMappings: { RACE: 'Race' },
      }),
    ).toBeNull();

    expect(
      resolveReplaySessionLogData({
        replay: {
          metadata: { session: 'UNKNOWN' },
          logData: { Race: {} },
        },
        sessionTypeMappings: { RACE: 'Race' },
      }),
    ).toBeNull();
  });
});
