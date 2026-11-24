import Database from 'better-sqlite3';
import type { Catalog, GenreScope } from '../../../core/catalogs/catalogs';
import { AppError, ConflictError } from '../../../core/errors';
import type { SqliteDatabase } from './connection';
import { libraryMigrations } from './migrations/library';
import { getSchemaVersion } from './migrator';

export interface LibraryCatalogEntry {
  readonly catalog: Catalog;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly scope: GenreScope | null;
}

/**
 * Every catalog value of a closed library. It is opened read-only, so it is neither migrated
 * nor changed: a library with another schema is refused. SQLite may leave its `-wal` and `-shm`
 * files next to it, which go away the next time the profile is opened and closed.
 */
export function readLibraryCatalogs(libraryPath: string): LibraryCatalogEntry[] {
  try {
    const db = new Database(libraryPath, { readonly: true, fileMustExist: true });
    try {
      assertCurrentSchema(getSchemaVersion(db));
      return readEntries(db);
    } finally {
      db.close();
    }
  } catch (error) {
    // SqliteError: no such file, not a database, damaged or locked. TypeError is what
    // better-sqlite3 throws when the folder itself does not exist.
    if (error instanceof Database.SqliteError || isMissingFolder(error)) {
      // The handler only logs unexpected errors: this one is expected, but its cause matters.
      console.error('Could not read the catalogs of another profile', error);
      throw new AppError('catalog.copy_unreadable', `Could not read ${libraryPath}`, {
        cause: error,
      });
    }
    throw error;
  }
}

function assertCurrentSchema(version: number): void {
  const supported = libraryMigrations.length;
  if (version < supported) {
    throw new ConflictError(
      'catalog.copy_source_outdated',
      `Library schema v${version} is older than v${supported}`,
    );
  }
  if (version > supported) {
    throw new ConflictError(
      'catalog.copy_source_too_new',
      `Library schema v${version} is newer than supported v${supported}`,
    );
  }
}

function readEntries(db: SqliteDatabase): LibraryCatalogEntry[] {
  const aliases = new Map<number, string[]>();
  const aliasRows = db
    .prepare('SELECT entry_id, name FROM catalog_entry_alias ORDER BY id')
    .all() as { entry_id: number; name: string }[];
  for (const { entry_id, name } of aliasRows) {
    const names = aliases.get(entry_id);
    if (names === undefined) aliases.set(entry_id, [name]);
    else names.push(name);
  }
  const rows = db
    .prepare('SELECT id, catalog, name, scope FROM catalog_entry ORDER BY id')
    .all() as { id: number; catalog: Catalog; name: string; scope: GenreScope | null }[];
  return rows.map(({ id, catalog, name, scope }) => ({
    catalog,
    name,
    aliases: aliases.get(id) ?? [],
    scope,
  }));
}

function isMissingFolder(error: unknown): boolean {
  return error instanceof TypeError && error.message.includes('directory does not exist');
}
