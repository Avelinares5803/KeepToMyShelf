import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { AppError } from '../../core/errors';
import { InvalidImportItemError, planLibraryImport } from '../../core/import/library-import';
import type { LibraryExportFile } from '../../shared/exports';
import type { ImportCheck, ImportCounts } from '../../shared/imports';
import {
  readExistingLibrary,
  writeLibraryImport,
} from '../infrastructure/db/library-import-writer';
import type { BackupLock, BackupProgressListener } from './backup-lock';
import type { BackupService } from './backup-service';
import { parseLibraryImport } from './library-import-file';
import type { SessionManager } from './session-manager';

/** Far more than any real library takes (10 000 items are a few MB); it is read at once. */
export const IMPORT_MAX_BYTES = 100 * 1024 * 1024;

export interface ImportServiceDeps {
  readonly sessions: SessionManager;
  /** Writes the backup of the state an import changes. */
  readonly backups: Pick<BackupService, 'writeAutomatic'>;
  /** Shared with backups and restores: the backup before importing is one of them. */
  readonly lock: BackupLock;
  readonly newId: () => string;
  readonly maxBytes?: number;
}

/** A file chosen to import into the open profile, waiting for the user to confirm. */
interface PendingImport {
  readonly importId: string;
  readonly token: string;
  readonly file: LibraryExportFile;
}

/**
 * Imports into the open profile a library exported to JSON. It only adds: items and
 * collections are told apart by their UUID, and catalog values by their exact name.
 */
export class ImportService {
  private pending: PendingImport | null = null;

  constructor(private readonly deps: ImportServiceDeps) {}

  /**
   * Reads and checks the file at `path` and tells what importing it would add, without
   * changing anything. The returned id stands for the file, which is not read again.
   */
  async preview(token: string, path: string): Promise<ImportCheck> {
    const { db } = this.deps.sessions.require(token);
    const file = await this.read(path);
    const fileName = basename(path);
    let counts: ImportCounts;
    try {
      counts = planLibraryImport(file, readExistingLibrary(db)).counts;
    } catch (error) {
      if (!(error instanceof InvalidImportItemError)) throw error;
      const { position, title, code } = error;
      return { valid: false, fileName, item: { position, title, code } };
    }
    const importId = this.deps.newId();
    // Only the last one chosen can be imported.
    this.pending = { importId, token, file };
    return {
      valid: true,
      preview: {
        importId,
        fileName,
        profileName: file.profile.name,
        exportedAt: file.exportedAt,
        counts,
      },
    };
  }

  /**
   * Imports the file chosen with `preview`, after saving an automatic backup of the profile.
   * What to add is decided again, in the same transaction that adds it: the profile may have
   * changed since the preview. All or nothing.
   */
  async confirm(
    token: string,
    importId: string,
    onProgress: BackupProgressListener,
  ): Promise<ImportCounts> {
    const { profileId } = this.deps.sessions.require(token);
    const pending = this.pending;
    if (pending === null || pending.importId !== importId || pending.token !== token) {
      throw new AppError('import.expired', 'The file chosen to import is not known');
    }
    this.pending = null;

    return this.deps.lock.run(async () => {
      const session = this.deps.sessions.require(token);
      try {
        await this.deps.backups.writeAutomatic(profileId, session.db, 'before-import', onProgress);
      } catch (error) {
        throw new AppError(
          'import.safety_backup_failed',
          'The backup of the current state failed, so nothing was imported',
          { cause: error },
        );
      }
      // The profile may have been closed while the backup was written.
      const { db } = this.deps.sessions.require(token);
      try {
        return db.transaction(() => {
          const plan = planLibraryImport(pending.file, readExistingLibrary(db));
          writeLibraryImport(db, plan);
          return plan.counts;
        })();
      } catch (error) {
        if (error instanceof AppError) throw error;
        // The handler only logs unexpected errors: this one is expected, but its cause matters.
        console.error('Import failed', error);
        throw new AppError('import.failed', `The import failed: ${String(error)}`, {
          cause: error,
        });
      }
    });
  }

  private async read(path: string): Promise<LibraryExportFile> {
    const maxBytes = this.deps.maxBytes ?? IMPORT_MAX_BYTES;
    let text: string;
    try {
      if ((await stat(path)).size > maxBytes) {
        throw new AppError('import.too_large', `The file is larger than ${maxBytes} bytes`);
      }
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('import.read_failed', `Could not read the file: ${String(error)}`, {
        cause: error,
      });
    }
    return parseLibraryImport(text);
  }
}
