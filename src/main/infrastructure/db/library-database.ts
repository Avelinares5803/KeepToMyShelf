import { createPreMigrationBackup } from './backup';
import { openDatabase, type SqliteDatabase } from './connection';
import { libraryMigrations } from './migrations/library';
import { migrate } from './migrator';

/**
 * Opens a profile's library database and brings its schema up to date,
 * backing it up first if it already contains data.
 */
export function openLibraryDatabase(filePath: string): SqliteDatabase {
  const db = openDatabase(filePath);
  try {
    migrate(db, libraryMigrations, {
      beforeMigrate: (currentVersion) => createPreMigrationBackup(db, filePath, currentVersion),
    });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
