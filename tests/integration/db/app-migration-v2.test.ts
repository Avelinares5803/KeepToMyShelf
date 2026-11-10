import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAppDatabase } from '../../../src/main/infrastructure/db/app-database';
import { openDatabase, type SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { appMigrations } from '../../../src/main/infrastructure/db/migrations/app';
import { getSchemaVersion, migrate } from '../../../src/main/infrastructure/db/migrator';
import { createTempDir } from '../../support/temp-dir';

const sha = (char: string) => char.repeat(64);
const NOW = '2026-11-10T10:00:00.000Z';
const PROFILE = '6f1c0d6e-3b1a-4c55-9f0e-2a7d8b9c0e11';

describe('app migration 1 → 2 (backgrounds)', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'app.db');

    // app.db of the previous version: a profile with its own preference and a global one.
    const v1 = openDatabase(dbPath);
    migrate(v1, appMigrations.slice(0, 1));
    v1.exec(`
      INSERT INTO profile (id, name, name_key, created_at) VALUES ('${PROFILE}', 'Ana', 'ana', '${NOW}');
      INSERT INTO app_setting (key, value) VALUES ('theme', '"dark"');
      INSERT INTO profile_setting (profile_id, key, value) VALUES ('${PROFILE}', 'language', '"en"');
    `);
    v1.close();
  });

  afterEach(() => {
    tempDir.remove();
  });

  const open = (run: (db: SqliteDatabase) => void) => {
    const db = openAppDatabase(dbPath);
    try {
      run(db);
    } finally {
      db.close();
    }
  };
  const addFile = (
    db: SqliteDatabase,
    values: { id: number; sha256?: string; store?: string; format?: string; originalId?: number },
  ) =>
    db
      .prepare(
        `INSERT INTO background_file
           (id, sha256, store, format, byte_size, width, height, original_id, created_at)
         VALUES (?, ?, ?, ?, 100, 1920, 1080, ?, '${NOW}')`,
      )
      .run(
        values.id,
        values.sha256 ?? sha('a'),
        values.store ?? 'files',
        values.format ?? 'webp',
        values.originalId ?? null,
      );

  it('keeps every profile and preference, with an empty gallery', () => {
    open((db) => {
      expect(getSchemaVersion(db)).toBe(appMigrations.length);
      expect(db.prepare('SELECT id, name FROM profile').all()).toEqual([
        { id: PROFILE, name: 'Ana' },
      ]);
      expect(db.prepare('SELECT key, value FROM app_setting').all()).toEqual([
        { key: 'theme', value: '"dark"' },
      ]);
      expect(db.prepare('SELECT key, value FROM profile_setting').all()).toEqual([
        { key: 'language', value: '"en"' },
      ]);
      expect(db.prepare('SELECT COUNT(*) FROM background_file').pluck().get()).toBe(0);
    });

    const backups = readdirSync(join(tempDir.path, 'backups'));
    expect(backups).toEqual([expect.stringMatching(/^app-v1-.*\.db$/)]);
  });

  it('stores the same bytes once per folder', () => {
    open((db) => {
      addFile(db, { id: 1, store: 'originals', format: 'png' });
      addFile(db, { id: 2, store: 'files', format: 'png' });
      expect(() => addFile(db, { id: 3, store: 'files' })).toThrow(/UNIQUE/);
    });
  });

  it('links an optimized copy to its original, and forgets it if the original goes', () => {
    open((db) => {
      addFile(db, { id: 1, sha256: sha('b'), store: 'originals', format: 'jpeg' });
      addFile(db, { id: 2, store: 'files', originalId: 1 });
      expect(() =>
        addFile(db, { id: 3, sha256: sha('c'), store: 'originals', originalId: 1 }),
      ).toThrow(/CHECK/);

      db.prepare('DELETE FROM background_file WHERE id = 1').run();
      expect(db.prepare('SELECT original_id FROM background_file WHERE id = 2').pluck().get()).toBe(
        null,
      );
    });
  });

  it.each([
    ['a PDF', { format: 'pdf' }],
    ['a short hash', { sha256: 'abc' }],
    ['an uppercase hash', { sha256: 'A'.repeat(64) }],
    ['an unknown folder', { store: 'cache' }],
  ])('refuses %s', (_label, values) => {
    open((db) => {
      expect(() => addFile(db, { id: 1, ...values })).toThrow(/CHECK/);
    });
  });
});
