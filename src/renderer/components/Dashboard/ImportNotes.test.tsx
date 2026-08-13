import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ImportPreviewRowState,
  ImportPreviewState,
} from '../../providers/ApiContext';
import { ImportPreviewDialog } from './ImportPreviewDialog';
import { ImportReplayDialog } from './ImportReplayDialog';

/*
 * The note is offered on every import path, not just one. A steward is told
 * where a hand-off came from once, in a message or a forum thread, and the
 * import is the only moment that context is still in front of them.
 */

const buildRow = (
  overrides: Partial<ImportPreviewRowState> = {},
): ImportPreviewRowState => ({
  id: 'C:\\Handoff\\Monza R1 2.Vcr',
  vcrPath: 'C:\\Handoff\\Monza R1 2.Vcr',
  vcrFileName: 'Monza R1 2.Vcr',
  replayName: 'Monza R1 2',
  sceneDesc: 'MONZAWEC',
  session: 'RACE',
  size: 400 * 1024 ** 2,
  alreadyImportedHash: null,
  manifest: null,
  liveData: null,
  pairing: {
    ranked: [
      {
        candidate: {
          fileName: 'race.xml',
          filePath: 'C:\\Handoff\\race.xml',
          session: 'RACE',
          eventDateTime: 1784398360,
          trackVenue: 'Monza',
          driverNames: [],
        },
        confidence: 0.84,
        intersection: 27,
        vcrCount: 32,
        logCount: 32,
      },
    ],
    proposed: {
      candidate: { fileName: 'race.xml', filePath: 'C:\\Handoff\\race.xml' },
      confidence: 0.84,
      intersection: 27,
      vcrCount: 32,
    },
    reason: 'proposed',
  },
  ...overrides,
});

const buildPreview = (
  rows: ImportPreviewRowState[] = [buildRow()],
): ImportPreviewState => ({
  kind: 'folder',
  sourceLabel: 'C:\\Handoff',
  rows,
  manifestSessionCount: 0,
  omittedSessions: [],
  rejectedEntries: [],
});

describe('import notes', () => {
  describe('bulk preview', () => {
    const setup = (preview: ImportPreviewState | null = buildPreview()) => {
      const onConfirm = jest.fn();

      render(
        <ImportPreviewDialog
          preview={preview}
          rowLogSelections={{}}
          isImporting={false}
          onChooseLogForRow={jest.fn()}
          onCancel={jest.fn()}
          onConfirm={onConfirm}
        />,
      );

      return { onConfirm };
    };

    it('offers a note field for a folder or archive import', () => {
      setup();

      expect(screen.getByLabelText('Import note')).toBeInTheDocument();
    });

    /**
     * One note for the run. A hand-off is one thing that arrived from one
     * person for one reason, and asking a steward to retype that per row on a
     * nine-replay hand-off would mean it gets typed on none of them.
     */
    it('applies the note to every replay in the run', () => {
      const { onConfirm } = setup(
        buildPreview([
          buildRow(),
          buildRow({
            id: 'C:\\Handoff\\Monza Q1 1.Vcr',
            replayName: 'Monza Q1 1',
            session: 'QUALIFY',
          }),
        ]),
      );

      fireEvent.change(screen.getByLabelText('Import note'), {
        target: { value: 'Protest 12, sent by Team Foxtrot' },
      });
      fireEvent.click(screen.getByText('Import 2 replays'));

      const [, selections] = onConfirm.mock.calls[0];
      expect(selections).toHaveLength(2);
      for (const selection of selections) {
        expect(selection.note).toBe('Protest 12, sent by Team Foxtrot');
      }
    });

    it('sends no note when the field is left empty', () => {
      const { onConfirm } = setup();

      fireEvent.click(screen.getByText('Import 1 replay'));

      expect(onConfirm.mock.calls[0][1][0].note).toBeUndefined();
    });

    /*
     * A whitespace-only note would put an empty note marker on the dashboard
     * row, which reads as "there is something here" when there is not.
     */
    it('treats a whitespace-only note as no note', () => {
      const { onConfirm } = setup();

      fireEvent.change(screen.getByLabelText('Import note'), {
        target: { value: '   ' },
      });
      fireEvent.click(screen.getByText('Import 1 replay'));

      expect(onConfirm.mock.calls[0][1][0].note).toBeUndefined();
    });
  });

  describe('single replay dialog', () => {
    const setup = () => {
      const onConfirm = jest.fn();

      render(
        <ImportReplayDialog
          open
          replayFile={{
            kind: 'replay',
            filePath: 'C:\\Handoff\\Monza R1 2.Vcr',
            fileName: 'Monza R1 2.Vcr',
          }}
          logFile={{
            kind: 'log',
            filePath: 'C:\\Handoff\\race.xml',
            fileName: 'race.xml',
          }}
          validation={{
            issues: [],
            confidence: 0.84,
            rosterOverlap: { intersection: 27, vcrCount: 32, logCount: 32 },
            canImport: true,
            liveData: null,
          }}
          isImporting={false}
          errorMessage=""
          onChooseReplay={jest.fn()}
          onChooseLog={jest.fn()}
          onCancel={jest.fn()}
          onConfirm={onConfirm}
        />,
      );

      return { onConfirm };
    };

    it('offers a note field alongside the two file pickers', () => {
      setup();

      expect(screen.getByLabelText('Import note')).toBeInTheDocument();
    });

    it('passes the note through on import', () => {
      const { onConfirm } = setup();

      fireEvent.change(screen.getByLabelText('Import note'), {
        target: { value: 'Handed over on Discord by Anna One' },
      });
      fireEvent.click(screen.getByText('Import Replay'));

      expect(onConfirm).toHaveBeenCalledWith(
        'Handed over on Discord by Anna One',
      );
    });
  });
});
