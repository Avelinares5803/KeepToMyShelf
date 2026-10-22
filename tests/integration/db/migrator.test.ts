import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, type SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import {
  assertValidMigrations,
  DatabaseTooNewError,
  getSchemaVersion,
  migrate,
  MigrationError,
  type Migration,
} from '../../../src/main/infrastructure/db/migrator';
import { createTempDir } from '../../support/temp-dir';

const createBooks: Migration = {
  version: 1,
  name: 'books',
  sql: 'CREATE TABLE book (id INTEGER PRIMARY KEY, title TEXT NOT NULL);',
};
const addAuthor: Migration = {
  version: 2,
  name: 'author',
  sql: 'ALTER TABLE book ADD COLUMN author TEXT;',
};
const createShelves: Migration = {
  version: 3,
  name: 'shelves',
  sql: 'CREATE TABLE shelf (id INTEGER PRIMARY KEY);',
};

function tableNames(db: SqliteDatabase): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
}

describe('migrate', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let dbPath: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    tempDir = createTempDir();
    dbPath = join(tempDir.path, 'test.db');
    db = openDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    tempDir.remove();
  });

  it('applies every migration to an empty database', () => {
    const result = migrate(db, [createBooks, addAuthor]);

    expect(result).toEqual({ fromVersion: 0, toVersion: 2, applied: [1, 2] });
    expect(getSchemaVersion(db)).toBe(2);
    expect(tableNames(db)).toEqual(['book']);
  });

  it('does nothing when the schema is already up to date', () => {
    migrate(db, [createBooks]);
    const beforeMigrate = vi.fn();

    const result = migrate(db, [createBooks], { beforeMigrate });

    expect(result).toEqual({ fromVersion: 1, toVersion: 1, applied: [] });
    expect(beforeMigrate).not.toHaveBeenCalled();
  });

  it('applies only pending migrations and keeps existing data', () => {
    migrate(db, [createBooks]);
    db.prepare('INSERT INTO book (title) VALUES (?)').run('Cien años de soledad');

    const result = migrate(db, [createBooks, addAuthor]);

    expect(result).toEqual({ fromVersion: 1, toVersion: 2, applied: [2] });
    expect(db.prepare('SELECT title, author FROM book').all()).toEqual([
      { title: 'Cien años de soledad', author: null },
    ]);
  });

  it('persists the schema version across connections', () => {
    migrate(db, [createBooks, addAuthor]);
    db.close();
    db = openDatabase(dbPath);

    expect(getSchemaVersion(db)).toBe(2);
  });

  it('calls beforeMigrate once, with the current version, only for existing databases', () => {
    const beforeMigrate = vi.fn();
    migrate(db, [createBooks], { beforeMigrate });
    expect(beforeMigrate).not.toHaveBeenCalled();

    migrate(db, [createBooks, addAuthor, createShelves], { beforeMigrate });
    expect(beforeMigrate).toHaveBeenCalledTimes(1);
    expect(beforeMigrate).toHaveBeenCalledWith(1);
  });

  it('does not migrate if beforeMigrate fails (e.g. the backup could not be written)', () => {
    migrate(db, [createBooks]);
    const failingBackup = () => {
      throw new Error('disk full');
    };

    expect(() => migrate(db, [createBooks, addAuthor], { beforeMigrate: failingBackup })).toThrow(
      'disk full',
    );
    expect(getSchemaVersion(db)).toBe(1);
  });

  it('rolls back a failing migration entirely and keeps earlier ones', () => {
    const broken: Migration = {
      version: 2,
      name: 'broken',
      // The first statement succeeds; the second fails. Neither may remain.
      sql: 'CREATE TABLE half_done (id INTEGER); INSERT INTO missing_table VALUES (1);',
    };

    let thrown: unknown;
    try {
      migrate(db, [createBooks, broken, createShelves]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MigrationError);
    expect((thrown as MigrationError).migration.version).toBe(2);
    expect((thrown as MigrationError).cause).toBeInstanceOf(Error);
    expect(getSchemaVersion(db)).toBe(1);
    expect(tableNames(db)).toEqual(['book']);
  });

  it('refuses to open a database created by a newer version of the app', () => {
    migrate(db, [createBooks, addAuthor, createShelves]);

    expect(() => migrate(db, [createBooks, addAuthor])).toThrow(DatabaseTooNewError);
    expect(getSchemaVersion(db)).toBe(3);
    expect(tableNames(db)).toEqual(['book', 'shelf']);
  });
});

describe('assertValidMigrations', () => {
  it('accepts an empty list and a contiguous sequence starting at 1', () => {
    expect(() => assertValidMigrations([])).not.toThrow();
    expect(() => assertValidMigrations([createBooks, addAuthor, createShelves])).not.toThrow();
  });

  it.each([
    ['not starting at 1', [addAuthor]],
    ['with a gap', [createBooks, createShelves]],
    ['with a duplicate', [createBooks, createBooks]],
    ['out of order', [addAuthor, createBooks]],
  ])('rejects a list %s', (_label, migrations) => {
    expect(() => assertValidMigrations(migrations)).toThrow(/Invalid migration list/);
  });
});
