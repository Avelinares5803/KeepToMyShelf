import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../../src/main/infrastructure/db/connection';
import { openLibraryDatabase } from '../../../src/main/infrastructure/db/library-database';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { getSchemaVersion, migrate } from '../../../src/main/infrastructure/db/migrator';
import { createTempDir } from '../../support/temp-dir';

describe('library migration 1 → 2 (catalogs)', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'library.db');

    // A library created by the previous version of the app, with data in it.
    const v1 = openDatabase(dbPath);
    migrate(v1, libraryMigrations.slice(0, 1));
    v1.prepare(
      `INSERT INTO item (uuid, kind, title, title_norm, created_at, updated_at, notes)
       VALUES (?, 'game', 'Chrono Trigger', 'chrono trigger', '2026-10-01', '2026-10-01', 'Mis notas')`,
    ).run(randomUUID());
    v1.close();
  });

  afterEach(() => {
    tempDir.remove();
  });

  it('upgrades the schema, keeps every item and backs up the old version first', () => {
    const db = openLibraryDatabase(dbPath);
    try {
      expect(getSchemaVersion(db)).toBe(libraryMigrations.length);
      expect(db.prepare('SELECT title, notes FROM item').all()).toEqual([
        { title: 'Chrono Trigger', notes: 'Mis notas' },
      ]);
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .pluck()
        .all() as string[];
      expect(tables).toEqual(
        expect.arrayContaining(['catalog_entry', 'item_entry', 'item_release', 'library_meta']),
      );
    } finally {
      db.close();
    }

    const backups = readdirSync(join(tempDir.path, 'backups'));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatch(/^library-v1-.*\.db$/);
    const backup = openDatabase(join(tempDir.path, 'backups', backups[0] as string));
    try {
      expect(getSchemaVersion(backup)).toBe(1);
      expect(backup.prepare('SELECT COUNT(*) FROM item').pluck().get()).toBe(1);
    } finally {
      backup.close();
    }
  });

  it('enforces the new constraints', () => {
    const db = openLibraryDatabase(dbPath);
    try {
      const insert = db.prepare(
        'INSERT INTO catalog_entry (catalog, name, name_key, scope) VALUES (?, ?, ?, ?)',
      );
      insert.run('company', 'Nintendo', 'nintendo', null);
      // Case and accents make values different; the exact same text does not.
      expect(() => insert.run('company', 'NINTENDO', 'nintendo', null)).not.toThrow();
      expect(() => insert.run('company', 'Nintendo', 'nintendo', null)).toThrow(/UNIQUE/);
      // The same name can exist in different catalogs.
      expect(() => insert.run('franchise', 'Nintendo', 'nintendo', null)).not.toThrow();
      // Only movie/series genres have a scope.
      expect(() => insert.run('company', 'Pixar', 'pixar', 'movie')).toThrow(/CHECK/);
      expect(() => insert.run('platform', 'Mesa', 'mesa', null)).not.toThrow();
      expect(() => insert.run('console', 'X', 'x', null)).toThrow(/CHECK/);
    } finally {
      db.close();
    }
  });
});
