import { existsSync, mkdirSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { SqliteDatabase } from './connection';

/**
 * Writes a consistent snapshot of the open database to `destinationPath`.
 * Never overwrites an existing file.
 */
export function backupDatabase(db: SqliteDatabase, destinationPath: string): void {
  if (existsSync(destinationPath)) {
    throw new Error(`Backup destination already exists: ${destinationPath}`);
  }
  db.prepare('VACUUM INTO ?').run(destinationPath);
}

/** e.g. <dir>/backups/library-v1-2026-10-21T15-02-18-000Z.db */
export function preMigrationBackupPath(
  databasePath: string,
  fromVersion: number,
  now: Date,
): string {
  const name = basename(databasePath, extname(databasePath));
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  return join(dirname(databasePath), 'backups', `${name}-v${fromVersion}-${timestamp}.db`);
}

export function createPreMigrationBackup(
  db: SqliteDatabase,
  databasePath: string,
  fromVersion: number,
  now: Date = new Date(),
): string {
  const destination = preMigrationBackupPath(databasePath, fromVersion, now);
  mkdirSync(dirname(destination), { recursive: true });
  backupDatabase(db, destination);
  return destination;
}
