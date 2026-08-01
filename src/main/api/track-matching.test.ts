import {
  getTrackAliases,
  normalizeTrackText,
  tracksLikelyMatch,
} from './track-matching';

describe('main/track matching', () => {
  it('normalises punctuation, case and accents', () => {
    expect(normalizeTrackText('Autódromo  José Carlos-Pace')).toBe(
      'autodromo jose carlos pace',
    );
  });

  it('applies the layout aliases LMU names inconsistently', () => {
    expect(normalizeTrackText('Bahrain Outer Circuit')).toBe(
      'bahrain international circuit',
    );
    // The rewrite substitutes in place, so the leading "Monza" survives.
    expect(normalizeTrackText('Monza Curva Grande Circuit')).toBe(
      'monza nazionale monza',
    );
  });

  /**
   * A log's TrackCourse alone does not match Monza's aliases — "monza
   * nazionale monza" is neither a substring of "autodromo nazionale monza" nor
   * a superstring of it. Real logs match on TrackVenue, which is why all three
   * fields are checked rather than just the course.
   */
  it('matches a Curva Grande log through its venue, not its course', () => {
    const aliases = getTrackAliases('MONZAWEC');

    expect(tracksLikelyMatch(aliases, 'Monza Curva Grande Circuit')).toBe(
      false,
    );
    expect(
      tracksLikelyMatch(
        aliases,
        'Autodromo Nazionale Monza',
        'Monza Curva Grande Circuit',
        'Monza Curva Grande Circuit',
      ),
    ).toBe(true);
  });

  it('matches a scene id against a log track name', () => {
    expect(
      tracksLikelyMatch(
        getTrackAliases('MONZAWEC'),
        'Autodromo Nazionale Monza',
      ),
    ).toBe(true);
  });

  it('does not match an unrelated track', () => {
    expect(
      tracksLikelyMatch(
        getTrackAliases('MONZAWEC'),
        'Circuit de Spa-Francorchamps',
      ),
    ).toBe(false);
  });

  /**
   * Imported replays are named "<Track> R1 2 (imported)" when the original name
   * was taken. The marker has to come off before the session suffix — stripping
   * the suffix first leaves the marker anchored at the end, where the pattern no
   * longer matches, and the track name is never recovered.
   */
  it('recovers the track name from an imported replay name', () => {
    const withoutMarker = getTrackAliases(
      'UNKNOWN_SCENE',
      'Autodromo Nazionale Monza R1 2',
    );
    const withMarker = getTrackAliases(
      'UNKNOWN_SCENE',
      'Autodromo Nazionale Monza R1 2 (imported)',
    );
    const withNumberedMarker = getTrackAliases(
      'UNKNOWN_SCENE',
      'Autodromo Nazionale Monza R1 2 (imported 3)',
    );

    expect(withoutMarker).toEqual(['autodromo nazionale monza']);
    expect(withMarker).toEqual(withoutMarker);
    expect(withNumberedMarker).toEqual(withoutMarker);
  });

  it('still matches a log once a replay has been renamed on import', () => {
    expect(
      tracksLikelyMatch(
        getTrackAliases(
          'UNKNOWN_SCENE',
          'Autodromo Nazionale Monza R1 2 (imported)',
        ),
        'Autodromo Nazionale Monza',
      ),
    ).toBe(true);
  });
});
