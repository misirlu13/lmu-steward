import { CONSTANTS } from '@constants';
import { jumpToIncidentInReplay } from './replayCommands';
import { sendMessage } from './postMessage';
import { resolveIncidentFocusTarget } from '../components/DriverAnalysis/driverAnalysisUtils';

jest.mock('./postMessage', () => ({
  sendMessage: jest.fn(),
}));

jest.mock('../components/DriverAnalysis/driverAnalysisUtils', () => ({
  resolveIncidentFocusTarget: jest.fn(),
}));

describe('replayCommands', () => {
  const sendMessageMock = sendMessage as jest.MockedFunction<typeof sendMessage>;
  const resolveIncidentFocusTargetMock =
    resolveIncidentFocusTarget as jest.MockedFunction<
      typeof resolveIncidentFocusTarget
    >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('focuses car then jumps to incident time when focus target exists', () => {
    resolveIncidentFocusTargetMock.mockReturnValue('12');

    jumpToIncidentInReplay(
      {
        drivers: [{ displayName: 'Driver A', slotId: '12' }],
        jumpToSeconds: 93.5,
      },
      {
        driverName: 'Driver A',
      },
    );

    expect(resolveIncidentFocusTargetMock).toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenNthCalledWith(
      1,
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '12',
    );
    expect(sendMessageMock).toHaveBeenNthCalledWith(
      2,
      CONSTANTS.API.PUT_REPLAY_COMMAND_TIME,
      '93.5',
    );
  });

  it('only sends replay time when no focus target is resolved', () => {
    resolveIncidentFocusTargetMock.mockReturnValue(undefined);

    jumpToIncidentInReplay({
      drivers: [{ displayName: 'Driver A' }],
      jumpToSeconds: 40,
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      CONSTANTS.API.PUT_REPLAY_COMMAND_TIME,
      '40',
    );
  });

  it('clamps negative jump time to zero', () => {
    resolveIncidentFocusTargetMock.mockReturnValue('7');

    jumpToIncidentInReplay({
      drivers: [{ slotId: '7' }],
      jumpToSeconds: -25,
    });

    expect(sendMessageMock).toHaveBeenNthCalledWith(
      1,
      CONSTANTS.API.PUT_REPLAY_COMMAND_FOCUS_CAR,
      '7',
    );
    expect(sendMessageMock).toHaveBeenNthCalledWith(
      2,
      CONSTANTS.API.PUT_REPLAY_COMMAND_TIME,
      '0',
    );
  });
});
