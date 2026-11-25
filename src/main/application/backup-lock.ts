import { rmSync } from 'node:fs';
import { ConflictError } from '../../core/errors';
import type { BackupProgress } from '../../shared/backups';

export type BackupProgressListener = (progress: BackupProgress) => void;

/** An operation that gives way to the ones the user asks for. */
interface BackgroundOperation {
  readonly abort: AbortController;
  /** Settles when it has ended and released what it used; never rejects. */
  readonly ended: Promise<void>;
}

/**
 * Only one backup or restore runs at a time: they share the working folders and the
 * profile's files. A second one is refused with `backup.busy` instead of waiting, except that
 * a background one (a scheduled backup) is cancelled when the user asks for another.
 */
export class BackupLock {
  private busy = false;
  private background: BackgroundOperation | null = null;

  /** Runs what the user asked for, cancelling first the background operation, if any. */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new ConflictError('backup.busy', 'Another backup or restore is running');
    }
    // Taken before waiting, so nothing else starts meanwhile.
    this.busy = true;
    try {
      if (this.background !== null) {
        this.background.abort.abort();
        await this.background.ended;
      }
      return await operation();
    } finally {
      this.busy = false;
    }
  }

  /**
   * Runs an operation the user did not ask for. `operation` must reject soon after its signal
   * is aborted. Resolves to 'busy', without running it, if anything else is running, and to
   * 'cancelled' if it gave way.
   */
  async runInBackground(
    operation: (signal: AbortSignal) => Promise<void>,
  ): Promise<'done' | 'busy' | 'cancelled'> {
    if (this.busy || this.background !== null) return 'busy';
    const abort = new AbortController();
    let end = () => {};
    const ended = new Promise<void>((resolve) => {
      end = resolve;
    });
    this.background = { abort, ended };
    try {
      await operation(abort.signal);
      return 'done';
    } catch (error) {
      if (abort.signal.aborted) return 'cancelled';
      throw error;
    } finally {
      this.background = null;
      end();
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
