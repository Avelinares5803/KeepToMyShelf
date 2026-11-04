import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '../../../src/core/catalogs/catalogs';
import { knownUsageDate, UNKNOWN_USAGE_DATE } from '../../../src/core/dates/usage-period';
import { ValidationError } from '../../../src/core/errors';
import type { FilterCondition, FilterNode } from '../../../src/core/filters/filter-tree';
import type { ItemSortField, SortDirection } from '../../../src/core/filters/item-sort';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { ItemRelationsDraft } from '../../../src/core/items/item-relations';
import { buildItemListQuery } from '../../../src/main/infrastructure/db/item-query';
import { ipcInputSchemas } from '../../../src/shared/ipc-schemas';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const is = (field: string, value: FilterCondition['value']): FilterCondition => ({
  type: 'condition',
  field,
  operator: 'is',
  value,
});
const isNot = (field: string, value: FilterCondition['value']): FilterCondition => ({
  type: 'condition',
  field,
  operator: 'isNot',
  value,
});
const and = (...children: FilterNode[]): FilterNode => ({ type: 'group', op: 'and', children });
const or = (...children: FilterNode[]): FilterNode => ({ type: 'group', op: 'or', children });
const rating = (operator: 'gte' | 'lte' | 'isEmpty', value: number | null): FilterNode => ({
  type: 'condition',
  field: 'rating',
  operator,
  value,
});

