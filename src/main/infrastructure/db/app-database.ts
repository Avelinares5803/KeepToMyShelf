import type { SqliteDatabase } from './connection';
import { openMigratedDatabase } from './migrated-database';
import { appMigrations } from './migrations/app';

/** Opens the app-wide database (profiles and preferences) with an up-to-date schema. */
export function openAppDatabase(filePath: string): SqliteDatabase {
  return openMigratedDatabase(filePath, appMigrations);
}
