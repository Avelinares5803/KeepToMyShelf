import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupDatabase,
  createPreMigrationBackup,
  preMigrationBackupPath,
} from '../../../src/main/infrastructure/db/backup';
import { openDatabase, type SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { createTempDir } from './temp-dir';

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
});
