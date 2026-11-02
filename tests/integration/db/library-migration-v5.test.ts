import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { openLibraryDatabase } from '../../../src/main/infrastructure/db/library-database';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { getSchemaVersion, migrate } from '../../../src/main/infrastructure/db/migrator';
import { createTempDir } from '../../support/temp-dir';

const sha = (char: string) => char.repeat(64);

describe('library migration 4 → 5 (independent cover)', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'library.db');

    // A library created by the previous version, where the first image was the cover.
    const v4 = openDatabase(dbPath);
    migrate(v4, libraryMigrations.slice(0, 4));
    const insertItem = v4.prepare(
      `INSERT INTO item (id, uuid, kind, title, title_norm, created_at, updated_at)
       VALUES (?, ?, 'game', ?, ?, '2026-10-01', '2026-10-01')`,
    );
    insertItem.run(1, randomUUID(), 'Sonic', 'sonic');
    insertItem.run(2, randomUUID(), 'Tetris', 'tetris');
    insertItem.run(3, randomUUID(), 'Doom', 'doom');
    v4.exec(`
      INSERT INTO media_file (id, sha256, store, kind, format, byte_size, width, height, created_at)
      VALUES (10, '${sha('a')}', 'files', 'image', 'png', 100, 10, 20, '2026-10-31'),
             (11, '${sha('b')}', 'files', 'image', 'png', 100, 10, 20, '2026-10-31'),
             (12, '${sha('c')}', 'files', 'image', 'png', 100, 10, 20, '2026-10-31'),
             (13, '${sha('d')}', 'files', 'document', 'pdf', 100, NULL, NULL, '2026-10-31');
      -- Sonic: three images, the second added (11) was moved first; and a document.
      INSERT INTO item_media (item_id, media_id, sort_order) VALUES (1, 10, 1), (1, 11, 0), (1, 12, 2);
      INSERT INTO item_media (item_id, media_id, label, sort_order) VALUES (1, 13, 'Manual', 0);
      -- Tetris: only a document. Doom: nothing.
      INSERT INTO item_media (item_id, media_id, label, sort_order) VALUES (2, 13, 'Manual', 0);
    `);
    v4.close();
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

  it('makes the first image the cover and keeps it in the gallery', () => {
    open((db) => {
      expect(getSchemaVersion(db)).toBe(libraryMigrations.length);
      expect(db.prepare('SELECT id, cover_media_id FROM item ORDER BY id').all()).toEqual([
        { id: 1, cover_media_id: 11 },
        { id: 2, cover_media_id: null },
        { id: 3, cover_media_id: null },
      ]);
      // The gallery and the documents are left as they were.
      expect(
        db
          .prepare(
            'SELECT item_id, media_id, sort_order FROM item_media ORDER BY item_id, media_id',
          )
          .all(),
      ).toEqual([
        { item_id: 1, media_id: 10, sort_order: 1 },
        { item_id: 1, media_id: 11, sort_order: 0 },
        { item_id: 1, media_id: 12, sort_order: 2 },
        { item_id: 1, media_id: 13, sort_order: 0 },
        { item_id: 2, media_id: 13, sort_order: 0 },
      ]);
    });

    const backups = readdirSync(join(tempDir.path, 'backups'));
    expect(backups).toEqual([expect.stringMatching(/^library-v4-.*\.db$/)]);
  });

  it('never deletes a file that is a cover', () => {
    open((db) => {
      db.prepare('DELETE FROM item_media WHERE media_id = 11').run();
      expect(() => db.prepare('DELETE FROM media_file WHERE id = 11').run()).toThrow(/FOREIGN KEY/);
    });
  });

  it.each([
    ['a document', 13],
    ['a kept original', 14],
  ])('refuses %s as a cover', (_label, mediaId) => {
    open((db) => {
      db.prepare(
        `INSERT INTO media_file (id, sha256, store, kind, format, byte_size, width, height, created_at)
         VALUES (14, ?, 'originals', 'image', 'jpeg', 100, 10, 20, '2026-10-31')`,
      ).run(sha('e'));
      expect(() =>
        db.prepare('UPDATE item SET cover_media_id = ? WHERE id = 3').run(mediaId),
      ).toThrow(/item cover must be a stored image/);
      expect(() =>
        db
          .prepare(
            `INSERT INTO item (uuid, kind, title, title_norm, created_at, updated_at, cover_media_id)
             VALUES (?, 'game', 'Quake', 'quake', '2026-11-02', '2026-11-02', ?)`,
          )
          .run(randomUUID(), mediaId),
      ).toThrow(/item cover must be a stored image/);
    });
  });

  it('accepts a stored image as a cover and forgets it with its item', () => {
    open((db) => {
      db.prepare('UPDATE item SET cover_media_id = 12 WHERE id = 3').run();
      expect(db.prepare('SELECT cover_media_id FROM item WHERE id = 3').pluck().get()).toBe(12);
      db.prepare('DELETE FROM item WHERE id = 3').run();
      expect(db.prepare('SELECT COUNT(*) FROM media_file WHERE id = 12').pluck().get()).toBe(1);
    });
  });
});
