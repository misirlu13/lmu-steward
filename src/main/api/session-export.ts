import { writeFile } from 'fs/promises';
import { basename } from 'path';
import { dialog } from 'electron';
import { CONSTANTS } from '@constants';

/**
 * Writes a serialized session record to disk.
 *
 * Distinct from replay-export.ts, which packages the replay *files* for sharing
 * between installs. This one exports the session *record* — standings,
 * incidents, metadata — for a league's own spreadsheet or database.
 *
 * The renderer builds and formats the content, because that is pure and
 * testable there. It never chooses where the file goes: the path comes from the
 * save dialog, and the suggested name is reduced to a bare filename before it
 * is used, so nothing the renderer sends can walk out of the chosen directory.
 */

export type SessionExportFormat = 'csv' | 'markdown' | 'json';

export interface ExportSessionDataRequest {
  /** A suggestion for the dialog. Treated as untrusted. */
  fileName: string;
  contents: string;
  format: SessionExportFormat;
}

const FILTERS: Record<
  SessionExportFormat,
  { name: string; extensions: string[] }
> = {
  csv: { name: 'CSV spreadsheet', extensions: ['csv'] },
  markdown: { name: 'Markdown document', extensions: ['md'] },
  json: { name: 'JSON data', extensions: ['json'] },
};

const FALLBACK_NAMES: Record<SessionExportFormat, string> = {
  csv: 'session.csv',
  markdown: 'session.md',
  json: 'session.json',
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const postExportSessionData = async (
  event: Electron.IpcMainEvent,
  request: ExportSessionDataRequest,
) => {
  try {
    const format = request?.format;
    if (!format || !FILTERS[format]) {
      throw new Error('Unknown export format.');
    }
    if (typeof request.contents !== 'string' || request.contents.length === 0) {
      throw new Error('There is nothing to export for this session.');
    }

    // basename() strips any directory the renderer may have included, whether
    // by accident or otherwise.
    const suggested =
      basename(request.fileName ?? '') || FALLBACK_NAMES[format];

    const response = await dialog.showSaveDialog({
      title: 'Export session data',
      defaultPath: suggested,
      filters: [FILTERS[format]],
    });

    if (response.canceled || !response.filePath) {
      event.reply(CONSTANTS.API.POST_EXPORT_SESSION_DATA, {
        status: 'success',
        data: { canceled: true, filePath: '', exported: 0, omitted: [] },
      });
      return;
    }

    await writeFile(response.filePath, request.contents, 'utf-8');

    event.reply(CONSTANTS.API.POST_EXPORT_SESSION_DATA, {
      status: 'success',
      data: {
        canceled: false,
        filePath: response.filePath,
        exported: 1,
        omitted: [],
      },
    });
  } catch (error: unknown) {
    event.reply(CONSTANTS.API.POST_EXPORT_SESSION_DATA, {
      status: 'error',
      message: toErrorMessage(error),
    });
  }
};
