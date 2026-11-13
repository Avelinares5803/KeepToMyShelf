import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupDatabase,
  createPreMigrationBackup,
  PRE_MIGRATION_BACKUPS_KEPT,
  preMigrationBackupPath,
  prunePreMigrationBackups,
} from '../../../src/main/infrastructure/db/backup';
import { openDatabase, type SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { createTempDir } from '../../support/temp-dir';

describe('database backups', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'library.db');
    db = openDatabase(dbPath);
    db.exec('CREATE TABLE game (title TEXT)');
    db.prepare('INSERT INTO game VALUES (?)').run('Pokémon Edición Oro');
  });

  afterEach(() => {
    db.close();
    tempDir.remove();
  });

  it('writes a snapshot that contains the current data', () => {
    const destination = join(tempDir.path, 'copia-ñáü.db');

    backupDatabase(db, destination);

    const copy = openDatabase(destination);
    try {
      expect(copy.prepare('SELECT title FROM game').all()).toEqual([
        { title: 'Pokémon Edición Oro' },
      ]);
    } finally {
      copy.close();
    }
  });

  it('never overwrites an existing file', () => {
    const destination = join(tempDir.path, 'copy.db');
    backupDatabase(db, destination);

    expect(() => backupDatabase(db, destination)).toThrow(/already exists/);
  });

  it('names pre-migration backups after the database, version and time', () => {
    const now = new Date('2026-10-21T15:02:18.123Z');

    expect(preMigrationBackupPath(join('data', 'library.db'), 3, now)).toBe(
      join('data', 'backups', 'library-v3-2026-10-21T15-02-18-123Z.db'),
    );
  });

  it('creates the backups folder and the pre-migration snapshot', () => {
    const now = new Date('2026-10-21T15:02:18.123Z');

    const destination = createPreMigrationBackup(db, dbPath, 1, now);

    expect(destination).toBe(preMigrationBackupPath(dbPath, 1, now));
    expect(existsSync(destination)).toBe(true);
  });

  describe('retention', () => {
    const backupsDir = () => join(tempDir.path, 'backups');
    const copyAt = (version: number, iso: string) =>
      preMigrationBackupPath(dbPath, version, new Date(iso)).split(/[\\/]/).pop()!;

    it(`keeps only the ${PRE_MIGRATION_BACKUPS_KEPT} most recent copies of each database`, () => {
      const days = ['01', '02', '03', '04', '05', '06'];
      for (const day of days) {
        createPreMigrationBackup(db, dbPath, 1, new Date(`2026-10-${day}T10:00:00.000Z`));
      }

      expect(readdirSync(backupsDir()).sort()).toEqual(
        days.slice(1).map((day) => copyAt(1, `2026-10-${day}T10:00:00.000Z`)),
      );
    });

    it('orders the copies by time, not by version, and leaves other files alone', () => {
      mkdirSync(backupsDir());
      // Copies of another database in the same folder (app.db's go next to profiles' zips).
      const others = ['app-v1-2026-01-01T00-00-00-000Z.db', 'mía.zip'];
      for (const name of others) writeFileSync(join(backupsDir(), name), 'x');
      const newest = copyAt(9, '2026-10-05T10:00:00.000Z');
      const oldest = copyAt(10, '2026-10-01T10:00:00.000Z');
      writeFileSync(join(backupsDir(), newest), 'x');
      writeFileSync(join(backupsDir(), oldest), 'x');

      prunePreMigrationBackups(dbPath, 1);

      expect(readdirSync(backupsDir()).sort()).toEqual([...others, newest].sort());
    });
  });
});
