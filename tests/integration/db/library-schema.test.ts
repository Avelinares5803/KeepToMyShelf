import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { openLibraryDatabase } from '../../../src/main/infrastructure/db/library-database';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { getSchemaVersion } from '../../../src/main/infrastructure/db/migrator';
import { createTempDir } from './temp-dir';

const NOW = '2026-10-21T15:00:00.000Z';

function insertItem(db: SqliteDatabase, overrides: Record<string, unknown> = {}): number {
  const row: Record<string, unknown> = {
    uuid: randomUUID(),
    kind: 'game',
    title: 'Chrono Trigger',
    title_norm: 'chrono trigger',
    placeholder_no: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
  const columns = Object.keys(row);
  const statement = db.prepare(
    `INSERT INTO item (${columns.join(', ')}) VALUES (${columns.map((c) => `@${c}`).join(', ')})`,
  );
  return Number(statement.run(row).lastInsertRowid);
}

const placeholder = (number: number) => ({ title: null, title_norm: null, placeholder_no: number });

describe('library schema', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'library.db');
    db = openLibraryDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    tempDir.remove();
  });

  it('is created at the latest version without a backup', () => {
    expect(getSchemaVersion(db)).toBe(libraryMigrations.length);
    expect(existsSync(join(tempDir.path, 'backups'))).toBe(false);
  });

  it('keeps data when reopened', () => {
    insertItem(db);
    db.close();
    db = openLibraryDatabase(dbPath);

    expect(db.prepare('SELECT title FROM item').all()).toEqual([{ title: 'Chrono Trigger' }]);
  });

  it('accepts a fully populated game', () => {
    expect(() =>
      insertItem(db, {
        description: 'RPG clásico',
        notes: 'Final 13 de 13',
        is_favorite: 1,
        rating: 10,
        status: 'completed',
        is_replay: 1,
        owns_physical: 1,
        owns_digital: 1,
        started_on: '1995-03',
        finished_on: 'unknown',
        minutes_played: 2730,
        deleted_at: NOW,
      }),
    ).not.toThrow();
  });

  describe('title and placeholder', () => {
    it('accepts either a title or a placeholder number', () => {
      expect(() => insertItem(db)).not.toThrow();
      expect(() => insertItem(db, placeholder(1))).not.toThrow();
    });

    it.each([
      ['both a title and a placeholder', { placeholder_no: 1 }],
      ['neither a title nor a placeholder', { title: null, title_norm: null }],
      ['a blank title', { title: '   ', title_norm: '' }],
      ['a title without its normalized form', { title_norm: null }],
      ['a placeholder number of 0', { ...placeholder(0) }],
    ])('rejects %s', (_label, overrides) => {
      expect(() => insertItem(db, overrides)).toThrow(/CHECK constraint failed/);
    });

    it('allows duplicate titles', () => {
      insertItem(db);
      expect(() => insertItem(db)).not.toThrow();
    });

    it('keeps placeholder numbers unique per kind, including items in the trash', () => {
      insertItem(db, { ...placeholder(1), deleted_at: NOW });

      expect(() => insertItem(db, placeholder(1))).toThrow(/UNIQUE constraint failed/);
      expect(() => insertItem(db, { kind: 'movie', ...placeholder(1) })).not.toThrow();
    });
  });

  describe('attribute constraints', () => {
    it.each([
      ['an unknown kind', { kind: 'book' }],
      ['an unknown status', { status: 'finished' }],
      ['a rating of 0', { rating: 0 }],
      ['a rating above 10', { rating: 11 }],
      ['a non-boolean flag', { is_favorite: 2 }],
      ['negative minutes played', { minutes_played: -1 }],
      ['minutes played on a movie', { kind: 'movie', minutes_played: 90 }],
      ['a malformed start date', { started_on: '14/03/2021' }],
      ['a malformed end date', { finished_on: '2021-3' }],
      ['"Unknown" with a capital letter', { started_on: 'Unknown' }],
    ])('rejects %s', (_label, overrides) => {
      expect(() => insertItem(db, overrides)).toThrow(/CHECK constraint failed/);
    });

    it.each([
      ['text in a numeric column', { rating: 'five' }],
      ['a decimal rating', { rating: 4.5 }],
    ])('rejects %s (STRICT table)', (_label, overrides) => {
      expect(() => insertItem(db, overrides)).toThrow(/cannot store/);
    });

    it.each(['2021', '2021-03', '2021-03-14', 'unknown'])('accepts usage date "%s"', (value) => {
      expect(() => insertItem(db, { started_on: value, finished_on: value })).not.toThrow();
    });
  });

  describe('related tables', () => {
    it('stores series details and alternate titles', () => {
      const seriesId = insertItem(db, { kind: 'series', title: 'Dark', title_norm: 'dark' });
      db.prepare(
        'INSERT INTO series_details (item_id, seasons_count, episodes_count) VALUES (?, ?, ?)',
      ).run(seriesId, 3, 26);
      db.prepare('INSERT INTO item_alt_title (item_id, title, title_norm) VALUES (?, ?, ?)').run(
        seriesId,
        'Dark (Netflix)',
        'dark (netflix)',
      );

      expect(db.prepare('SELECT seasons_count, episodes_count FROM series_details').get()).toEqual({
        seasons_count: 3,
        episodes_count: 26,
      });
    });

    it('rejects negative series counts and blank alternate titles', () => {
      const id = insertItem(db, { kind: 'series' });

      expect(() =>
        db.prepare('INSERT INTO series_details (item_id, seasons_count) VALUES (?, ?)').run(id, -1),
      ).toThrow(/CHECK constraint failed/);
      expect(() =>
        db
          .prepare('INSERT INTO item_alt_title (item_id, title, title_norm) VALUES (?, ?, ?)')
          .run(id, ' ', ''),
      ).toThrow(/CHECK constraint failed/);
    });

    it('rejects related rows for an item that does not exist', () => {
      expect(() =>
        db
          .prepare('INSERT INTO item_alt_title (item_id, title, title_norm) VALUES (?, ?, ?)')
          .run(999, 'Ghost', 'ghost'),
      ).toThrow(/FOREIGN KEY constraint failed/);
    });

    it('deletes series details and alternate titles together with their item', () => {
      const id = insertItem(db, { kind: 'series' });
      db.prepare('INSERT INTO series_details (item_id, seasons_count) VALUES (?, ?)').run(id, 1);
      db.prepare('INSERT INTO item_alt_title (item_id, title, title_norm) VALUES (?, ?, ?)').run(
        id,
        'Alt',
        'alt',
      );

      db.prepare('DELETE FROM item WHERE id = ?').run(id);

      expect(db.prepare('SELECT COUNT(*) AS n FROM series_details').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM item_alt_title').get()).toEqual({ n: 0 });
    });
  });
});
