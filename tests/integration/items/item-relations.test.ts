import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalog } from '../../../src/core/catalogs/catalogs';
import { AppError, NotFoundError, ValidationError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { EntryRef } from '../../../src/core/items/item-relations';
import type { ItemKind } from '../../../src/shared/content';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const existing = (id: number): EntryRef => ({ kind: 'existing', id });
const added = (name: string): EntryRef => ({ kind: 'new', name });

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

describe('ItemService relations and release dates', () => {
  let fx: ProfileFixture;
  let token: string;

  const create = (kind: ItemKind, overrides: Partial<ItemDraft> = {}) =>
    fx.items.create(token, kind, { ...EMPTY_ITEM_DRAFT, title: 'Elemento', ...overrides });
  const entry = (catalog: Catalog, name: string) => {
    const found = fx.catalogs.list(token, catalog).find((e) => e.name === name);
    return found ?? fx.catalogs.create(token, catalog, { name, aliases: [], scope: null });
  };
  const names = (catalog: Catalog) => fx.catalogs.list(token, catalog).map((e) => e.name);

  beforeEach(() => {
    fx = createProfileFixture();
    const { profile } = fx.profiles.create({ name: 'Ana', language: 'es' });
    token = fx.sessions.open(profile.id).token;
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('stores the values of each role in the chosen order and reads them with their names', () => {
    const snes = entry('platform', 'SNES');
    const square = entry('company', 'Square');

    const item = create('game', {
      relations: {
        owned_on: [existing(snes.id)],
        developer: [existing(square.id)],
        publisher: [existing(square.id)],
        tag: [added('Favoritos'), added('Clásicos')],
      },
    });

    expect(item.relations).toEqual({
      owned_on: [{ id: snes.id, name: 'SNES' }],
      developer: [{ id: square.id, name: 'Square' }],
      publisher: [{ id: square.id, name: 'Square' }],
      tag: [
        { id: expect.any(Number), name: 'Favoritos' },
        { id: expect.any(Number), name: 'Clásicos' },
      ],
    });
    expect(fx.items.get(token, item.id).relations).toEqual(item.relations);
  });

  it('keeps the order of actors as chosen', () => {
    const item = create('movie', {
      relations: { actor: [added('Zoe Saldaña'), added('Ana de Armas'), added('Mía Goth')] },
    });

    expect(item.relations.actor?.map((e) => e.name)).toEqual([
      'Zoe Saldaña',
      'Ana de Armas',
      'Mía Goth',
    ]);
  });

  it('creates new values when saving, reusing a value with exactly the same name', () => {
    const capcom = entry('company', 'Capcom');

    const item = create('game', {
      relations: { developer: [added('Capcom'), added('capcom')], publisher: [added('Capcom')] },
    });

    expect(names('company')).toEqual(['Capcom', 'capcom']);
    expect(item.relations.developer?.[0]?.id).toBe(capcom.id);
    expect(item.relations.publisher).toEqual([{ id: capcom.id, name: 'Capcom' }]);
  });

  it('links a value only once when it is referenced both as existing and as a new name', () => {
    const capcom = entry('company', 'Capcom');

    const item = create('game', {
      relations: { developer: [existing(capcom.id), added('Capcom')] },
    });

    expect(item.relations.developer).toEqual([{ id: capcom.id, name: 'Capcom' }]);
  });

  it('creates nothing when the item cannot be saved', () => {
    const person = entry('person', 'Hideo Kojima');

    expectCode(
      () =>
        create('game', {
          relations: { tag: [added('Etiqueta nueva')], developer: [existing(person.id)] },
        }),
      ValidationError,
      'item.wrong_catalog',
    );
    expect(names('tag')).toEqual([]);
    expect(fx.items.list(token, 'game')).toEqual([]);
  });

  it('replaces all relations and dates when the item is edited', () => {
    const item = create('game', {
      relations: { tag: [added('Vieja')] },
      releases: [{ region: null, date: { year: 1990 } }],
    });

    const updated = fx.items.update(token, item.id, {
      ...EMPTY_ITEM_DRAFT,
      title: 'Elemento',
      relations: { tag: [added('Nueva')] },
    });

    expect(updated.relations).toEqual({ tag: [{ id: expect.any(Number), name: 'Nueva' }] });
    expect(updated.releases).toEqual([]);
    expect(names('tag')).toEqual(['Nueva', 'Vieja']);
  });

  it('shows the current name of a renamed value and drops a deleted one', () => {
    const item = create('game', { relations: { developer: [added('Squaresoft')] } });
    const value = item.relations.developer![0]!;

    fx.catalogs.update(token, value.id, { name: 'Square Enix', aliases: [], scope: null });
    expect(fx.items.get(token, item.id).relations.developer).toEqual([
      { id: value.id, name: 'Square Enix' },
    ]);

    fx.catalogs.delete(token, value.id);
    expect(fx.items.get(token, item.id).relations).toEqual({});
  });

  it('keeps relations in the trash and counts them as uses', () => {
    const item = create('game', { relations: { tag: [added('Difícil')] } });

    fx.items.moveToTrash(token, item.id);
    fx.items.restore(token, item.id);

    expect(fx.items.get(token, item.id).relations.tag?.[0]?.name).toBe('Difícil');
    expect(fx.catalogs.list(token, 'tag')[0]?.usage.total).toBe(1);
  });

  describe('release dates', () => {
    it('stores dates in order, with or without a region, even repeating a region', () => {
      const japan = entry('region', 'Japón');

      const item = create('game', {
        releases: [
          { region: existing(japan.id), date: { year: 1996, month: 2, day: 27 } },
          { region: existing(japan.id), date: { year: 1998, month: 9 } },
          { region: null, date: { year: 1999 } },
          { region: added('Chile'), date: { year: 2000 } },
        ],
      });

      expect(item.releases).toEqual([
        { region: { id: japan.id, name: 'Japón' }, date: { year: 1996, month: 2, day: 27 } },
        { region: { id: japan.id, name: 'Japón' }, date: { year: 1998, month: 9 } },
        { region: null, date: { year: 1999 } },
        { region: { id: expect.any(Number), name: 'Chile' }, date: { year: 2000 } },
      ]);
      expect(names('region')).toContain('Chile');
    });

    it('keeps the date without a region when the region is deleted', () => {
      const japan = entry('region', 'Japón');
      const item = create('movie', {
        releases: [{ region: existing(japan.id), date: { year: 2001, month: 7 } }],
      });

      fx.catalogs.delete(token, japan.id);

      expect(fx.items.get(token, item.id).releases).toEqual([
        { region: null, date: { year: 2001, month: 7 } },
      ]);
    });

    it('accepts only regions as regions', () => {
      const tag = entry('tag', 'Clásicos');

      expectCode(
        () => create('game', { releases: [{ region: existing(tag.id), date: { year: 2000 } }] }),
        ValidationError,
        'item.wrong_catalog',
      );
    });
  });

  describe('rejections', () => {
    it('rejects values from another catalog', () => {
      const genre = entry('game_genre', 'Plataformas');

      expectCode(
        () => create('game', { relations: { owned_on: [existing(genre.id)] } }),
        ValidationError,
        'item.wrong_catalog',
      );
    });

    it('rejects genres limited to the other kind, also when typed as a new name', () => {
      const sitcom = entry('screen_genre', 'Sitcom');

      expectCode(
        () => create('movie', { relations: { genre: [existing(sitcom.id)] } }),
        ValidationError,
        'item.genre_scope_mismatch',
      );
      expectCode(
        () => create('movie', { relations: { genre: [added('Sitcom')] } }),
        ValidationError,
        'item.genre_scope_mismatch',
      );
      expect(
        create('series', { relations: { genre: [existing(sitcom.id)] } }).relations.genre,
      ).toEqual([{ id: sitcom.id, name: 'Sitcom' }]);
    });

    it('rejects roles that do not apply to the kind', () => {
      expectCode(
        () => create('movie', { relations: { owned_on: [added('PC')] } }),
        ValidationError,
        'item.role_not_allowed',
      );
    });

    it('rejects values that do not exist', () => {
      expectCode(
        () => create('game', { relations: { tag: [existing(9999)] } }),
        NotFoundError,
        'catalog.not_found',
      );
    });
  });
});
