import Database from 'better-sqlite3';
import { naturalSortKey } from '../../../core/text/natural-sort';

export type SqliteDatabase = Database.Database;

/**
 * SQL function that sorts numbers by their value: `ORDER BY natural_key(item.title_norm)`.
 * better-sqlite3 cannot register a collation, so the key is computed by a function. It
 * only appears in queries, never in the schema, so other tools can still open the file.
 */
const NATURAL_KEY = 'natural_key';

/**
 * Opens (or creates) a SQLite database with the settings every connection must use.
 * SQLite leaves foreign keys OFF by default and they must be enabled per connection.
 * Functions such as `natural_key` are also registered per connection.
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
    db.function(NATURAL_KEY, { deterministic: true }, (text: unknown) => {
      if (text === null) return null;
      if (typeof text !== 'string') throw new TypeError(`${NATURAL_KEY} expects text`);
      return naturalSortKey(text);
    });
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}
