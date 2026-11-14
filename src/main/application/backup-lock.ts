import { rmSync } from 'node:fs';
import { ConflictError } from '../../core/errors';
import type { BackupProgress } from '../../shared/backups';

export type BackupProgressListener = (progress: BackupProgress) => void;

/**
 * Only one backup or restore runs at a time: they share the working folders and the
 * profile's files. A second one is refused with `backup.busy` instead of waiting.
 */
export class BackupLock {
  private busy = false;

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new ConflictError('backup.busy', 'Another backup or restore is running');
    }
    this.busy = true;
    try {
      return await operation();
    } finally {
      this.busy = false;
    }
  }
}

/** Passes on the progress only when the whole percentage changes, not for every chunk. */
export function progressByPercent(
  listener: BackupProgressListener,
  stage: BackupProgress['stage'],
): (doneBytes: number, totalBytes: number) => void {
  let lastPercent = -1;
  return (doneBytes, totalBytes) => {
    const percent = totalBytes === 0 ? 100 : Math.floor((doneBytes * 100) / totalBytes);
    if (percent === lastPercent) return;
    lastPercent = percent;
    listener({ stage, doneBytes, totalBytes });
  };
}

/** Housekeeping: a file or folder Windows will not let go of is left for the next time. */
export function removeIfPossible(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true });
  } catch (error) {
    console.warn(`Could not remove "${path}"; will retry later`, error);
  }
}
