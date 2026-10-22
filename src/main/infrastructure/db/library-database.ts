import type { SqliteDatabase } from './connection';
import { openMigratedDatabase } from './migrated-database';
import { libraryMigrations } from './migrations/library';

/** Opens a profile's library database with an up-to-date schema. */
export function openLibraryDatabase(filePath: string): SqliteDatabase {
  return openMigratedDatabase(filePath, libraryMigrations);
}
