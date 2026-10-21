import type { SqliteDatabase } from './connection';

/**
 * One forward-only schema change. `sql` must not contain BEGIN/COMMIT: each migration
 * runs inside its own transaction together with the version bump.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export interface MigrationResult {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: readonly number[];
}

export interface MigrateOptions {
  /** Called once before applying pending migrations to a database that already has data. */
  readonly beforeMigrate?: (currentVersion: number) => void;
}

/** The database was created by a newer version of the app; opening it could damage it. */
export class DatabaseTooNewError extends Error {
  override readonly name = 'DatabaseTooNewError';

  constructor(
    readonly databaseVersion: number,
    readonly supportedVersion: number,
  ) {
    super(`Database schema v${databaseVersion} is newer than supported v${supportedVersion}`);
  }
}

export class MigrationError extends Error {
  override readonly name = 'MigrationError';

  constructor(
    readonly migration: Migration,
    cause: unknown,
  ) {
    super(`Migration ${migration.version} (${migration.name}) failed`, { cause });
  }
}

/** Versions must be 1, 2, 3… without gaps, so the schema history is unambiguous. */
export function assertValidMigrations(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(
        `Invalid migration list: expected version ${index + 1}, found ${migration.version} (${migration.name})`,
      );
    }
  });
}

export function getSchemaVersion(db: SqliteDatabase): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/**
 * Brings the database schema up to date. Each migration is atomic: if one fails, the
 * database stays at the last successfully applied version and a MigrationError is thrown.
 */
export function migrate(
  db: SqliteDatabase,
  migrations: readonly Migration[],
  options: MigrateOptions = {},
): MigrationResult {
  assertValidMigrations(migrations);

  const fromVersion = getSchemaVersion(db);
  const latestVersion = migrations.length;
  if (fromVersion > latestVersion) {
    throw new DatabaseTooNewError(fromVersion, latestVersion);
  }

  const pending = migrations.slice(fromVersion);
  if (pending.length === 0) {
    return { fromVersion, toVersion: fromVersion, applied: [] };
  }

  if (fromVersion > 0) {
    options.beforeMigrate?.(fromVersion);
  }

  const applied: number[] = [];
  for (const migration of pending) {
    try {
      db.transaction(() => {
        db.exec(migration.sql);
        db.pragma(`user_version = ${migration.version}`);
      })();
    } catch (error) {
      throw new MigrationError(migration, error);
    }
    applied.push(migration.version);
  }

  return { fromVersion, toVersion: latestVersion, applied };
}