describe('ItemService.list', () => {
  let fx: ProfileFixture;
  let token: string;

  const entry = (catalog: Catalog, name: string) =>
    fx.catalogs.create(token, catalog, { name, aliases: [], scope: null }).id;
  const related = (ids: number[]) => ids.map((id) => ({ kind: 'existing' as const, id }));
  const game = (title: string, overrides: Partial<ItemDraft> = {}) =>
    fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title, ...overrides });
  const withRelations = (relations: ItemRelationsDraft) => ({ relations });

  const titles = (options: Parameters<ProfileFixture['items']['list']>[2] = {}) =>
    fx.items.list(token, 'game', options).map((item) => item.title ?? `#${item.placeholderNumber}`);
  const filtered = (filter: FilterNode) => titles({ filter });
  const searched = (text: string, untitledLabel = 'Sin nombre') =>
    titles({ search: { text, untitledLabel } });
  const sorted = (field: ItemSortField, direction: SortDirection) =>
    titles({ sort: { field, direction } });

  beforeEach(() => {
    fx = createProfileFixture();
    const { profile } = fx.profiles.create({ name: 'Ana' });
    token = fx.sessions.open(profile.id).token;
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('without options', () => {
    it('lists the kind in title order, untitled items last, without the trash', () => {
      game('zelda');
      game('Ábaco');
      game('');
      const trashed = game('Basura');
      fx.items.create(token, 'movie', { ...EMPTY_ITEM_DRAFT, title: 'Película' });
      fx.items.moveToTrash(token, trashed.id);

      expect(titles()).toEqual(['Ábaco', 'zelda', '#1']);
    });
  });

  describe('search', () => {
    it('finds parts of a title, ignoring case and accents', () => {
      game('Pokémon Rojo');
      game('Zelda');

      expect(searched('POKEMON')).toEqual(['Pokémon Rojo']);
      expect(searched('kémon r')).toEqual(['Pokémon Rojo']);
    });

    it('finds alternate titles', () => {
      game('Chrono Trigger', { alternateTitles: ['クロノ・トリガー', 'Crono'] });
      game('Zelda');

      expect(searched('crono')).toEqual(['Chrono Trigger']);
      expect(searched('トリガー')).toEqual(['Chrono Trigger']);
    });

    it('treats wildcards as plain text', () => {
      game('100% Orange Juice');
      game('1000 Soldados');
      game('Snake_Pass');
      game('SnakeXPass');
      game('Back\\slash');

      expect(searched('100%')).toEqual(['100% Orange Juice']);
      expect(searched('e_p')).toEqual(['Snake_Pass']);
      expect(searched('k\\s')).toEqual(['Back\\slash']);
    });

    it('treats quotes as plain text', () => {
      game("Assassin's Creed");
      game('Zelda');

      expect(searched("'; DROP TABLE item; --")).toEqual([]);
      expect(searched("assassin's")).toEqual(["Assassin's Creed"]);
      expect(titles()).toHaveLength(2);
    });

    it('finds untitled items by the name they show in the UI language', () => {
      game('');
      game('');
      game('Zelda');

      expect(searched('sin nombre')).toEqual(['#1', '#2']);
      expect(searched('sin nombre 2')).toEqual(['#2']);
      expect(searched('untitled', 'Untitled')).toEqual(['#1', '#2']);
      expect(searched('untitled', 'Sin nombre')).toEqual([]);
    });

    it('ignores a search with nothing in it', () => {
      game('Zelda');
      expect(searched('   ')).toEqual(['Zelda']);
    });

    it('never shows the trash', () => {
      const trashed = game('Zelda');
      fx.items.moveToTrash(token, trashed.id);
      expect(searched('zelda')).toEqual([]);
    });
  });

  describe('filters on catalog values', () => {
    let rpg: number;
    let action: number;
    let pc: number;

    beforeEach(() => {
      rpg = entry('game_genre', 'RPG de prueba');
      action = entry('game_genre', 'Acción de prueba');
      pc = entry('platform', 'PC de prueba');
      game('Solo RPG', withRelations({ genre: related([rpg]) }));
      game('Solo acción', withRelations({ genre: related([action]) }));
      game('RPG y acción', withRelations({ genre: related([rpg, action]) }));
      game('RPG en PC', withRelations({ genre: related([rpg]), owned_on: related([pc]) }));
      game('Sin género');
    });

    it('combines rules with AND: the item must have both values', () => {
      expect(filtered(and(is('genre', rpg), is('genre', action)))).toEqual(['RPG y acción']);
      expect(filtered(and(is('genre', rpg), is('owned_on', pc)))).toEqual(['RPG en PC']);
    });

    it('combines rules with OR: any of the values is enough', () => {
      expect(filtered(or(is('genre', rpg), is('genre', action)))).toEqual([
        'RPG en PC',
        'RPG y acción',
        'Solo acción',
        'Solo RPG',
      ]);
    });

    it('nests groups', () => {
      expect(filtered(and(or(is('genre', rpg), is('genre', action)), is('owned_on', pc)))).toEqual([
        'RPG en PC',
      ]);
    });

    it('excludes a value, keeping the items that have no values at all', () => {
      expect(filtered(isNot('genre', rpg))).toEqual(['Sin género', 'Solo acción']);
    });

    it('tells apart the roles that use the same catalog', () => {
      game('Solo publicado', withRelations({ released_on: related([pc]) }));

      expect(filtered(is('owned_on', pc))).toEqual(['RPG en PC']);
      expect(filtered(is('released_on', pc))).toEqual(['Solo publicado']);
    });

    it('finds nothing for a value that no longer exists', () => {
      fx.catalogs.delete(token, pc);
      expect(filtered(is('owned_on', pc))).toEqual([]);
    });

    it('combines with the search', () => {
      expect(
        titles({ search: { text: 'solo', untitledLabel: 'Sin nombre' }, filter: is('genre', rpg) }),
      ).toEqual(['Solo RPG']);
    });
  });

  describe('filters on the item', () => {
    it('filters by status, keeping items without one when excluding', () => {
      game('Terminado', { status: 'completed' });
      game('En curso', { status: 'in_progress' });
      game('Sin estado');

      expect(filtered(is('status', 'completed'))).toEqual(['Terminado']);
      expect(filtered(isNot('status', 'completed'))).toEqual(['En curso', 'Sin estado']);
    });

    it('filters by yes/no fields', () => {
      game('Favorito', { isFavorite: true });
      game('Rejugado', { isReplay: true });

      expect(filtered(is('favorite', true))).toEqual(['Favorito']);
      expect(filtered(is('favorite', false))).toEqual(['Rejugado']);
      expect(filtered(is('replay', true))).toEqual(['Rejugado']);
    });

    it('counts "both" as physical and as digital', () => {
      game('Físico', { ownsPhysical: true });
      game('Digital', { ownsDigital: true });
      game('Ambos', { ownsPhysical: true, ownsDigital: true });
      game('Ninguno');

      expect(filtered(is('format', 'physical'))).toEqual(['Ambos', 'Físico']);
      expect(filtered(is('format', 'digital'))).toEqual(['Ambos', 'Digital']);
      expect(filtered(isNot('format', 'physical'))).toEqual(['Digital', 'Ninguno']);
    });

    it('filters by rating, leaving out items not rated unless asked for', () => {
      game('Cuatro', { rating: 8 });
      game('Dos', { rating: 4 });
      game('Sin valorar');

      expect(filtered(rating('gte', 8))).toEqual(['Cuatro']);
      expect(filtered(rating('lte', 4))).toEqual(['Dos']);
      expect(filtered(rating('isEmpty', null))).toEqual(['Sin valorar']);
    });

    it('applies the examples of the specification', () => {
      const romhack = entry('tag', 'Romhack');
      game('Sí', { status: 'completed', ...withRelations({ tag: related([romhack]) }) });
      game('Sin etiqueta', { status: 'completed' });
      game('Sin terminar', withRelations({ tag: related([romhack]) }));

      expect(filtered(and(is('status', 'completed'), is('tag', romhack)))).toEqual(['Sí']);
    });

    it('treats a filter without rules as no filter', () => {
      game('Zelda');
      expect(filtered(and(or()))).toEqual(['Zelda']);
    });

    it('rejects a field that the kind does not have', () => {
      expect(() => filtered(is('actor', 1))).toThrow(ValidationError);
    });
  });

  describe('sorting', () => {
    it('sorts by title both ways, always with untitled items last', () => {
      game('');
      game('Ábaco');
      game('zelda');
      game('');

      expect(sorted('title', 'asc')).toEqual(['Ábaco', 'zelda', '#1', '#2']);
      expect(sorted('title', 'desc')).toEqual(['zelda', 'Ábaco', '#1', '#2']);
    });

    it('sorts by date added', () => {
      game('Primero');
      game('Segundo');

      expect(sorted('createdAt', 'asc')).toEqual(['Primero', 'Segundo']);
      expect(sorted('createdAt', 'desc')).toEqual(['Segundo', 'Primero']);
    });

    it('sorts by rating, always with items not rated last and ties by title', () => {
      game('Sin valorar');
      game('Baja', { rating: 2 });
      game('Alta B', { rating: 9 });
      game('Alta A', { rating: 9 });

      expect(sorted('rating', 'desc')).toEqual(['Alta A', 'Alta B', 'Baja', 'Sin valorar']);
      expect(sorted('rating', 'asc')).toEqual(['Baja', 'Alta A', 'Alta B', 'Sin valorar']);
    });

    it('sorts by the earliest release date', () => {
      game('Sin fecha');
      game('De 1995', {
        releases: [
          { region: null, date: { year: 2020 } },
          { region: null, date: { year: 1995 } },
        ],
      });
      game('De 2001', { releases: [{ region: null, date: { year: 2001, month: 3 } }] });

      expect(sorted('releaseDate', 'asc')).toEqual(['De 1995', 'De 2001', 'Sin fecha']);
      expect(sorted('releaseDate', 'desc')).toEqual(['De 2001', 'De 1995', 'Sin fecha']);
    });

    it('sorts by usage dates, always with unknown and missing dates last', () => {
      game('Sin fecha');
      game('Indeterminada', { startedOn: UNKNOWN_USAGE_DATE, finishedOn: UNKNOWN_USAGE_DATE });
      game('2001', {
        startedOn: knownUsageDate({ year: 2001 }),
        finishedOn: knownUsageDate({ year: 2010 }),
      });
      game('2005', {
        startedOn: knownUsageDate({ year: 2005, month: 2 }),
        finishedOn: knownUsageDate({ year: 2006 }),
      });

      const last = ['Indeterminada', 'Sin fecha'];
      expect(sorted('startedOn', 'asc')).toEqual(['2001', '2005', ...last]);
      expect(sorted('startedOn', 'desc')).toEqual(['2005', '2001', ...last]);
      expect(sorted('finishedOn', 'asc')).toEqual(['2005', '2001', ...last]);
      expect(sorted('finishedOn', 'desc')).toEqual(['2001', '2005', ...last]);
    });
  });

  describe('the query', () => {
    it('sends every value as a parameter, never inside the SQL', () => {
      const text = 'zzsearchzz';
      const query = buildItemListQuery('game', {
        search: { text, untitledLabel: 'ZZLABELZZ' },
        filter: and(is('status', 'completed'), is('genre', 987654)),
        sort: { field: 'rating', direction: 'desc' },
      });

      expect(query.sql).not.toMatch(/zzsearchzz|zzlabelzz|completed|987654/i);
      expect(query.parameters).toEqual(
        expect.arrayContaining(['%zzsearchzz%', 'zzlabelzz ', 'completed', 987654]),
      );
    });
  });

  describe('IPC input', () => {
    const baseInput = {
      token: '4f8a2a1e-3c55-4b7e-9a10-0d6c7f1b2e3a',
      kind: 'game',
    };

    it('accepts a nested filter, a search and a sort', () => {
      const input = {
        ...baseInput,
        search: { text: 'zelda', untitledLabel: 'Sin nombre' },
        filter: and(or(is('genre', 1), is('genre', 2)), is('favorite', true)),
        sort: { field: 'rating', direction: 'desc' },
      };
      expect(ipcInputSchemas.listItems.parse(input)).toEqual(input);
    });

    it('rejects malformed filters and unknown sorts', () => {
      const parse = (extra: object) =>
        ipcInputSchemas.listItems.safeParse({ ...baseInput, ...extra }).success;

      expect(parse({ filter: { type: 'group', op: 'xor', children: [] } })).toBe(false);
      expect(
        parse({ filter: { type: 'condition', field: 'genre', operator: 'like', value: 1 } }),
      ).toBe(false);
      expect(parse({ sort: { field: 'item.title; DROP TABLE item', direction: 'asc' } })).toBe(
        false,
      );
    });
  });

  describe('a library of 10,000 items', () => {
    const LIMIT_MS = 1_000;

    it('answers within limits, whatever is asked', () => {
      const tags = Array.from({ length: 20 }, (_, index) => entry('tag', `Etiqueta ${index}`));
      const { db } = fx.sessions.require(token);
      const insertItem = db.prepare(
        `INSERT INTO item (uuid, kind, title, title_norm, rating, created_at, updated_at)
         VALUES (?, 'game', ?, ?, ?, '2026-01-01', '2026-01-01')`,
      );
      const insertEntry = db.prepare(
        "INSERT INTO item_entry (item_id, entry_id, role) VALUES (?, ?, 'tag')",
      );
      const insertRelease = db.prepare('INSERT INTO item_release (item_id, date) VALUES (?, ?)');
      db.transaction(() => {
        for (let index = 0; index < 10_000; index += 1) {
          const title = `Juego ${index}`;
          const id = Number(
            insertItem.run(`uuid-${index}`, title, title.toLowerCase(), (index % 10) + 1)
              .lastInsertRowid,
          );
          insertEntry.run(id, tags[index % tags.length]);
          insertEntry.run(id, tags[(index + 7) % tags.length]);
          insertRelease.run(id, String(1980 + (index % 45)));
        }
      })();

      const timed = (options: Parameters<ProfileFixture['items']['list']>[2]) => {
        const start = performance.now();
        const result = fx.items.list(token, 'game', options);
        return { count: result.length, elapsed: performance.now() - start };
      };

      const everything = timed({});
      const search = timed({ search: { text: 'juego 99', untitledLabel: 'Sin nombre' } });
      const filter = timed({
        filter: and(or(is('tag', tags[0]!), is('tag', tags[1]!)), rating('gte', 5)),
        sort: { field: 'releaseDate', direction: 'desc' },
      });

      expect(everything.count).toBe(10_000);
      expect(search.count).toBe(111);
      expect(filter.count).toBeGreaterThan(0);
      for (const { elapsed } of [everything, search, filter]) {
        expect(elapsed).toBeLessThan(LIMIT_MS);
      }

      // The related tables are read through their indexes, item by item.
      const query = buildItemListQuery('game', {
        filter: is('tag', tags[0]!),
        sort: { field: 'releaseDate', direction: 'asc' },
      });
      const plan = (
        db.prepare(`EXPLAIN QUERY PLAN ${query.sql}`).all(...query.parameters) as {
          detail: string;
        }[]
      ).map((step) => step.detail);
      expect(plan).toContainEqual(expect.stringMatching(/SEARCH item_entry .*USING .*INDEX/));
      expect(plan).toContainEqual(expect.stringMatching(/SEARCH item_release USING .*INDEX/));
    });
  });
});
