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
const NOW = '2026-11-07T10:00:00.000Z';

describe('library migration 5 → 6 (collections)', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'library.db');

    // A library created by the previous version: items with covers, a gallery and a document.
    const v5 = openDatabase(dbPath);
    migrate(v5, libraryMigrations.slice(0, 5));
    v5.exec(`
      INSERT INTO media_file (id, sha256, store, kind, format, byte_size, width, height, created_at)
      VALUES (10, '${sha('a')}', 'files', 'image', 'png', 100, 10, 20, '${NOW}'),
             (11, '${sha('b')}', 'files', 'document', 'pdf', 100, NULL, NULL, '${NOW}'),
             (12, '${sha('c')}', 'originals', 'image', 'png', 100, 10, 20, '${NOW}');
    `);
    const insertItem = v5.prepare(
      `INSERT INTO item (id, uuid, kind, title, title_norm, created_at, updated_at, cover_media_id)
       VALUES (?, ?, ?, ?, ?, '${NOW}', '${NOW}', ?)`,
    );
    insertItem.run(1, randomUUID(), 'game', 'Sonic', 'sonic', 10);
    insertItem.run(2, randomUUID(), 'movie', 'Alien', 'alien', null);
    v5.exec(`
      INSERT INTO item_media (item_id, media_id, sort_order) VALUES (1, 10, 0);
      INSERT INTO item_media (item_id, media_id, label, sort_order) VALUES (1, 11, 'Manual', 0);
    `);
    v5.close();
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
  const addCollection = (db: SqliteDatabase, id: number, name: string, coverId?: number) =>
    db
      .prepare(
        `INSERT INTO collection (id, uuid, name, name_key, cover_media_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, '${NOW}', '${NOW}')`,
      )
      .run(id, randomUUID(), name, name.toLowerCase(), coverId ?? null);
  const addMember = (db: SqliteDatabase, collectionId: number, itemId: number) =>
    db
      .prepare(
        `INSERT INTO collection_item (collection_id, item_id, added_at) VALUES (?, ?, '${NOW}')`,
      )
      .run(collectionId, itemId);

  it('keeps every item and file, with no collections yet', () => {
    open((db) => {
      expect(getSchemaVersion(db)).toBe(libraryMigrations.length);
      expect(db.prepare('SELECT id, title, cover_media_id FROM item ORDER BY id').all()).toEqual([
        { id: 1, title: 'Sonic', cover_media_id: 10 },
        { id: 2, title: 'Alien', cover_media_id: null },
      ]);
      expect(db.prepare('SELECT COUNT(*) FROM item_media').pluck().get()).toBe(2);
      expect(db.prepare('SELECT COUNT(*) FROM media_file').pluck().get()).toBe(3);
      expect(db.prepare('SELECT COUNT(*) FROM collection').pluck().get()).toBe(0);
    });

    const backups = readdirSync(join(tempDir.path, 'backups'));
    expect(backups).toEqual([expect.stringMatching(/^library-v5-.*\.db$/)]);
  });

  it('holds items of every kind, each once per collection', () => {
    open((db) => {
      addCollection(db, 1, 'Favoritos');
      addMember(db, 1, 1);
      addMember(db, 1, 2);
      expect(() => addMember(db, 1, 1)).toThrow(/UNIQUE/);
      expect(() => addMember(db, 1, 999)).toThrow(/FOREIGN KEY/);
    });
  });

  it('rejects two names that differ only in case or accents', () => {
    open((db) => {
      addCollection(db, 1, 'Favoritos');
      expect(() => addCollection(db, 2, 'FAVORITOS')).toThrow(/UNIQUE/);
    });
  });

  it('forgets the memberships of a deleted collection or item, never the other side', () => {
    open((db) => {
      addCollection(db, 1, 'Favoritos');
      addCollection(db, 2, 'Pendientes');
      addMember(db, 1, 1);
      addMember(db, 2, 1);
      addMember(db, 2, 2);

      db.prepare('DELETE FROM collection WHERE id = 1').run();
      expect(db.prepare('SELECT COUNT(*) FROM item').pluck().get()).toBe(2);
      db.prepare('DELETE FROM item WHERE id = 2').run();

      expect(db.prepare('SELECT collection_id, item_id FROM collection_item').all()).toEqual([
        { collection_id: 2, item_id: 1 },
      ]);
    });
  });

  it('never deletes a file that is the cover of a collection', () => {
    open((db) => {
      addCollection(db, 1, 'Favoritos', 10);
      db.exec('DELETE FROM item_media WHERE media_id = 10; UPDATE item SET cover_media_id = NULL');
      expect(() => db.prepare('DELETE FROM media_file WHERE id = 10').run()).toThrow(/FOREIGN KEY/);
    });
  });

  it.each([
    ['a document', 11],
    ['a kept original', 12],
  ])('refuses %s as the cover of a collection', (_label, mediaId) => {
    open((db) => {
      expect(() => addCollection(db, 1, 'Favoritos', mediaId)).toThrow(
        /collection cover must be a stored image/,
      );
      addCollection(db, 1, 'Favoritos');
      expect(() =>
        db.prepare('UPDATE collection SET cover_media_id = ? WHERE id = 1').run(mediaId),
      ).toThrow(/collection cover must be a stored image/);
    });
  });
});
