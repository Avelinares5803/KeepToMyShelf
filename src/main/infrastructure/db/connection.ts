import Database from 'better-sqlite3';

export type SqliteDatabase = Database.Database;

/**
 * Opens (or creates) a SQLite database with the settings every connection must use.
 * SQLite leaves foreign keys OFF by default and they must be enabled per connection.
 */
export function openDatabase(filePath: string): SqliteDatabase {
  const db = new Database(filePath);
  try {
    // Write-ahead log: survives crashes better and lets reads run while writing.
    db.pragma('journal_mode = WAL');
    // Safe with WAL: a power loss can lose the last transaction but never corrupts the file.
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');
    // Wait up to 5 s instead of failing immediately if the file is briefly locked.
    db.pragma('busy_timeout = 5000');
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
