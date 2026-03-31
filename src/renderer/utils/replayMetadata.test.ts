import {
  resolveReplayHeaderMetadata,
  resolveReplaySessionLogData,
} from './replayMetadata';

describe('replayMetadata', () => {
  it('resolves title/location from track metadata map when available', () => {
    const cases = [
      {
        sceneDesc: 'SEBRINGWEC',
        meta: {
          displayName: 'Sebring International Raceway',
          location: 'Sebring, Florida, USA',
        },
        expected: {
          title: 'Sebring International Raceway',
          location: 'Sebring, Florida, USA',
        },
      },
      {
        sceneDesc: 'PAULRICARD1A',
        meta: {
          displayName: 'Paul Ricard Circuit (1A)',
          location: 'Le Castellet, France',
        },
        expected: {
          title: 'Paul Ricard Circuit (1A)',
          location: 'Le Castellet, France',
        },
      },
      {
        sceneDesc: 'PAULRICARD1A-V2',
        meta: {
          displayName: 'Paul Ricard Circuit (1A-V2)',
          location: 'Le Castellet, France',
        },
        expected: {
          title: 'Paul Ricard Circuit (1A-V2)',
          location: 'Le Castellet, France',
        },
      },
      {
        sceneDesc: 'PAULRICARD1A-V2-SHORT',
        meta: {
          displayName: 'Paul Ricard Circuit (1A-V2-Short)',
          location: 'Le Castellet, France',
        },
        expected: {
          title: 'Paul Ricard Circuit (1A-V2-Short)',
          location: 'Le Castellet, France',
        },
      },
      {
        sceneDesc: 'PAULRICARD3A',
        meta: {
          displayName: 'Paul Ricard Circuit (3A)',
          location: 'Le Castellet, France',
        },
        expected: {
          title: 'Paul Ricard Circuit (3A)',
          location: 'Le Castellet, France',
        },
      },
      {
        sceneDesc: 'BARCELONAELMS',
        meta: {
          displayName: 'Circuit de Barcelona-Catalunya',
          location: 'Barcelona, Spain',
        },
        expected: {
          title: 'Circuit de Barcelona-Catalunya',
          location: 'Barcelona, Spain',
        },
      },
      {
        sceneDesc: 'SILVERSTONE_INTERNATIONAL',
        meta: {
          displayName: 'Silverstone Circuit (International)',
          location: 'Silverstone, United Kingdom',
        },
        expected: {
          title: 'Silverstone Circuit (International)',
          location: 'Silverstone, United Kingdom',
        },
      },
    ];
    for (const { sceneDesc, meta, expected } of cases) {
      const result = resolveReplayHeaderMetadata({
        replay: { metadata: { sceneDesc } },
        trackMetaData: { [sceneDesc]: meta },
      });
      expect(result).toEqual(expected);
    }
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
