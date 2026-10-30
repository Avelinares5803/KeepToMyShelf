import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { openLibraryDatabase } from '../../../src/main/infrastructure/db/library-database';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { getSchemaVersion, migrate } from '../../../src/main/infrastructure/db/migrator';
import { createTempDir } from '../../support/temp-dir';

describe('library migration 2 → 3 (countries of origin)', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'library.db');

    // A library created by the previous version, using every table the migration rebuilds.
    const v2 = openDatabase(dbPath);
    migrate(v2, libraryMigrations.slice(0, 2));
    v2.prepare(
      `INSERT INTO item (id, uuid, kind, title, title_norm, created_at, updated_at)
       VALUES (1, ?, 'game', 'Sonic', 'sonic', '2026-10-01', '2026-10-01')`,
    ).run(randomUUID());
    v2.exec(`
      INSERT INTO catalog_entry (id, catalog, name, name_key, scope) VALUES
        (10, 'platform', 'Mega Drive', 'mega drive', NULL),
        (11, 'company', 'Sega', 'sega', NULL),
        (12, 'region', 'Japón', 'japon', NULL),
        (13, 'screen_genre', 'Sitcom', 'sitcom', 'series');
      INSERT INTO catalog_entry_alias (entry_id, name, name_key) VALUES (10, 'Sega Genesis', 'sega genesis');
      INSERT INTO item_entry (item_id, entry_id, role, sort_order) VALUES
        (1, 10, 'owned_on', 0), (1, 11, 'developer', 0), (1, 11, 'publisher', 0);
      INSERT INTO item_release (item_id, region_id, date, sort_order) VALUES (1, 12, '1991-06-23', 0);
    `);
    v2.close();
  });

  afterEach(() => {
    tempDir.remove();
  });

  const open = (run: (db: SqliteDatabase) => void) => {
    const db = openLibraryDatabase(dbPath);
    try {
      run(db);
    } finally {
      db.close();
    }
  };

  it('keeps every value, other name, link and release date, with the same ids', () => {
    open((db) => {
      expect(getSchemaVersion(db)).toBe(3);
      expect(
        db.prepare('SELECT id, catalog, name, scope FROM catalog_entry ORDER BY id').all(),
      ).toEqual([
        { id: 10, catalog: 'platform', name: 'Mega Drive', scope: null },
        { id: 11, catalog: 'company', name: 'Sega', scope: null },
        { id: 12, catalog: 'region', name: 'Japón', scope: null },
        { id: 13, catalog: 'screen_genre', name: 'Sitcom', scope: 'series' },
      ]);
      expect(db.prepare('SELECT entry_id, name FROM catalog_entry_alias').all()).toEqual([
        { entry_id: 10, name: 'Sega Genesis' },
      ]);
      expect(
        db.prepare('SELECT entry_id, role FROM item_entry ORDER BY entry_id, role').all(),
      ).toEqual([
        { entry_id: 10, role: 'owned_on' },
        { entry_id: 11, role: 'developer' },
        { entry_id: 11, role: 'publisher' },
      ]);
      expect(db.prepare('SELECT region_id, date FROM item_release').all()).toEqual([
        { region_id: 12, date: '1991-06-23' },
      ]);
    });

    const backups = readdirSync(join(tempDir.path, 'backups'));
    expect(backups).toEqual([expect.stringMatching(/^library-v2-.*\.db$/)]);
  });

  it('accepts countries of origin and keeps every rule and reference working', () => {
    open((db) => {
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      const country = db
        .prepare(
          "INSERT INTO catalog_entry (catalog, name, name_key) VALUES ('country', 'Japón', 'japon')",
        )
        .run().lastInsertRowid;
      db.prepare(
        "INSERT INTO item_entry (item_id, entry_id, role) VALUES (1, ?, 'origin_country')",
      ).run(country);

      // Old rules still apply.
      expect(() =>
        db
          .prepare(
            "INSERT INTO catalog_entry (catalog, name, name_key) VALUES ('console', 'X', 'x')",
          )
          .run(),
      ).toThrow(/CHECK/);
      expect(() =>
        db
          .prepare("INSERT INTO item_entry (item_id, entry_id, role) VALUES (1, 10, 'owner')")
          .run(),
      ).toThrow(/CHECK/);
      expect(() =>
        db.prepare("INSERT INTO item_entry (item_id, entry_id, role) VALUES (1, 999, 'tag')").run(),
      ).toThrow(/FOREIGN KEY/);

      // References still cascade: deleting a value removes its links and other names, and
      // deleting a region keeps its release dates without a region.
      db.prepare('DELETE FROM catalog_entry WHERE id IN (10, 12)').run();
      expect(db.prepare('SELECT COUNT(*) FROM catalog_entry_alias').pluck().get()).toBe(0);
      expect(db.prepare('SELECT COUNT(*) FROM item_entry WHERE entry_id = 10').pluck().get()).toBe(
        0,
      );
      expect(db.prepare('SELECT region_id FROM item_release').pluck().get()).toBeNull();
    });
  });
});
