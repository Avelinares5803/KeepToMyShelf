import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { createTempDir } from './temp-dir';

describe('openDatabase', () => {
  let tempDir: ReturnType<typeof createTempDir>;
  let db: SqliteDatabase;

  beforeEach(() => {
    tempDir = createTempDir();
    db = openDatabase(join(tempDir.path, 'biblioteca-ñáü.db'));
  });

  afterEach(() => {
    db.close();
    tempDir.remove();
  });

  it('applies the required connection settings', () => {
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    // 1 = NORMAL
    expect(db.pragma('synchronous', { simple: true })).toBe(1);
  });

  it('enforces foreign keys', () => {
    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent (id));
    `);
    expect(() => db.prepare('INSERT INTO child (parent_id) VALUES (999)').run()).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });
});
