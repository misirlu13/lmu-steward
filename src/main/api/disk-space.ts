import { statfs } from 'fs/promises';

/**
 * Slack on top of whatever is being written: zip central directories, the
 * filesystem's own overhead, and whatever else the volume is doing while a
 * multi-GB copy runs.
 */
export const FREE_SPACE_MARGIN_BYTES = 64 * 1024 * 1024;

const formatGigabytes = (bytes: number): string =>
  `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/**
 * Refuses a write that cannot finish, before it starts.
 *
 * Both sides of this feature move several GB at a time, and both leave
 * something worse than nothing behind when the disk fills mid-way: a truncated
 * zip that looks like an archive and is not one, or a half-copied .Vcr sitting
 * in the LMU install with no record of it.
 *
 * A volume that will not answer is not grounds for refusing the write. The
 * check exists to turn a predictable failure into a clear message up front, not
 * to become a new way for the operation to fail.
 */
export const assertFreeSpace = async (
  targetDirectory: string,
  requiredBytes: number,
  action: string,
): Promise<void> => {
  let availableBytes: number;

  try {
    const stats = await statfs(targetDirectory);
    availableBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return;
  }

  if (!Number.isFinite(availableBytes)) {
    return;
  }

  const needed = requiredBytes + FREE_SPACE_MARGIN_BYTES;

  if (availableBytes < needed) {
    throw new Error(
      `Not enough free space to ${action}. ${formatGigabytes(
        needed,
      )} is needed and ${formatGigabytes(
        availableBytes,
      )} is available on that drive.`,
    );
  }
};
