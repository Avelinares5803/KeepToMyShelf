import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '../../../src/core/catalogs/catalogs';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import { DEFAULT_CATALOGS } from '../../../src/main/infrastructure/db/default-catalogs';
import type { ItemKind } from '../../../src/shared/content';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

function expectCode(run: () => unknown, type: typeof AppError, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(type);
    expect((error as AppError).code).toBe(code);
    return;
  }
  expect.fail(`Expected ${type.name} with code "${code}"`);
}

describe('CatalogService', () => {
  let fx: ProfileFixture;
  let profileId: string;
  let token: string;

  const db = () => fx.sessions.require(token).db;
  const names = (catalog: Catalog) => fx.catalogs.list(token, catalog).map((e) => e.name);
  const add = (catalog: Catalog, name: string) =>
    fx.catalogs.create(token, catalog, { name, aliases: [], scope: null });
  const createItem = (kind: ItemKind, title: string) =>
    fx.items.create(token, kind, { ...EMPTY_ITEM_DRAFT, title }).id;
  const link = (itemId: number, entryId: number, role: string) =>
    db()
      .prepare('INSERT INTO item_entry (item_id, entry_id, role) VALUES (?, ?, ?)')
      .run(itemId, entryId, role);

  beforeEach(() => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana', language: 'es' }).profile.id;
    token = fx.sessions.open(profileId).token;
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('default catalogs', () => {
    it('are loaded when a profile is created, in the language chosen for it', () => {
      expect(names('region')).toHaveLength(DEFAULT_CATALOGS.es.region.length);
      expect(names('screen_genre')).toContain('Suspense');
      expect(names('game_genre')).toContain('Plataformas');
      expect(names('platform')).toContain('Móvil');
      expect(names('game_genre')).toEqual(expect.arrayContaining(['Ritmo', 'Musical']));
      expect(fx.catalogs.list(token, 'screen_genre').find((e) => e.name === 'Sitcom')?.scope).toBe(
        'series',
      );
      expect(names('company')).toEqual([]);
      expect(names('person')).toEqual([]);
      expect(names('franchise')).toEqual([]);
      expect(names('tag')).toEqual([]);

      const english = fx.profiles.create({ name: 'Bea', language: 'en' }).profile.id;
      token = fx.sessions.open(english).token;
      expect(names('screen_genre')).toContain('Thriller');
      expect(names('platform')).toContain('Arcade');
    });

    it('are loaded only once: deleted values do not come back', () => {
      const horror = fx.catalogs.list(token, 'game_genre').find((e) => e.name === 'Terror');
      fx.catalogs.delete(token, horror!.id);

      token = fx.sessions.open(profileId).token;

      expect(names('game_genre')).not.toContain('Terror');
    });

    it('include countries, also for profiles that got the other lists before', () => {
      expect(names('country')).toHaveLength(DEFAULT_CATALOGS.es.country.length);
      expect(
        fx.catalogs.list(token, 'country').find((e) => e.name === 'Estados Unidos')?.aliases,
      ).toEqual(['EE. UU.', 'EEUU', 'USA']);

      // A profile seeded before countries existed: the other lists are not loaded again.
      const horror = fx.catalogs.list(token, 'game_genre').find((e) => e.name === 'Terror');
      fx.catalogs.delete(token, horror!.id);
      db().exec(
        "DELETE FROM catalog_entry WHERE catalog = 'country'; DELETE FROM library_meta WHERE key = 'default_countries_seeded';",
      );

      token = fx.sessions.open(profileId).token;

      expect(names('country')).toContain('Japón');
      expect(names('game_genre')).not.toContain('Terror');
    });

    it('are loaded on opening for profiles created before catalogs existed', () => {
      db().exec('DELETE FROM catalog_entry; DELETE FROM library_meta;');
      fx.settings.setForProfile(profileId, { key: 'language', value: 'en' });

      token = fx.sessions.open(profileId).token;

      expect(names('region')).toContain('Japan');
      expect(names('region')).not.toContain('Japón');
    });
  });

  describe('create', () => {
    it('lets values that differ only in case or accents coexist', () => {
      add('company', 'Hipo');
      add('company', 'Hipó');
      add('company', 'HIPO');

      expect(names('company')).toEqual(expect.arrayContaining(['Hipo', 'Hipó', 'HIPO']));
    });

    it('rejects a value with exactly the same name in the same catalog', () => {
      add('company', 'Nintendo');

      expectCode(() => add('company', '  Nintendo '), ConflictError, 'catalog.duplicate_name');
      expect(() => add('franchise', 'Nintendo')).not.toThrow();
    });

    it('validates the name', () => {
      expectCode(() => add('tag', '   '), ValidationError, 'catalog.name_empty');
    });

    it('accepts a scope only for movie/series genres', () => {
      expect(
        fx.catalogs.create(token, 'screen_genre', {
          name: 'Anime OVA',
          aliases: [],
          scope: 'movie',
        }).scope,
      ).toBe('movie');
      expectCode(
        () => fx.catalogs.create(token, 'company', { name: 'Pixar', aliases: [], scope: 'movie' }),
        ValidationError,
        'catalog.scope_not_allowed',
      );
    });
  });

  describe('list', () => {
    it('orders values by name ignoring case and accents', () => {
      for (const name of ['zeta', 'Álvaro', 'beta']) add('person', name);

      expect(names('person')).toEqual(['Álvaro', 'beta', 'zeta']);
    });

    it('orders the numbers in names by value', () => {
      for (const name of ['Final Fantasy 10', 'Final Fantasy 2', 'Final Fantasy']) {
        add('franchise', name);
      }

      expect(names('franchise')).toEqual(['Final Fantasy', 'Final Fantasy 2', 'Final Fantasy 10']);
    });

    it('counts the items that use each value, per kind and including the trash', () => {
      const nintendo = add('company', 'Nintendo').id;
      const zelda = createItem('game', 'Zelda');
      const mario = createItem('game', 'Mario');
      const movie = createItem('movie', 'Super Mario Bros. La película');
      link(zelda, nintendo, 'developer');
      link(zelda, nintendo, 'publisher');
      link(mario, nintendo, 'developer');
      link(movie, nintendo, 'producer');
      fx.items.moveToTrash(token, mario);

      expect(fx.catalogs.list(token, 'company')[0]?.usage).toEqual({
        total: 3,
        game: 2,
        movie: 1,
        series: 0,
      });
    });

    it('counts release dates as uses of their region', () => {
      const japan = fx.catalogs.list(token, 'region').find((e) => e.name === 'Japón')!;
      const game = createItem('game', 'Pokémon Rojo');
      db()
        .prepare("INSERT INTO item_release (item_id, region_id, date) VALUES (?, ?, '1996-02-27')")
        .run(game, japan.id);

      expect(fx.catalogs.list(token, 'region').find((e) => e.id === japan.id)?.usage.total).toBe(1);
    });
  });

  describe('update', () => {
    it('renames a value everywhere it is used', () => {
      const entry = add('company', 'Nintendo');
      const zelda = createItem('game', 'Zelda');
      link(zelda, entry.id, 'developer');

      fx.catalogs.update(token, entry.id, { name: 'Nintendo Co., Ltd.', aliases: [], scope: null });

      const linked = db()
        .prepare(
          `SELECT e.name FROM item_entry ie JOIN catalog_entry e ON e.id = ie.entry_id
           WHERE ie.item_id = ?`,
        )
        .pluck()
        .all(zelda);
      expect(linked).toEqual(['Nintendo Co., Ltd.']);
    });

    it('allows changing only the case of its own name, but not taking another name', () => {
      const entry = add('company', 'nintendo');
      add('company', 'Sega');

      expect(
        fx.catalogs.update(token, entry.id, { name: 'Nintendo', aliases: [], scope: null }).name,
      ).toBe('Nintendo');
      expectCode(
        () => fx.catalogs.update(token, entry.id, { name: 'Sega', aliases: [], scope: null }),
        ConflictError,
        'catalog.duplicate_name',
      );
    });

    it('changes the scope of a movie/series genre', () => {
      const genre = fx.catalogs.list(token, 'screen_genre').find((e) => e.name === 'Telenovela')!;

      expect(
        fx.catalogs.update(token, genre.id, { name: 'Telenovela', aliases: [], scope: null }).scope,
      ).toBe(null);
    });

    it('fails for a value that does not exist', () => {
      expectCode(
        () => fx.catalogs.update(token, 9999, { name: 'X', aliases: [], scope: null }),
        NotFoundError,
        'catalog.not_found',
      );
    });
  });

  describe('delete', () => {
    it('removes the value from its items, keeping the items', () => {
      const entry = add('tag', 'Difícil');
      const game = createItem('game', 'Dark Souls');
      link(game, entry.id, 'tag');

      fx.catalogs.delete(token, entry.id);

      expect(db().prepare('SELECT COUNT(*) FROM item_entry').pluck().get()).toBe(0);
      expect(fx.items.get(token, game).title).toBe('Dark Souls');
    });

    it('keeps the release dates of a deleted region, without a region', () => {
      const japan = fx.catalogs.list(token, 'region').find((e) => e.name === 'Japón')!;
      const game = createItem('game', 'Pokémon Rojo');
      db()
        .prepare("INSERT INTO item_release (item_id, region_id, date) VALUES (?, ?, '1996-02-27')")
        .run(game, japan.id);

      fx.catalogs.delete(token, japan.id);

      expect(db().prepare('SELECT region_id, date FROM item_release').all()).toEqual([
        { region_id: null, date: '1996-02-27' },
      ]);
    });

    it('deletes only the unused values of one catalog and reports how many', () => {
      const used = add('person', 'Nobuo Uematsu');
      add('person', 'Sin usar 1');
      add('person', 'Sin usar 2');
      add('company', 'Empresa sin usar');
      link(createItem('game', 'Final Fantasy VI'), used.id, 'composer');

      expect(fx.catalogs.deleteUnused(token, 'person')).toBe(2);
      expect(names('person')).toEqual(['Nobuo Uematsu']);
      expect(names('company')).toEqual(['Empresa sin usar']);
    });

    it('never deletes regions used by release dates as unused', () => {
      const japan = fx.catalogs.list(token, 'region').find((e) => e.name === 'Japón')!;
      db()
        .prepare("INSERT INTO item_release (item_id, region_id, date) VALUES (?, ?, '1996')")
        .run(createItem('game', 'Pokémon Rojo'), japan.id);

      fx.catalogs.deleteUnused(token, 'region');

      expect(names('region')).toEqual(['Japón']);
    });

    it('fails for a value that does not exist', () => {
      expectCode(() => fx.catalogs.delete(token, 9999), NotFoundError, 'catalog.not_found');
    });
  });

  describe('merge', () => {
    const addWith = (catalog: Catalog, name: string, aliases: string[]) =>
      fx.catalogs.create(token, catalog, { name, aliases, scope: null });
    const links = (itemId: number) =>
      db()
        .prepare(
          `SELECT ie.role, e.name, ie.sort_order AS position FROM item_entry ie
           JOIN catalog_entry e ON e.id = ie.entry_id
           WHERE ie.item_id = ? ORDER BY ie.role, ie.sort_order`,
        )
        .all(itemId);
    const linkAt = (itemId: number, entryId: number, role: string, position: number) =>
      db()
        .prepare('INSERT INTO item_entry (item_id, entry_id, role, sort_order) VALUES (?, ?, ?, ?)')
        .run(itemId, entryId, role, position);
    const release = (itemId: number, regionId: number, date: string) =>
      db()
        .prepare('INSERT INTO item_release (item_id, region_id, date) VALUES (?, ?, ?)')
        .run(itemId, regionId, date);

    it('moves the items of every role and kind, also in the trash, and deletes the value', () => {
      const kept = add('company', 'Square Enix');
      const merged = add('company', 'SquareEnix');
      const game = createItem('game', 'Nier');
      const movie = createItem('movie', 'Advent Children');
      const trashed = createItem('game', 'Bravely Default');
      link(game, merged.id, 'developer');
      link(game, merged.id, 'publisher');
      link(movie, merged.id, 'producer');
      link(trashed, merged.id, 'developer');
      fx.items.moveToTrash(token, trashed);

      const result = fx.catalogs.merge(token, merged.id, kept.id);

      expect(result).toMatchObject({
        id: kept.id,
        name: 'Square Enix',
        usage: { total: 3, game: 2, movie: 1, series: 0 },
      });
      expect(names('company')).toEqual(['Square Enix']);
      expect(links(game)).toEqual([
        { role: 'developer', name: 'Square Enix', position: 0 },
        { role: 'publisher', name: 'Square Enix', position: 0 },
      ]);
      expect(links(trashed)).toHaveLength(1);
      expect(db().pragma('foreign_key_check')).toEqual([]);
    });

    it('links an item with both values in a role once, in the position of the kept one', () => {
      const kept = add('person', 'Ana de Armas');
      const merged = add('person', 'Ana De Armas');
      const other = add('person', 'Ryan Gosling');
      const both = createItem('movie', 'Blade Runner 2049');
      linkAt(both, merged.id, 'actor', 0);
      linkAt(both, other.id, 'actor', 1);
      linkAt(both, kept.id, 'actor', 2);
      linkAt(both, merged.id, 'director', 0);

      fx.catalogs.merge(token, merged.id, kept.id);

      expect(links(both)).toEqual([
        { role: 'actor', name: 'Ryan Gosling', position: 1 },
        { role: 'actor', name: 'Ana de Armas', position: 2 },
        { role: 'director', name: 'Ana de Armas', position: 0 },
      ]);
    });

    it('keeps the position in the cast of the merged value', () => {
      const kept = add('person', 'Ana de Armas');
      const merged = add('person', 'Ana De Armas');
      const other = add('person', 'Ryan Gosling');
      const movie = createItem('movie', 'Blade Runner 2049');
      linkAt(movie, merged.id, 'actor', 0);
      linkAt(movie, other.id, 'actor', 1);

      fx.catalogs.merge(token, merged.id, kept.id);

      expect(fx.items.get(token, movie).relations.actor?.map((e) => e.name)).toEqual([
        'Ana de Armas',
        'Ryan Gosling',
      ]);
    });

    it('moves release dates, keeping once the ones that become identical', () => {
      const kept = add('region', 'Corea');
      const merged = add('region', 'COREA');
      const game = createItem('game', 'Tetris');
      const otherGame = createItem('game', 'Columns');
      release(game, kept.id, '1996');
      release(game, merged.id, '1996');
      release(game, merged.id, '2001-05');
      release(otherGame, merged.id, '1996');

      fx.catalogs.merge(token, merged.id, kept.id);

      expect(
        db().prepare('SELECT item_id, region_id, date FROM item_release ORDER BY id').all(),
      ).toEqual([
        { item_id: game, region_id: kept.id, date: '1996' },
        { item_id: game, region_id: kept.id, date: '2001-05' },
        { item_id: otherGame, region_id: kept.id, date: '1996' },
      ]);
    });

    it('turns the merged name and its other names into other names of the kept value', () => {
      const kept = addWith('company', 'Square Enix', ['SE']);
      const merged = addWith('company', 'SquareEnix', ['Square', 'se']);

      expect(fx.catalogs.merge(token, merged.id, kept.id).aliases).toEqual([
        'SE',
        'SquareEnix',
        'Square',
      ]);
      expect(
        db()
          .prepare('SELECT name_key FROM catalog_entry_alias WHERE entry_id = ? ORDER BY id')
          .pluck()
          .all(kept.id),
      ).toEqual(['se', 'squareenix', 'square']);
    });

    it('makes a genre available for both kinds when the scopes differ', () => {
      const genre = (name: string, scope: 'movie' | 'series' | null) =>
        fx.catalogs.create(token, 'screen_genre', { name, aliases: [], scope }).id;

      const onlyMovies = genre('Corto', 'movie');
      expect(fx.catalogs.merge(token, genre('Cortos', 'series'), onlyMovies).scope).toBe(null);
      const alsoMovies = genre('Largo', 'movie');
      expect(fx.catalogs.merge(token, genre('Largos', 'movie'), alsoMovies).scope).toBe('movie');
    });

    it('changes nothing when the other names do not fit', () => {
      const many = Array.from({ length: 50 }, (_, i) => `Alias ${i}`);
      const kept = addWith('tag', 'Difícil', many);
      const merged = add('tag', 'Complicado');
      const game = createItem('game', 'Dark Souls');
      link(game, merged.id, 'tag');

      expectCode(
        () => fx.catalogs.merge(token, merged.id, kept.id),
        ValidationError,
        'catalog.merge_too_many_aliases',
      );
      expect(names('tag')).toEqual(['Complicado', 'Difícil']);
      expect(links(game)).toEqual([{ role: 'tag', name: 'Complicado', position: 0 }]);
    });

    it('undoes everything when a step fails', () => {
      const kept = add('tag', 'Difícil');
      const merged = add('tag', 'Complicado');
      const game = createItem('game', 'Dark Souls');
      link(game, merged.id, 'tag');
      // The last step, deleting the merged value, fails after the links have moved.
      db().exec(
        "CREATE TEMP TRIGGER no_delete BEFORE DELETE ON catalog_entry BEGIN SELECT RAISE(ABORT, 'no'); END;",
      );

      expect(() => fx.catalogs.merge(token, merged.id, kept.id)).toThrow('no');
      expect(links(game)).toEqual([{ role: 'tag', name: 'Complicado', position: 0 }]);
      expect(fx.catalogs.list(token, 'tag').find((e) => e.id === kept.id)?.aliases).toEqual([]);
    });

    it('rejects the same value, values of other catalogs and values that do not exist', () => {
      const tag = add('tag', 'Nintendo');
      const company = add('company', 'Nintendo');

      expectCode(
        () => fx.catalogs.merge(token, tag.id, tag.id),
        ValidationError,
        'catalog.merge_same_value',
      );
      expectCode(
        () => fx.catalogs.merge(token, tag.id, company.id),
        ValidationError,
        'catalog.merge_other_catalog',
      );
      expectCode(() => fx.catalogs.merge(token, tag.id, 9999), NotFoundError, 'catalog.not_found');
      expectCode(() => fx.catalogs.merge(token, 9999, tag.id), NotFoundError, 'catalog.not_found');
    });

    it('leaves the modification date of the items as it was', () => {
      const kept = add('tag', 'Difícil');
      const merged = add('tag', 'Complicado');
      const game = createItem('game', 'Dark Souls');
      link(game, merged.id, 'tag');
      const before = fx.items.get(token, game).updatedAt;

      fx.catalogs.merge(token, merged.id, kept.id);

      expect(fx.items.get(token, game).updatedAt).toBe(before);
    });
  });

  describe('other names (aliases)', () => {
    it('come with the default regional platform names', () => {
      const find = (name: string) =>
        fx.catalogs.list(token, 'platform').find((e) => e.name === name);

      expect(find('Mega Drive')?.aliases).toEqual(['Sega Genesis', 'Sega Mega Drive']);
      expect(find('SNES')?.aliases).toEqual([
        'Super Nintendo Entertainment System',
        'Super Famicom',
        'Super FC',
        'SFC',
      ]);
      expect(find('PC')?.aliases).toEqual([]);
      expect(
        fx.catalogs.list(token, 'game_genre').find((e) => e.name === "Shoot 'em up")?.aliases,
      ).toEqual(['Naves', 'Matamarcianos', 'Shmup']);
    });

    it('are saved cleaned with the value and replaced when it is edited', () => {
      const entry = fx.catalogs.create(token, 'franchise', {
        name: 'Pokémon',
        aliases: [' Pocket Monsters ', '', 'Pokémon', 'Pocket Monsters'],
        scope: null,
      });
      expect(entry.aliases).toEqual(['Pocket Monsters']);

      const updated = fx.catalogs.update(token, entry.id, {
        name: 'Pokémon',
        aliases: ['ポケモン'],
        scope: null,
      });
      expect(updated.aliases).toEqual(['ポケモン']);
      expect(fx.catalogs.list(token, 'franchise')[0]?.aliases).toEqual(['ポケモン']);
    });

    it('are stored with a search key without case or accents', () => {
      fx.catalogs.create(token, 'company', {
        name: 'Square',
        aliases: ['SquareSoft'],
        scope: null,
      });

      expect(
        db()
          .prepare('SELECT name_key FROM catalog_entry_alias WHERE name = ?')
          .pluck()
          .get('SquareSoft'),
      ).toBe('squaresoft');
    });

    it('are deleted with their value', () => {
      const entry = fx.catalogs.create(token, 'company', {
        name: 'Square',
        aliases: ['SquareSoft'],
        scope: null,
      });

      fx.catalogs.delete(token, entry.id);

      expect(
        db()
          .prepare('SELECT COUNT(*) FROM catalog_entry_alias WHERE entry_id = ?')
          .pluck()
          .get(entry.id),
      ).toBe(0);
    });
  });

  it('keeps catalogs separate per profile', () => {
    add('tag', 'Solo de Ana');
    const bea = fx.profiles.create({ name: 'Bea', language: 'es' }).profile.id;
    token = fx.sessions.open(bea).token;

    expect(names('tag')).toEqual([]);
  });
});
