import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '../../../src/core/catalogs/catalogs';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import type { ItemRelationsDraft } from '../../../src/core/items/item-relations';
import type { ItemKind } from '../../../src/shared/content';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

describe('ItemService.filterValues', () => {
  let fx: ProfileFixture;
  let token: string;

  const entry = (catalog: Catalog, name: string, aliases: string[] = []) =>
    fx.catalogs.create(token, catalog, { name, aliases, scope: null }).id;
  const existing = (...ids: number[]) => ids.map((id) => ({ kind: 'existing' as const, id }));
  const item = (kind: ItemKind, title: string, relations: ItemRelationsDraft) =>
    fx.items.create(token, kind, { ...EMPTY_ITEM_DRAFT, title, relations });
  const names = (kind: ItemKind, role: 'tag' | 'owned_on' | 'released_on') =>
    fx.items.filterValues(token, kind)[role]?.map((value) => value.name);

  beforeEach(() => {
    fx = createProfileFixture();
    const { profile } = fx.profiles.create({ name: 'Ana' });
    token = fx.sessions.open(profile.id).token;
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('offers nothing for an empty library, even with catalogs full of values', () => {
    expect(fx.items.filterValues(token, 'game')).toEqual({});
  });

  it('offers only the values used by items of that kind', () => {
    const romhack = entry('tag', 'Romhack');
    const oscar = entry('tag', 'Óscar');
    entry('tag', 'Sin usar');
    item('game', 'Juego', { tag: existing(romhack) });
    item('movie', 'Película', { tag: existing(oscar) });

    expect(names('game', 'tag')).toEqual(['Romhack']);
    expect(names('movie', 'tag')).toEqual(['Óscar']);
    expect(names('series', 'tag')).toBeUndefined();
  });

  it('does not count items in the trash, and counts them again when restored', () => {
    const romhack = entry('tag', 'Romhack');
    const { id } = item('game', 'Juego', { tag: existing(romhack) });

    fx.items.moveToTrash(token, id);
    expect(names('game', 'tag')).toBeUndefined();

    fx.items.restore(token, id);
    expect(names('game', 'tag')).toEqual(['Romhack']);
  });

  it('keeps roles with the same catalog apart', () => {
    const pc = entry('platform', 'PC de prueba');
    const switch2 = entry('platform', 'Consola de prueba');
    item('game', 'Juego', { owned_on: existing(pc), released_on: existing(pc, switch2) });

    expect(names('game', 'owned_on')).toEqual(['PC de prueba']);
    expect(names('game', 'released_on')).toEqual(['Consola de prueba', 'PC de prueba']);
  });

  it('lists a value used by several items once, sorted ignoring case and accents', () => {
    const zelda = entry('tag', 'zelda');
    const abaco = entry('tag', 'Ábaco');
    const metroid = entry('tag', 'Metroid');
    item('game', 'Uno', { tag: existing(zelda, abaco) });
    item('game', 'Dos', { tag: existing(zelda, metroid) });

    expect(names('game', 'tag')).toEqual(['Ábaco', 'Metroid', 'zelda']);
  });

  it('includes the other names of each value', () => {
    const drive = entry('platform', 'Mega Drive de prueba', ['Genesis de prueba']);
    item('game', 'Juego', { owned_on: existing(drive) });

    expect(fx.items.filterValues(token, 'game').owned_on).toEqual([
      { id: drive, name: 'Mega Drive de prueba', aliases: ['Genesis de prueba'] },
    ]);
  });

  it('follows renames and deletions in the catalog', () => {
    const tag = entry('tag', 'Romhack');
    item('game', 'Juego', { tag: existing(tag) });

    fx.catalogs.update(token, tag, { name: 'Hack', aliases: [], scope: null });
    expect(names('game', 'tag')).toEqual(['Hack']);

    fx.catalogs.delete(token, tag);
    expect(names('game', 'tag')).toBeUndefined();
  });

  it('answers quickly with 10,000 items and many values', () => {
    const tags = Array.from({ length: 2_000 }, (_, index) => entry('tag', `Etiqueta ${index}`));
    const { db } = fx.sessions.require(token);
    const insertItem = db.prepare(
      `INSERT INTO item (uuid, kind, title, title_norm, created_at, updated_at)
       VALUES (?, 'game', ?, ?, '2026-01-01', '2026-01-01')`,
    );
    const insertEntry = db.prepare(
      "INSERT INTO item_entry (item_id, entry_id, role) VALUES (?, ?, 'tag')",
    );
    db.transaction(() => {
      for (let index = 0; index < 10_000; index += 1) {
        const id = Number(insertItem.run(`u-${index}`, `J ${index}`, `j ${index}`).lastInsertRowid);
        for (let tag = 0; tag < 5; tag += 1) {
          insertEntry.run(id, tags[(index + tag * 37) % tags.length]);
        }
      }
    })();

    const start = performance.now();
    const values = fx.items.filterValues(token, 'game');
    expect(performance.now() - start).toBeLessThan(1_000);
    expect(values.tag).toHaveLength(2_000);
  });
});
