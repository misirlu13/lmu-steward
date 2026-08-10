/**
 * @jest-environment node
 */
import { CONSTANTS } from '@constants';
import { postExportSessionData } from './session-export';

const showSaveDialog = jest.fn();
const writeFile = jest.fn();

jest.mock('electron', () => ({
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
  },
}));

jest.mock('fs/promises', () => ({
  writeFile: (...args: unknown[]) => writeFile(...args),
}));

const makeEvent = () =>
  ({ reply: jest.fn() }) as unknown as Electron.IpcMainEvent;

const request = (overrides = {}) => ({
  fileName: 'bahrain-race-2026-07-04.csv',
  contents: 'a,b,c\r\n',
  format: 'csv' as const,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  showSaveDialog.mockResolvedValue({
    canceled: false,
    filePath: 'C:/exports/bahrain.csv',
  });
  writeFile.mockResolvedValue(undefined);
});

describe('postExportSessionData', () => {
  it('should write the contents to the path the dialog returned', async () => {
    const event = makeEvent();

    await postExportSessionData(event, request());

    expect(writeFile).toHaveBeenCalledWith(
      'C:/exports/bahrain.csv',
      'a,b,c\r\n',
      'utf-8',
    );
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_EXPORT_SESSION_DATA,
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ filePath: 'C:/exports/bahrain.csv' }),
      }),
    );
  });

  // The renderer supplies only a suggestion. Anything resembling a path is
  // reduced to a bare filename before it reaches the dialog.
  it('should strip a directory out of the suggested filename', async () => {
    await postExportSessionData(
      makeEvent(),
      request({ fileName: '../../../Windows/System32/evil.csv' }),
    );

    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'evil.csv' }),
    );
  });

  it('should fall back to a default name when none is usable', async () => {
    await postExportSessionData(makeEvent(), request({ fileName: '' }));

    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'session.csv' }),
    );
  });

  it('should report a cancelled dialog as success without writing', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined });
    const event = makeEvent();

    await postExportSessionData(event, request());

    expect(writeFile).not.toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_EXPORT_SESSION_DATA,
      expect.objectContaining({
        status: 'success',
        data: expect.objectContaining({ canceled: true }),
      }),
    );
  });

  it('should reject an unknown format rather than guessing', async () => {
    const event = makeEvent();

    await postExportSessionData(
      event,
      request({ format: 'xlsx' } as unknown as ReturnType<typeof request>),
    );

    expect(showSaveDialog).not.toHaveBeenCalled();
    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_EXPORT_SESSION_DATA,
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('should surface a write failure rather than claiming success', async () => {
    writeFile.mockRejectedValue(new Error('EACCES: permission denied'));
    const event = makeEvent();

    await postExportSessionData(event, request());

    expect(event.reply).toHaveBeenCalledWith(
      CONSTANTS.API.POST_EXPORT_SESSION_DATA,
      expect.objectContaining({
        status: 'error',
        message: 'EACCES: permission denied',
      }),
    );
  });
});
