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

  describe('other names (aliases)', () => {
    it('come with the default regional platform names', () => {
      const find = (name: string) =>
        fx.catalogs.list(token, 'platform').find((e) => e.name === name);

      expect(find('Mega Drive')?.aliases).toEqual(['Genesis']);
      expect(find('Super Nintendo')?.aliases).toEqual(['Super Famicom', 'SNES']);
      expect(find('NES')?.aliases).toEqual(['Famicom']);
      expect(find('PC')?.aliases).toEqual([]);
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
