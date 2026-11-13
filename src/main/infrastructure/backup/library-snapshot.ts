import Database from 'better-sqlite3';
import type { MediaFormat } from '../../../core/media/media-format';
import type { MediaStoreName } from '../media/media-store';

export interface SnapshotFile {
  readonly sha256: string;
  readonly store: MediaStoreName;
  readonly format: MediaFormat;
}

export interface SnapshotContents {
  readonly schemaVersion: number;
  /** Every stored file the snapshot lists, in both folders. */
  readonly files: readonly SnapshotFile[];
}

/**
 * What a library snapshot (a copy made with VACUUM INTO) contains. Opened read-only, so the
 * copy is left exactly as it was written. A library from before media existed lists no files.
 */
export function readLibrarySnapshot(snapshotPath: string): SnapshotContents {
  const db = new Database(snapshotPath, { readonly: true, fileMustExist: true });
  try {
    const schemaVersion = db.pragma('user_version', { simple: true }) as number;
    const hasMedia =
      db
        .prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'media_file'")
        .get() !== undefined;
    const files = hasMedia
      ? (db
          .prepare('SELECT sha256, store, format FROM media_file ORDER BY store, sha256')
          .all() as SnapshotFile[])
      : [];
    return { schemaVersion, files };
  } finally {
    db.close();
  }
}
