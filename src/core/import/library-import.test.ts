import { describe, expect, it } from 'vitest';
import type { ItemKind } from '../../shared/content';
import type {
  ExportedCatalogEntry,
  ExportedCollection,
  ExportedItem,
  ExportedLibrary,
} from '../../shared/exports';
import type { GenreScope } from '../catalogs/catalogs';
import { collectionNameKey } from '../collections/collection-name';
import { AppError } from '../errors';
import {
  catalogEntryKey,
  InvalidImportItemError,
  planLibraryImport,
  type ExistingLibrary,
} from './library-import';

let nextUuid = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++nextUuid).padStart(12, '0')}`;
const MOMENT = '2026-11-20T10:00:00.000Z';

function item(overrides: Partial<ExportedItem> = {}): ExportedItem {
  return {
    uuid: uuid(),
    kind: 'game',
    title: 'Okami',
    placeholderNumber: null,
    alternateTitles: [],
    description: null,
    notes: null,
    isFavorite: false,
    rating: null,
    status: null,
    isReplay: false,
    ownsPhysical: false,
    ownsDigital: false,
    startedOn: null,
    finishedOn: null,
    minutesPlayed: null,
    seasonsCount: null,
    episodesCount: null,
    relations: {},
    releases: [],
    createdAt: MOMENT,
    updatedAt: MOMENT,
    deletedAt: null,
    ...overrides,
  };
}

function library(parts: Partial<ExportedLibrary> = {}): ExportedLibrary {
  return { catalogs: [], items: [], collections: [], ...parts };
}

function collection(overrides: Partial<ExportedCollection> = {}): ExportedCollection {
  return {
    uuid: uuid(),
    name: 'Favoritas',
    createdAt: MOMENT,
    updatedAt: MOMENT,
    items: [],
    ...overrides,
  };
}

function existing(
  parts: {
    itemUuids?: string[];
    placeholders?: Partial<Record<ItemKind, number[]>>;
    entries?: [ExportedCatalogEntry['catalog'], string, GenreScope | null][];
    collections?: [string, string[]][];
    collectionNames?: string[];
  } = {},
): ExistingLibrary {
  return {
    itemUuids: new Set(parts.itemUuids),
    placeholders: {
      game: new Set(parts.placeholders?.game),
      movie: new Set(parts.placeholders?.movie),
      series: new Set(parts.placeholders?.series),
    },
    catalogEntries: new Map(
      (parts.entries ?? []).map(([catalog, name, scope]) => [
        catalogEntryKey(catalog, name),
        scope,
      ]),
    ),
    collections: new Map((parts.collections ?? []).map(([id, members]) => [id, new Set(members)])),
    collectionsByNameKey: new Map(
      (parts.collectionNames ?? []).map((name) => [collectionNameKey(name), uuid()]),
    ),
  };
}

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return expect.fail('Expected an error');
}

describe('planLibraryImport', () => {
  it('leaves out the items whose UUID exists, also in the trash', () => {
    const kept = item({ title: 'Nuevo' });
    const known = item({ title: 'Ya está' });

    const plan = planLibraryImport(
      library({ items: [known, kept] }),
      existing({ itemUuids: [known.uuid] }),
    );

    expect(plan.items.map(({ uuid }) => uuid)).toEqual([kept.uuid]);
    expect(plan.counts).toMatchObject({ items: 1, existingItems: 1 });
  });

  it('keeps the dates and the trash of each item', () => {
    const trashed = item({
      createdAt: MOMENT,
      updatedAt: MOMENT,
      deletedAt: '2026-11-21T09:00:00.000Z',
    });

    const plan = planLibraryImport(library({ items: [trashed] }), existing());

    expect(plan.items[0]).toMatchObject({
      createdAt: MOMENT,
      updatedAt: MOMENT,
      deletedAt: '2026-11-21T09:00:00.000Z',
    });
    expect(plan.counts.itemsInTrash).toBe(1);
  });

  it('keeps an untitled number when it is free, and gives the lowest free one otherwise', () => {
    const taken = item({ title: null, placeholderNumber: 1 });
    const free = item({ title: null, placeholderNumber: 2 });
    const movie = item({ kind: 'movie', title: null, placeholderNumber: 1 });

    const plan = planLibraryImport(
      library({ items: [taken, free, movie] }),
      existing({ placeholders: { game: [1] } }),
    );

    // The free number is kept first, so the other one cannot take it.
    expect(plan.items.map(({ placeholderNumber }) => placeholderNumber)).toEqual([3, 2, 1]);
  });

  it('gives no number to an item with a title', () => {
    const plan = planLibraryImport(
      library({ items: [item({ title: 'Okami', placeholderNumber: 4 })] }),
      existing(),
    );
    expect(plan.items[0]!.placeholderNumber).toBeNull();
  });

  it('gives a number to a title that is only blank', () => {
    const plan = planLibraryImport(library({ items: [item({ title: '   ' })] }), existing());
    expect(plan.items[0]).toMatchObject({ placeholderNumber: 1, draft: { title: null } });
  });

  it('adds only the catalog values that do not exist with exactly that name', () => {
    const plan = planLibraryImport(
      library({
        catalogs: [
          { catalog: 'tag', name: 'Arte', aliases: ['Art'], scope: null },
          { catalog: 'tag', name: 'arte', aliases: [], scope: null },
          { catalog: 'platform', name: 'Arte', aliases: [], scope: null },
        ],
      }),
      existing({ entries: [['tag', 'Arte', null]] }),
    );

    expect(plan.catalogEntries).toEqual([
      { catalog: 'tag', name: 'arte', aliases: [], scope: null },
      { catalog: 'platform', name: 'Arte', aliases: [], scope: null },
    ]);
    expect(plan.counts.catalogValues).toBe(2);
  });

  it('cleans the names like typed ones and keeps the first of two equal ones', () => {
    const plan = planLibraryImport(
      library({
        catalogs: [
          { catalog: 'tag', name: '  Arte  ', aliases: ['Arte', ' Art ', 'Art'], scope: null },
          { catalog: 'tag', name: 'Arte', aliases: ['Otro'], scope: null },
        ],
      }),
      existing(),
    );
    expect(plan.catalogEntries).toEqual([
      { catalog: 'tag', name: 'Arte', aliases: ['Art'], scope: null },
    ]);
  });

  it('creates the values an item uses that the file does not list', () => {
    const plan = planLibraryImport(
      library({
        items: [
          item({
            relations: { tag: ['Arte'], owned_on: ['PS2'] },
            releases: [{ region: 'Japón', date: '2006' }],
          }),
        ],
      }),
      existing({ entries: [['platform', 'PS2', null]] }),
    );
    expect(plan.catalogEntries).toEqual([
      { catalog: 'tag', name: 'Arte', aliases: [], scope: null },
      { catalog: 'region', name: 'Japón', aliases: [], scope: null },
    ]);
  });

  it('widens a genre of the profile limited to the other kind', () => {
    const series = item({ kind: 'series', relations: { genre: ['Drama', 'Comedia'] } });

    const plan = planLibraryImport(
      library({ items: [series] }),
      existing({
        entries: [
          ['screen_genre', 'Drama', 'movie'],
          ['screen_genre', 'Comedia', 'series'],
        ],
      }),
    );

    expect(plan.widenedGenres).toEqual(['Drama']);
    expect(plan.counts.widenedGenres).toBe(1);
  });

  it('gives a new genre both kinds when the file limits it to the other one', () => {
    const plan = planLibraryImport(
      library({
        catalogs: [{ catalog: 'screen_genre', name: 'Drama', aliases: [], scope: 'movie' }],
        items: [item({ kind: 'series', relations: { genre: ['Drama'] } })],
      }),
      existing(),
    );
    expect(plan.catalogEntries).toEqual([
      { catalog: 'screen_genre', name: 'Drama', aliases: [], scope: null },
    ]);
    expect(plan.counts.widenedGenres).toBe(0);
  });

  it('names the first invalid item to add, by its position', () => {
    const known = item({ title: 'x'.repeat(301) });
    const error = thrown(() =>
      planLibraryImport(
        library({
          items: [known, item(), item({ title: 'Mala', startedOn: '2021-13' })],
        }),
        existing({ itemUuids: [known.uuid] }),
      ),
    );

    expect(error).toBeInstanceOf(InvalidImportItemError);
    expect(error).toMatchObject({ code: 'date.invalid_month', position: 3, title: 'Mala' });
  });

  it.each([
    [{ rating: 11 }, 'item.invalid_rating'],
    [{ kind: 'movie' as const, minutesPlayed: 10 }, 'item.hours_only_for_games'],
    [{ relations: { actor: ['Ana'] } }, 'item.role_not_allowed'],
    [{ releases: [{ region: null, date: '20' }] }, 'date.invalid_format'],
    [{ startedOn: '2022', finishedOn: '2021' }, 'date.end_before_start'],
  ])('refuses an item that breaks a rule of the form: %j', (overrides, code) => {
    expect(
      thrown(() => planLibraryImport(library({ items: [item(overrides)] }), existing())),
    ).toMatchObject({
      code,
    });
  });

  it.each([
    [
      'an item twice',
      () => {
        const twice = item();
        return library({ items: [twice, { ...twice, title: 'Otro' }] });
      },
    ],
    [
      'a collection twice',
      () => {
        const twice = collection();
        return library({ collections: [twice, twice] });
      },
    ],
    [
      'an empty catalog value',
      () => library({ catalogs: [{ catalog: 'tag', name: ' ', aliases: [], scope: null }] }),
    ],
    [
      'a scope outside the movie and series genres',
      () => library({ catalogs: [{ catalog: 'tag', name: 'Arte', aliases: [], scope: 'movie' }] }),
    ],
    ['an empty collection name', () => library({ collections: [collection({ name: '' })] })],
  ])('refuses a file with %s', (_, file) => {
    expect(thrown(() => planLibraryImport(file(), existing()))).toMatchObject({
      code: 'import.invalid_file',
    });
    expect(thrown(() => planLibraryImport(file(), existing()))).toBeInstanceOf(AppError);
  });

  it('creates the collections with the items that will exist, ignoring unknown ones', () => {
    const added = item();
    const known = uuid();
    const unknown = uuid();
    const created = collection({
      items: [
        { uuid: added.uuid, addedAt: MOMENT },
        { uuid: known, addedAt: MOMENT },
        { uuid: unknown, addedAt: MOMENT },
        { uuid: added.uuid, addedAt: MOMENT },
      ],
    });

    const plan = planLibraryImport(
      library({ items: [added], collections: [created] }),
      existing({ itemUuids: [known] }),
    );

    expect(plan.collections).toEqual([
      {
        uuid: created.uuid,
        create: { name: 'Favoritas', createdAt: MOMENT, updatedAt: MOMENT },
        members: [
          { uuid: added.uuid, addedAt: MOMENT },
          { uuid: known, addedAt: MOMENT },
        ],
      },
    ]);
    expect(plan.counts).toMatchObject({ collections: 1, updatedCollections: 0 });
  });

  it('only adds to a collection that exists the items it does not have', () => {
    const [a, b] = [uuid(), uuid()];
    const same = collection({
      name: 'Otro nombre',
      items: [
        { uuid: a, addedAt: MOMENT },
        { uuid: b, addedAt: MOMENT },
      ],
    });
    const unchanged = collection({ items: [{ uuid: a, addedAt: MOMENT }] });

    const plan = planLibraryImport(
      library({ collections: [same, unchanged] }),
      existing({
        itemUuids: [a, b],
        collections: [
          [same.uuid, [a]],
          [unchanged.uuid, [a]],
        ],
      }),
    );

    expect(plan.collections).toEqual([
      { uuid: same.uuid, create: null, members: [{ uuid: b, addedAt: MOMENT }] },
    ]);
    expect(plan.counts).toMatchObject({ collections: 0, updatedCollections: 1 });
  });

  it('numbers a new collection whose name is taken, also by another new one', () => {
    const plan = planLibraryImport(
      library({
        collections: [collection({ name: 'favoritas' }), collection({ name: 'Favoritas' })],
      }),
      existing({ collectionNames: ['Favoritas'] }),
    );

    expect(plan.collections.map(({ create }) => create?.name)).toEqual([
      'favoritas (1)',
      'Favoritas (2)',
    ]);
    expect(plan.counts.renamedCollections).toBe(2);
  });
});
