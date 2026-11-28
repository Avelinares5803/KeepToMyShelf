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
const isEmpty = (field: string): FilterCondition => ({
  type: 'condition',
  field,
  operator: 'isEmpty',
  value: null,
});
const and = (...children: FilterNode[]): FilterNode => ({ type: 'group', op: 'and', children });
const or = (...children: FilterNode[]): FilterNode => ({ type: 'group', op: 'or', children });
const rating = (operator: 'gte' | 'lte' | 'isEmpty', value: number | null): FilterNode => ({
  type: 'condition',
  field: 'rating',
  operator,
  value,
});

const number = (
  field: 'releaseYear' | 'finishedYear' | 'hoursPlayed' | 'seasons',
  operator: 'gte' | 'lte' | 'isEmpty',
  value: number | null,
): FilterNode => ({ type: 'condition', field, operator, value });

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

  describe('filters on collections', () => {
    let favorites: number;
    let pending: number;

    beforeEach(() => {
      favorites = fx.collections.create(token, { name: 'Favoritos' }).id;
      pending = fx.collections.create(token, { name: 'Pendientes' }).id;
      const inBoth = game('En las dos').id;
      const favorite = game('Solo favorito').id;
      const pendingOnly = game('Solo pendiente').id;
      game('En ninguna');
      const movie = fx.items.create(token, 'movie', { ...EMPTY_ITEM_DRAFT, title: 'Película' }).id;
      fx.collections.changeMemberships(token, {
        add: [
          { collectionId: favorites, itemId: inBoth },
          { collectionId: pending, itemId: inBoth },
          { collectionId: favorites, itemId: favorite },
          { collectionId: pending, itemId: pendingOnly },
          { collectionId: favorites, itemId: movie },
        ],
        remove: [],
      });
    });

    it('finds the items of a collection, only of the kind listed', () => {
      expect(filtered(is('collection', favorites))).toEqual(['En las dos', 'Solo favorito']);
    });

    it('combines collections with AND and OR', () => {
      expect(filtered(and(is('collection', favorites), is('collection', pending)))).toEqual([
        'En las dos',
      ]);
      expect(filtered(or(is('collection', favorites), is('collection', pending)))).toEqual([
        'En las dos',
        'Solo favorito',
        'Solo pendiente',
      ]);
    });

    it('excludes a collection, keeping the items in none', () => {
      expect(filtered(isNot('collection', favorites))).toEqual(['En ninguna', 'Solo pendiente']);
    });

    it('finds nothing for a collection that no longer exists', () => {
      fx.collections.delete(token, favorites);
      expect(filtered(is('collection', favorites))).toEqual([]);
    });

    it('rejects a value that is not a collection id', () => {
      expect(() => filtered(is('collection', 'Favoritos'))).toThrow(ValidationError);
      expect(() => filtered(is('collection', 0))).toThrow(ValidationError);
      expect(() => filtered({ ...is('collection', favorites), operator: 'gte' })).toThrow(
        ValidationError,
      );
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

    it('finds the items without a status, the same that the statistics count', () => {
      game('Terminado', { status: 'completed' });
      game('Sin estado');
      game('Tampoco');

      expect(filtered(isEmpty('status'))).toEqual(['Sin estado', 'Tampoco']);
      expect(filtered(or(is('status', 'completed'), isEmpty('status')))).toEqual([
        'Sin estado',
        'Tampoco',
        'Terminado',
      ]);
      expect(fx.stats.get(token, 'game').statuses.none).toBe(2);
      expect(() => filtered({ ...isEmpty('status'), value: 'completed' })).toThrow(ValidationError);
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

    it('filters by the year of the earliest release, whatever its precision', () => {
      const year = (value: number, month?: number) => ({
        region: null,
        date: month === undefined ? { year: value } : { year: value, month },
      });
      game('De 1995', { releases: [year(1995, 12)] });
      game('De 1998 y 2005', { releases: [year(2005), year(1998, 3)] });
      game('De 2001', { releases: [year(2001)] });
      game('Sin fecha');

      expect(filtered(number('releaseYear', 'gte', 1998))).toEqual(['De 1998 y 2005', 'De 2001']);
      expect(filtered(number('releaseYear', 'lte', 1998))).toEqual(['De 1995', 'De 1998 y 2005']);
      // Its 2005 release does not count: the year is that of the earliest one.
      expect(
        filtered(and(number('releaseYear', 'gte', 2003), number('releaseYear', 'lte', 2010))),
      ).toEqual([]);
      expect(filtered(number('releaseYear', 'isEmpty', null))).toEqual(['Sin fecha']);
    });

    it('filters by the year of the end date, without the empty or unknown ones', () => {
      const finished = (title: string, finishedOn: ItemDraft['finishedOn']) =>
        game(title, { status: 'completed', finishedOn });
      finished('Fin 2023', knownUsageDate({ year: 2023 }));
      finished('Fin marzo 2024', knownUsageDate({ year: 2024, month: 3 }));
      finished('Fin 14-12-2024', knownUsageDate({ year: 2024, month: 12, day: 14 }));
      finished('Fin indeterminado', UNKNOWN_USAGE_DATE);
      finished('Sin fin', null);
      game('En curso 2024', {
        status: 'in_progress',
        finishedOn: knownUsageDate({ year: 2024 }),
      });

      expect(filtered(number('finishedYear', 'gte', 2024))).toEqual([
        'En curso 2024',
        'Fin 14-12-2024',
        'Fin marzo 2024',
      ]);
      expect(filtered(number('finishedYear', 'lte', 2023))).toEqual(['Fin 2023']);
      expect(filtered(number('finishedYear', 'isEmpty', null))).toEqual([
        'Fin indeterminado',
        'Sin fin',
      ]);

      // "Finished in 2024" in the statistics is the status "Completed" and the end year 2024.
      const finishedIn2024 = and(
        is('status', 'completed'),
        number('finishedYear', 'gte', 2024),
        number('finishedYear', 'lte', 2024),
      );
      expect(filtered(finishedIn2024)).toEqual(['Fin 14-12-2024', 'Fin marzo 2024']);
      const stats = fx.stats.get(token, 'game');
      expect(stats.finishedByYear).toEqual([
        { year: 2024, count: 2 },
        { year: 2023, count: 1 },
      ]);
      expect(
        filtered(and(is('status', 'completed'), number('finishedYear', 'isEmpty', null))),
      ).toHaveLength(stats.finishedWithoutDate);
    });

    it('filters by whole hours played, compared with the minutes', () => {
      game('Diez horas', { minutesPlayed: 600 });
      game('Diez y media', { minutesPlayed: 630 });
      game('Nada', { minutesPlayed: 0 });
      game('Sin horas');

      expect(filtered(number('hoursPlayed', 'lte', 10))).toEqual(['Diez horas', 'Nada']);
      expect(filtered(number('hoursPlayed', 'lte', 11))).toEqual([
        'Diez horas',
        'Diez y media',
        'Nada',
      ]);
      expect(filtered(number('hoursPlayed', 'gte', 10))).toEqual(['Diez horas', 'Diez y media']);
      expect(filtered(number('hoursPlayed', 'isEmpty', null))).toEqual(['Sin horas']);
    });

    it('filters series by seasons, with or without their details', () => {
      const series = (title: string, seasonsCount: number | null, episodesCount: number | null) =>
        fx.items.create(token, 'series', {
          ...EMPTY_ITEM_DRAFT,
          title,
          seasonsCount,
          episodesCount,
        });
      series('Una', 1, null);
      series('Cinco', 5, 50);
      series('Solo capítulos', null, 12);
      series('Sin nada', null, null);
      const seasons = (operator: 'gte' | 'lte' | 'isEmpty', value: number | null) =>
        fx.items
          .list(token, 'series', { filter: number('seasons', operator, value) })
          .map((item) => item.title);

      expect(seasons('gte', 2)).toEqual(['Cinco']);
      expect(seasons('lte', 5)).toEqual(['Cinco', 'Una']);
      expect(seasons('isEmpty', null)).toEqual(['Sin nada', 'Solo capítulos']);
    });

    it('rejects numbers out of range and fields of another kind', () => {
      expect(() => filtered(number('releaseYear', 'gte', 0))).toThrow(ValidationError);
      expect(() => filtered(number('releaseYear', 'gte', 1999.5))).toThrow(ValidationError);
      expect(() => filtered(number('hoursPlayed', 'gte', -1))).toThrow(ValidationError);
      expect(() => filtered(number('seasons', 'gte', 1))).toThrow(ValidationError);
      expect(() =>
        fx.items.list(token, 'movie', { filter: number('hoursPlayed', 'gte', 1) }),
      ).toThrow(ValidationError);
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

    it('sorts the numbers in titles by value, and ties by the plain text', () => {
      game('Final Fantasy 10');
      game('Agent 7');
      game('Final Fantasy 2');
      game('Agent 007');
      game('Final Fantasy');

      const natural = [
        'Agent 007',
        'Agent 7',
        'Final Fantasy',
        'Final Fantasy 2',
        'Final Fantasy 10',
      ];
      expect(sorted('title', 'asc')).toEqual(natural);
      expect(sorted('title', 'desc')).toEqual([
        'Final Fantasy 10',
        'Final Fantasy 2',
        'Final Fantasy',
        'Agent 007',
        'Agent 7',
      ]);
    });

    it('breaks ties of other criteria by title with numbers by value', () => {
      game('Halo 10', { rating: 8 });
      game('Halo 2', { rating: 8 });

      expect(sorted('rating', 'desc')).toEqual(['Halo 2', 'Halo 10']);
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

    it('cannot sort a library by the date added to a collection', () => {
      game('Zelda');
      expect(() => sorted('addedToCollection', 'desc')).toThrow(/needs a collection/);
    });
  });

  describe('the query', () => {
    it('sends every value as a parameter, never inside the SQL', () => {
      const text = 'zzsearchzz';
      const query = buildItemListQuery('game', {
        search: { text, untitledLabel: 'ZZLABELZZ' },
        filter: and(
          is('status', 'completed'),
          is('genre', 987654),
          number('hoursPlayed', 'gte', 4321),
        ),
        sort: { field: 'rating', direction: 'desc' },
      });

      expect(query.sql).not.toMatch(/zzsearchzz|zzlabelzz|completed|987654|259260/i);
      expect(query.parameters).toEqual(
        expect.arrayContaining(['%zzsearchzz%', 'zzlabelzz ', 'completed', 987654, 259_260]),
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
      // Only a collection knows when each item was added to it.
      expect(parse({ sort: { field: 'addedToCollection', direction: 'asc' } })).toBe(false);
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
      const years = timed({
        filter: and(number('releaseYear', 'gte', 1990), number('releaseYear', 'lte', 1999)),
      });

      expect(everything.count).toBe(10_000);
      expect(search.count).toBe(111);
      expect(filter.count).toBeGreaterThan(0);
      // 1980 + index % 45: 10 years of 45, and 10,000 = 222 rounds of 45 plus 10 (1980..1989).
      expect(years.count).toBe(2_220);
      for (const { elapsed } of [everything, search, filter, years]) {
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
