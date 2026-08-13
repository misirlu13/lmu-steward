import { deriveLiveIndicator } from './useLiveIndicator';

describe('deriveLiveIndicator', () => {
  it('should report live when a capture source reports an active session', () => {
    const indicator = deriveLiveIndicator({
      isConnected: true,
      hasApiStatusResponse: true,
      liveSessionStatus: {
        state: 'live',
        trackName: 'Bahrain International Circuit',
        driverCount: 7,
      },
    });

    expect(indicator.state).toBe('live');
    expect(indicator.detail).toBe('Bahrain International Circuit · 7 drivers');
  });

  it('should report live even before the API status poll has responded', () => {
    const indicator = deriveLiveIndicator({
      isConnected: false,
      hasApiStatusResponse: false,
      liveSessionStatus: { state: 'live' },
    });

    expect(indicator.state).toBe('live');
  });

  it('should omit detail when the live payload carries no session context', () => {
    const indicator = deriveLiveIndicator({
      isConnected: true,
      hasApiStatusResponse: true,
      liveSessionStatus: { state: 'live' },
    });

    expect(indicator.state).toBe('live');
    expect(indicator.detail).toBeUndefined();
  });

  it('should report unavailable before the first API status response', () => {
    const indicator = deriveLiveIndicator({
      isConnected: false,
      hasApiStatusResponse: false,
      liveSessionStatus: { state: 'detached' },
    });

    expect(indicator.state).toBe('unavailable');
    expect(indicator.label).toBe('Checking for Le Mans Ultimate…');
  });

  it('should report unavailable when LMU is not running', () => {
    const indicator = deriveLiveIndicator({
      isConnected: false,
      hasApiStatusResponse: true,
      liveSessionStatus: { state: 'detached' },
    });

    expect(indicator.state).toBe('unavailable');
    expect(indicator.label).toBe('Le Mans Ultimate is not running');
  });

  it('should report standby when LMU is running but no session is captured', () => {
    const indicator = deriveLiveIndicator({
      isConnected: true,
      hasApiStatusResponse: true,
      liveSessionStatus: { state: 'detached' },
    });

    expect(indicator.state).toBe('standby');
    expect(indicator.detail).toBe(
      'Le Mans Ultimate is running. No live session detected.',
    );
  });

  it('should surface a detail message supplied by the capture source', () => {
    const indicator = deriveLiveIndicator({
      isConnected: true,
      hasApiStatusResponse: true,
      liveSessionStatus: {
        state: 'detached',
        detail: 'Live capture is not attached yet.',
      },
    });

    expect(indicator.state).toBe('standby');
    expect(indicator.detail).toBe('Live capture is not attached yet.');
  });
});
