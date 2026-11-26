import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { AppError } from '../../core/errors';
import {
  csvLibrary,
  findCsvDuplicates,
  readCsvItems,
  type CsvRow,
} from '../../core/import/csv-import';
import { parseCsv } from '../../core/import/csv-parse';
import {
  InvalidImportItemError,
  planLibraryImport,
  type ExistingLibrary,
  type LibraryImportPlan,
} from '../../core/import/library-import';
import type { ItemKind } from '../../shared/content';
import type { LibraryExportFile } from '../../shared/exports';
import type { CsvImportCheck, ImportCheck, ImportCounts } from '../../shared/imports';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import {
  readExistingLibrary,
  readItemTitles,
  writeLibraryImport,
} from '../infrastructure/db/library-import-writer';
import type { BackupLock, BackupProgressListener } from './backup-lock';
import type { BackupService } from './backup-service';
import { parseLibraryImport } from './library-import-file';
import type { SessionManager } from './session-manager';

/** Far more than any real library takes (10 000 items are a few MB); it is read at once. */
export const IMPORT_MAX_BYTES = 100 * 1024 * 1024;

/** At most this many errors of a CSV file are told: a longer list would not help. */
export const CSV_IMPORT_MAX_ERRORS = 100;

export interface ImportServiceDeps {
  readonly sessions: SessionManager;
  /** Writes the backup of the state an import changes. */
  readonly backups: Pick<BackupService, 'writeAutomatic'>;
  /** Shared with backups and restores: the backup before importing is one of them. */
  readonly lock: BackupLock;
  readonly newId: () => string;
  readonly now?: () => Date;
  readonly maxBytes?: number;
}

/** A file chosen to import into the open profile, waiting for the user to confirm. */
type PendingImport = { readonly importId: string; readonly token: string } & (
  | { readonly source: 'json'; readonly file: LibraryExportFile }
  | {
      readonly source: 'csv';
      readonly rows: readonly CsvRow[];
      /** The rows left out: by default, those whose title exists. */
      readonly skipRows: ReadonlySet<number>;
    }
);

/**
 * Imports into the open profile a library exported to JSON, or the items of one kind in a CSV
 * file with the columns of the export. It only adds: items and collections of a JSON file are
 * told apart by their UUID, and catalog values by their exact name.
 */
export class ImportService {
  private pending: PendingImport | null = null;

  constructor(private readonly deps: ImportServiceDeps) {}

  /**
   * Reads and checks the JSON file at `path` and tells what importing it would add, without
   * changing anything. The returned id stands for the file, which is not read again.
   */
  async preview(token: string, path: string): Promise<ImportCheck> {
    const { db } = this.deps.sessions.require(token);
    const file = parseLibraryImport(await this.read(path, 'utf8'));
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
    this.pending = { importId, token, source: 'json', file };
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
   * Reads and checks the CSV file at `path`, with items of `kind`, and tells what importing it
   * would add, every error that prevents it, or the rows whose title exists, which are left out
   * unless `chooseCsvRows` says otherwise. Nothing changes.
   */
  async previewCsv(token: string, kind: ItemKind, path: string): Promise<CsvImportCheck> {
    const { db } = this.deps.sessions.require(token);
    const { records } = parseCsv(await this.read(path, 'csv'));
    const fileName = basename(path);
    const result = readCsvItems(kind, records, { newId: this.deps.newId, now: this.now() });
    if (!result.ok) {
      return {
        valid: false,
        fileName,
        errors: result.errors.slice(0, CSV_IMPORT_MAX_ERRORS),
        errorCount: result.errors.length,
      };
    }
    const duplicates = findCsvDuplicates(result.rows, readItemTitles(db, kind));
    const importId = this.deps.newId();
    const pending = {
      importId,
      token,
      source: 'csv' as const,
      rows: result.rows,
      skipRows: new Set(duplicates.map(({ row }) => row)),
    };
    const { counts } = this.planCsv(pending, readExistingLibrary(db));
    this.pending = pending;
    return {
      valid: true,
      preview: { importId, fileName, kind, rows: result.rows.length, duplicates, counts },
    };
  }

  /**
   * Chooses which rows of the CSV file previewed are left out (`skipRows`, by their row in the
   * spreadsheet), and tells what importing the others would add. Nothing changes.
   */
  chooseCsvRows(token: string, importId: string, skipRows: readonly number[]): ImportCounts {
    const { db } = this.deps.sessions.require(token);
    const pending = this.pendingFor(token, importId);
    if (pending.source !== 'csv') {
      throw new AppError('import.expired', 'The file chosen to import is not a CSV file');
    }
    const chosen = { ...pending, skipRows: new Set(skipRows) };
    const { counts } = this.planCsv(chosen, readExistingLibrary(db));
    this.pending = chosen;
    return counts;
  }

  /**
   * Imports the file chosen with `preview` or `previewCsv`, after saving an automatic backup of
   * the profile. What to add is decided again, in the same transaction that adds it: the
   * profile may have changed since the preview. All or nothing.
   */
  async confirm(
    token: string,
    importId: string,
    onProgress: BackupProgressListener,
  ): Promise<ImportCounts> {
    const { profileId } = this.deps.sessions.require(token);
    const pending = this.pendingFor(token, importId);
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
          const plan = this.plan(pending, db);
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

  private pendingFor(token: string, importId: string): PendingImport {
    const pending = this.pending;
    if (pending === null || pending.importId !== importId || pending.token !== token) {
      throw new AppError('import.expired', 'The file chosen to import is not known');
    }
    return pending;
  }

  private plan(pending: PendingImport, db: SqliteDatabase): LibraryImportPlan {
    const existing = readExistingLibrary(db);
    return pending.source === 'json'
      ? planLibraryImport(pending.file, existing)
      : this.planCsv(pending, existing);
  }

  /** The rows not left out, added as the items of a JSON file would be. */
  private planCsv(
    pending: Extract<PendingImport, { source: 'csv' }>,
    existing: ExistingLibrary,
  ): LibraryImportPlan {
    const kept = pending.rows.filter(({ row }) => !pending.skipRows.has(row));
    const library = csvLibrary(kept, existing.collectionsByNameKey, {
      newId: this.deps.newId,
      now: this.now(),
    });
    const plan = planLibraryImport(library, existing);
    return {
      ...plan,
      counts: { ...plan.counts, existingItems: pending.rows.length - kept.length },
    };
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  /**
   * The text of the file at `path`. A CSV file may also come in Windows-1252, as Excel saves
   * "CSV" in Spanish and other western languages: it is read so when it is not valid UTF-8.
   */
  private async read(path: string, encoding: 'utf8' | 'csv'): Promise<string> {
    const maxBytes = this.deps.maxBytes ?? IMPORT_MAX_BYTES;
    let bytes: Buffer;
    try {
      if ((await stat(path)).size > maxBytes) {
        throw new AppError('import.too_large', `The file is larger than ${maxBytes} bytes`);
      }
      bytes = await readFile(path);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('import.read_failed', `Could not read the file: ${String(error)}`, {
        cause: error,
      });
    }
    if (encoding === 'utf8') return bytes.toString('utf8');
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (error) {
      // A fatal decoder throws a TypeError for bytes that are not UTF-8.
      if (!(error instanceof TypeError)) throw error;
      // Every byte is a character in Windows-1252, so this never fails.
      return new TextDecoder('windows-1252').decode(bytes);
    }
  }
}
