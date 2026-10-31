import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { openLibraryDatabase } from '../../../src/main/infrastructure/db/library-database';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { getSchemaVersion, migrate } from '../../../src/main/infrastructure/db/migrator';
import { createTempDir } from '../../support/temp-dir';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

describe('library migration 3 → 4 (media)', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'library.db');

    // A library created by the previous version, with an item and its relations.
    const v3 = openDatabase(dbPath);
    migrate(v3, libraryMigrations.slice(0, 3));
    v3.prepare(
      `INSERT INTO item (id, uuid, kind, title, title_norm, created_at, updated_at, deleted_at)
       VALUES (1, ?, 'game', 'Sonic', 'sonic', '2026-10-01', '2026-10-01', NULL),
              (2, ?, 'movie', 'Alien', 'alien', '2026-10-02', '2026-10-02', '2026-10-03')`,
    ).run(randomUUID(), randomUUID());
    v3.exec(`
      INSERT INTO catalog_entry (id, catalog, name, name_key) VALUES (10, 'country', 'Japón', 'japon');
      INSERT INTO item_entry (item_id, entry_id, role, sort_order) VALUES (1, 10, 'origin_country', 0);
      INSERT INTO item_alt_title (item_id, title, title_norm) VALUES (1, 'ソニック', 'ソニック');
    `);
    v3.close();
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

  const insertFile = (db: SqliteDatabase, values: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      sha256: SHA_A,
      store: 'files',
      kind: 'image',
      format: 'png',
      byte_size: 100,
      width: 10,
      height: 20,
      is_animated: 0,
      original_id: null,
      created_at: '2026-10-31',
      ...values,
    };
    const columns = Object.keys(row);
    return Number(
      db
        .prepare(
          `INSERT INTO media_file (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
        )
        .run(row).lastInsertRowid,
    );
  };

  it('keeps every item and relation, adds empty media tables and leaves a backup', () => {
    open((db) => {
      expect(getSchemaVersion(db)).toBe(4);
      expect(db.prepare('SELECT id, title, deleted_at FROM item ORDER BY id').all()).toEqual([
        { id: 1, title: 'Sonic', deleted_at: null },
        { id: 2, title: 'Alien', deleted_at: '2026-10-03' },
      ]);
      expect(db.prepare('SELECT item_id, entry_id, role FROM item_entry').all()).toEqual([
        { item_id: 1, entry_id: 10, role: 'origin_country' },
      ]);
      expect(db.prepare('SELECT title FROM item_alt_title').pluck().all()).toEqual(['ソニック']);
      expect(db.prepare('SELECT COUNT(*) FROM media_file').pluck().get()).toBe(0);
      expect(db.prepare('SELECT COUNT(*) FROM item_media').pluck().get()).toBe(0);
    });

    const backups = readdirSync(join(tempDir.path, 'backups'));
    expect(backups).toEqual([expect.stringMatching(/^library-v3-.*\.db$/)]);
  });

  it('stores the same bytes once per folder, never twice in one', () => {
    open((db) => {
      insertFile(db);
      expect(() => insertFile(db, { store: 'originals' })).not.toThrow();
      expect(() => insertFile(db)).toThrow(/UNIQUE/);
    });
  });

  it.each([
    ['a hash that is not 64 characters', { sha256: 'abc' }],
    ['a hash with uppercase or non-hex characters', { sha256: 'A'.repeat(64) }],
    ['a path disguised as a hash', { sha256: `${'a'.repeat(61)}/..` }],
    ['an unknown folder', { store: 'cache' }],
    ['an unknown format', { format: 'svg' }],
    [
      'a document that is not a PDF',
      { kind: 'document', format: 'png', width: null, height: null },
    ],
    ['a PDF registered as an image', { format: 'pdf' }],
    ['an image without dimensions', { width: null }],
    ['a document with dimensions', { kind: 'document', format: 'pdf' }],
    [
      'an animated document',
      { kind: 'document', format: 'pdf', width: null, height: null, is_animated: 1 },
    ],
    [
      'a document among the originals',
      { kind: 'document', format: 'pdf', width: null, height: null, store: 'originals' },
    ],
    ['an empty file', { byte_size: 0 }],
  ])('rejects %s', (_label, values) => {
    open((db) => {
      expect(() => insertFile(db, values)).toThrow(/CHECK/);
    });
  });

  it('links an optimized copy to its original and forgets the link if the original goes', () => {
    open((db) => {
      const original = insertFile(db, { store: 'originals', format: 'jpeg' });
      const copy = insertFile(db, { sha256: SHA_B, format: 'webp', original_id: original });
      // An original never points to another original.
      expect(() =>
        insertFile(db, { sha256: SHA_B, store: 'originals', original_id: original }),
      ).toThrow(/CHECK/);

      db.prepare('DELETE FROM media_file WHERE id = ?').run(original);
      expect(db.prepare('SELECT original_id FROM media_file WHERE id = ?').pluck().get(copy)).toBe(
        null,
      );
    });
  });

  it('removes attachments with their item but never deletes a file in use', () => {
    open((db) => {
      const file = insertFile(db);
      db.prepare('INSERT INTO item_media (item_id, media_id, sort_order) VALUES (1, ?, 0)').run(
        file,
      );
      expect(() =>
        db.prepare('INSERT INTO item_media (item_id, media_id) VALUES (1, ?)').run(file),
      ).toThrow(/UNIQUE|PRIMARY KEY/);
      expect(() =>
        db.prepare('INSERT INTO item_media (item_id, media_id) VALUES (99, ?)').run(file),
      ).toThrow(/FOREIGN KEY/);
      expect(() =>
        db
          .prepare("INSERT INTO item_media (item_id, media_id, label) VALUES (2, ?, '  ')")
          .run(file),
      ).toThrow(/CHECK/);

      expect(() => db.prepare('DELETE FROM media_file WHERE id = ?').run(file)).toThrow(
        /FOREIGN KEY/,
      );
      db.prepare('DELETE FROM item WHERE id = 1').run();
      expect(db.prepare('SELECT COUNT(*) FROM item_media').pluck().get()).toBe(0);
      expect(db.prepare('SELECT COUNT(*) FROM media_file').pluck().get()).toBe(1);
    });
  });
});
