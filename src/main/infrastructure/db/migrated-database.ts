import { createPreMigrationBackup } from './backup';
import { openDatabase, type SqliteDatabase } from './connection';
import { migrate, type Migration } from './migrator';

/**
 * Opens a database and brings its schema up to date, backing it up first if it already
 * contains data. The connection is closed if anything fails.
 */
export function openMigratedDatabase(
  filePath: string,
  migrations: readonly Migration[],
): SqliteDatabase {
  const db = openDatabase(filePath);
  try {
    migrate(db, migrations, {
      beforeMigrate: (currentVersion) => createPreMigrationBackup(db, filePath, currentVersion),
    });
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
