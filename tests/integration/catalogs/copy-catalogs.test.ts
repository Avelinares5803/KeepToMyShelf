import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../../../src/core/catalogs/catalogs';
import { CATALOGS } from '../../../src/core/catalogs/catalogs';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import { openDatabase } from '../../../src/main/infrastructure/db/connection';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  return expect.fail('Expected an error');
}

describe('copying catalogs from another profile', () => {
  let fx: ProfileFixture;
  let sourceId: string;
  let targetId: string;
  let token: string;

  const add = (
    catalog: Catalog,
    name: string,
    aliases: string[] = [],
    scope: 'movie' | 'series' | null = null,
  ) => fx.catalogs.create(token, catalog, { name, aliases, scope });
  const find = (catalog: Catalog, name: string) =>
    fx.catalogs.list(token, catalog).find((entry) => entry.name === name);
  const names = (catalog: Catalog) => fx.catalogs.list(token, catalog).map((entry) => entry.name);
  const sourcePath = () => fx.paths.libraryDatabase(sourceId);
  const setSourceVersion = (version: number) => {
    const db = openDatabase(sourcePath());
    db.pragma(`user_version = ${version}`);
    db.close();
  };

  beforeEach(() => {
    fx = createProfileFixture();
    sourceId = fx.profiles.create({ name: 'Ana', language: 'es' }).profile.id;
    targetId = fx.profiles.create({ name: 'Bea', language: 'es' }).profile.id;

    token = fx.sessions.open(sourceId).token;
    const sega = add('company', 'Sega', ['SEGA Enterprises', 'Service Games']);
    add('company', 'Nintendo', ['Nintendo Co.']);
    add('company', 'HIPO');
    add('person', 'Yuji Naka');
    add('screen_genre', 'Miniserie', [], 'series');
    const item = fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title: 'Sonic' });
    fx.sessions
      .require(token)
      .db.prepare("INSERT INTO item_entry (item_id, entry_id, role) VALUES (?, ?, 'developer')")
      .run(item.id, sega.id);

    token = fx.sessions.open(targetId).token;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fx.cleanup();
  });

  it('copies values with their other names and scope, without links to items', () => {
    expect(fx.catalogs.copyFrom(token, sourceId, ['company'])).toEqual({ copied: 3, existing: 0 });

    expect(find('company', 'Sega')).toMatchObject({
      aliases: ['SEGA Enterprises', 'Service Games'],
      scope: null,
      usage: { total: 0 },
    });
    // Found by searching too: the keys were written.
    const keys = fx.sessions
      .require(token)
      .db.prepare("SELECT name_key FROM catalog_entry_alias WHERE name = 'SEGA Enterprises'")
      .pluck()
      .all();
    expect(keys).toEqual(['sega enterprises']);
    // Only the chosen catalogs.
    expect(names('person')).toEqual([]);

    fx.catalogs.copyFrom(token, sourceId, ['screen_genre']);
    expect(find('screen_genre', 'Miniserie')?.scope).toBe('series');
  });

  it('leaves the values with exactly the same name as they were', () => {
    const own = add('company', 'Nintendo', ['Big N']);
    expect(fx.catalogs.copyFrom(token, sourceId, ['company'])).toEqual({ copied: 2, existing: 1 });
    expect(find('company', 'Nintendo')).toEqual(own);
    // A second copy has nothing to add.
    expect(fx.catalogs.copyFrom(token, sourceId, ['company'])).toEqual({ copied: 0, existing: 3 });
  });

  it('copies names that differ in case or accents, or that are another name here', () => {
    add('company', 'Hipó');
    add('company', 'Sega Corporation', ['Sega']);
    fx.catalogs.copyFrom(token, sourceId, ['company']);
    expect(names('company')).toEqual(
      expect.arrayContaining(['Hipó', 'HIPO', 'Sega', 'Sega Corporation']),
    );
  });

  it('copies a catalog named twice only once', () => {
    expect(fx.catalogs.copyFrom(token, sourceId, ['person', 'person'])).toEqual({
      copied: 1,
      existing: 0,
    });
  });

  it('previews every catalog without changing anything', () => {
    add('company', 'Nintendo');
    const preview = fx.catalogs.previewCopy(token, sourceId);
    expect(preview.map((row) => row.catalog)).toEqual([...CATALOGS]);
    const row = (catalog: Catalog) => preview.find((candidate) => candidate.catalog === catalog);
    expect(row('company')).toMatchObject({ added: 2, existing: 1 });
    expect(row('person')).toMatchObject({ added: 1, existing: 0 });
    expect(row('tag')).toMatchObject({ added: 0, existing: 0 });
    expect(row('platform')).toMatchObject({ added: 0, existing: names('platform').length });
    expect(names('company')).toEqual(['Nintendo']);
  });

  it('copies nothing if one value fails', () => {
    fx.sessions.require(token).db.exec(
      `CREATE TEMP TRIGGER fail_on_person BEFORE INSERT ON main.catalog_entry
       WHEN NEW.catalog = 'person' BEGIN SELECT RAISE(ABORT, 'test'); END`,
    );
    expect(() => fx.catalogs.copyFrom(token, sourceId, ['company', 'person'])).toThrow('test');
    expect(names('company')).toEqual([]);
  });

  it('does not change the library it copies from, and it opens normally afterwards', () => {
    const hash = () => createHash('sha256').update(readFileSync(sourcePath())).digest('hex');
    const before = hash();
    fx.catalogs.previewCopy(token, sourceId);
    fx.catalogs.copyFrom(token, sourceId, [...CATALOGS]);
    expect(hash()).toBe(before);

    token = fx.sessions.open(sourceId).token;
    expect(find('company', 'Sega')?.usage.total).toBe(1);
  });

  it('refuses a library with another schema, without migrating it', () => {
    const current = libraryMigrations.length;
    setSourceVersion(current - 1);
    expect(codeOf(() => fx.catalogs.copyFrom(token, sourceId, ['company']))).toBe(
      'catalog.copy_source_outdated',
    );
    expect(codeOf(() => fx.catalogs.previewCopy(token, sourceId))).toBe(
      'catalog.copy_source_outdated',
    );
    setSourceVersion(current + 1);
    expect(codeOf(() => fx.catalogs.copyFrom(token, sourceId, ['company']))).toBe(
      'catalog.copy_source_too_new',
    );
    const db = openDatabase(sourcePath());
    expect(db.pragma('user_version', { simple: true })).toBe(current + 1);
    db.close();
    expect(names('company')).toEqual([]);
  });

  it('reports a damaged library, a missing one and a missing folder', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const copy = () => codeOf(() => fx.catalogs.copyFrom(token, sourceId, ['company']));

    writeFileSync(sourcePath(), 'this is not a database, just some text '.repeat(50));
    expect(copy()).toBe('catalog.copy_unreadable');
    rmSync(sourcePath());
    expect(copy()).toBe('catalog.copy_unreadable');
    expect(() => readFileSync(sourcePath())).toThrow('ENOENT');
    rmSync(fx.paths.profileDir(sourceId), { recursive: true });
    expect(copy()).toBe('catalog.copy_unreadable');
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('refuses the open profile, an unknown one and an old session', () => {
    expect(codeOf(() => fx.catalogs.copyFrom(token, targetId, ['company']))).toBe(
      'catalog.copy_same_profile',
    );
    expect(codeOf(() => fx.catalogs.previewCopy(token, randomUUID()))).toBe('profile.not_found');
    const old = token;
    token = fx.sessions.open(targetId).token;
    expect(codeOf(() => fx.catalogs.copyFrom(old, sourceId, ['company']))).toBe('session.stale');
    expect(codeOf(() => fx.catalogs.previewCopy(old, sourceId))).toBe('session.stale');
  });
});
