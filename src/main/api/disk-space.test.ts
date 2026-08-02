/*
 * The guard that keeps a multi-GB copy from starting when it cannot finish.
 *
 * Both import and export leave something worse than nothing behind when a
 * volume fills mid-write: a truncated zip that looks like an archive, or a
 * half-copied .Vcr in the LMU install with no record of it.
 */
const statfs = jest.fn();

jest.mock('fs/promises', () => ({
  statfs: (...args: unknown[]) => statfs(...args),
}));

// eslint-disable-next-line import/first
import { assertFreeSpace, FREE_SPACE_MARGIN_BYTES } from './disk-space';

const GIGABYTE = 1024 ** 3;

describe('main/free disk guard', () => {
  beforeEach(() => {
    statfs.mockReset();
  });

  it('allows a write the volume has room for', async () => {
    statfs.mockResolvedValue({ bavail: 100, bsize: GIGABYTE });

    await expect(
      assertFreeSpace('D:\\Exports', 4 * GIGABYTE, 'export this weekend'),
    ).resolves.toBeUndefined();
  });

  it('refuses a write that would fill the volume, naming both figures', async () => {
    statfs.mockResolvedValue({ bavail: 2, bsize: GIGABYTE });

    await expect(
      assertFreeSpace('D:\\Exports', 4 * GIGABYTE, 'export this weekend'),
    ).rejects.toThrow(
      /Not enough free space to export this weekend\. 4\.06 GB is needed and 2\.00 GB is available/,
    );
  });

  /**
   * The margin covers zip central directories and whatever else the volume is
   * doing while several GB are copied, so an export that exactly fits the free
   * space is still refused.
   */
  it('keeps a margin over the bytes being written', async () => {
    statfs.mockResolvedValue({ bavail: 1, bsize: GIGABYTE });

    await expect(
      assertFreeSpace('D:\\Exports', GIGABYTE, 'export this weekend'),
    ).rejects.toThrow(/Not enough free space/);

    statfs.mockResolvedValue({
      bavail: GIGABYTE + FREE_SPACE_MARGIN_BYTES,
      bsize: 1,
    });

    await expect(
      assertFreeSpace('D:\\Exports', GIGABYTE, 'export this weekend'),
    ).resolves.toBeUndefined();
  });

  /**
   * A volume that will not answer is not grounds for refusing the write. The
   * check turns a predictable failure into a clear message up front; it is not
   * meant to become a new way for the operation to fail.
   */
  it('lets the write proceed when the volume will not report', async () => {
    statfs.mockRejectedValue(new Error('ENOSYS'));

    await expect(
      assertFreeSpace(
        '\\\\nas\\replays',
        400 * GIGABYTE,
        'import these replays',
      ),
    ).resolves.toBeUndefined();
  });

  it('lets the write proceed when the volume reports nonsense', async () => {
    statfs.mockResolvedValue({ bavail: undefined, bsize: undefined });

    await expect(
      assertFreeSpace('D:\\Exports', GIGABYTE, 'export this weekend'),
    ).resolves.toBeUndefined();
  });
});
