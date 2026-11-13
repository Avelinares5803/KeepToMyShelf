import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { SqliteDatabase } from './connection';

/** How many pre-migration copies of each database are kept; older ones are removed. */
export const PRE_MIGRATION_BACKUPS_KEPT = 5;

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
  prunePreMigrationBackups(databasePath, PRE_MIGRATION_BACKUPS_KEPT);
  return destination;
}

/**
 * Removes the pre-migration copies of a database except the `keep` most recent, by the time
 * in their names (not their version: v10 is newer than v9). Only files named like these
 * copies are touched. A copy Windows will not let go of is left for the next time.
 */
export function prunePreMigrationBackups(databasePath: string, keep: number): void {
  const folder = join(dirname(databasePath), 'backups');
  if (!existsSync(folder)) return;
  const name = basename(databasePath, extname(databasePath));
  const copies = readdirSync(folder).flatMap((fileName) => {
    const stamp = preMigrationStamp(fileName, name);
    return stamp === null ? [] : [{ fileName, stamp }];
  });
  copies.sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0));
  for (const { fileName } of copies.slice(keep)) {
    try {
      rmSync(join(folder, fileName));
    } catch (error) {
      // Housekeeping: a locked copy must not stop the database from opening.
      console.warn(`Could not remove old backup "${fileName}"; will retry later`, error);
    }
  }
}

const PRE_MIGRATION_COPY = /^(.+)-v\d+-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.db$/;

/** The time in the name of a pre-migration copy of `databaseName`, or null if it is not one. */
function preMigrationStamp(fileName: string, databaseName: string): string | null {
  const match = PRE_MIGRATION_COPY.exec(fileName);
  return match !== null && match[1] === databaseName ? (match[2] as string) : null;
}
