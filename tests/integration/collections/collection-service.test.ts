import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import type { ImageStorageChoice } from '../../../src/core/media/import-rules';
import type { ItemKind } from '../../../src/shared/content';
import type { ImagePlanEntry, PreparedImport } from '../../../src/shared/media';
import { PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function expectCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  expect.fail(`Expected error "${code}"`);
}

describe('CollectionService', () => {
  let fx: ProfileFixture;
  let token: string;
  let profileId: string;

  const item = (kind: ItemKind, title: string) =>
    fx.items.create(token, kind, { ...EMPTY_ITEM_DRAFT, title }).id;
  const collection = (name: string) => fx.collections.create(token, { name }).id;
  const add = (collectionId: number, ...itemIds: number[]) =>
    fx.collections.changeMemberships(token, {
      add: itemIds.map((itemId) => ({ collectionId, itemId })),
      remove: [],
    });
  const remove = (collectionId: number, ...itemIds: number[]) =>
    fx.collections.changeMemberships(token, {
      add: [],
      remove: itemIds.map((itemId) => ({ collectionId, itemId })),
    });
  const titles = (collectionId: number, kind: ItemKind | null = null) =>
    fx.collections.listItems(token, collectionId, { kind }).map((summary) => summary.title);

  const prepare = (name: string, bytes: Uint8Array): Promise<PreparedImport> =>
    fx.media.prepareImport(token, writeFile(fx.scratchDir, name, bytes));
  const prepared = (
    preparation: PreparedImport,
    choice: ImageStorageChoice = 'original',
  ): ImagePlanEntry => ({ kind: 'prepared', preparedId: preparation.id, choice });
  const storedFiles = (): string[] => {
    const folder = join(fx.paths.mediaDir(profileId), 'files');
    return existsSync(folder)
      ? (readdirSync(folder, { recursive: true }) as string[])
          .filter((path) => statSync(join(folder, path)).isFile())
          .map((path) => basename(path))
          .sort()
      : [];
  };

  beforeEach(() => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana' }).profile.id;
    token = fx.sessions.open(profileId).token;
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('names', () => {
    it('lists collections by name, ignoring case and accents', () => {
      collection('zelda y amigos');
      collection('  Películas   pendientes ');
      collection('Ánimo');

      expect(fx.collections.list(token).map((c) => c.name)).toEqual([
        'Ánimo',
        'Películas pendientes',
        'zelda y amigos',
      ]);
    });

    it('refuses a name that differs from another only in case or accents', () => {
      const favorites = collection('Favoritos');
      collection('Pendientes');

      expectCode(() => collection('FAVORITOS'), 'collection.duplicate_name');
      expectCode(
        () => fx.collections.update(token, favorites, { name: 'pendientes' }),
        'collection.duplicate_name',
      );
      // Its own name, written differently, is not a clash.
      expect(fx.collections.update(token, favorites, { name: 'FAVORITOS' }).name).toBe('FAVORITOS');
    });

    it('refuses an empty name', () => {
      expectCode(() => collection('   '), 'collection.name_empty');
    });
  });

  describe('items', () => {
    it('holds items of every kind, narrowed by kind, searched and sorted', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');
      const alien = item('movie', 'Alien');
      const dark = item('series', 'Dark');
      item('game', 'Fuera');
      add(id, sonic, alien, dark);

      expect(titles(id)).toEqual(['Alien', 'Dark', 'Sonic']);
      expect(titles(id, 'movie')).toEqual(['Alien']);
      expect(
        fx.collections
          .listItems(token, id, { kind: null, sort: { field: 'title', direction: 'desc' } })
          .map((summary) => summary.title),
      ).toEqual(['Sonic', 'Dark', 'Alien']);
      expect(
        fx.collections
          .listItems(token, id, {
            kind: null,
            search: { text: 'DÁR', untitledLabel: 'Sin nombre' },
          })
          .map((summary) => summary.title),
      ).toEqual(['Dark']);
      expect(fx.collections.get(token, id).itemCount).toBe(3);
    });

    it('stores references: an item edited elsewhere shows its new data', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');
      add(id, sonic);

      fx.items.update(token, sonic, { ...EMPTY_ITEM_DRAFT, title: 'Sonic the Hedgehog' });

      expect(titles(id)).toEqual(['Sonic the Hedgehog']);
    });

    it('hides an item in the trash and shows it again when restored', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');
      const tails = item('game', 'Tails');
      add(id, sonic, tails);

      fx.items.moveToTrash(token, sonic);
      expect(titles(id)).toEqual(['Tails']);
      expect(fx.collections.list(token)[0]!.itemCount).toBe(1);
      expect(fx.collections.memberIds(token, id)).toEqual([tails]);

      fx.items.restore(token, sonic);
      expect(titles(id)).toEqual(['Sonic', 'Tails']);
    });

    it('keeps the membership of an item in the trash when others change', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');
      const tails = item('game', 'Tails');
      add(id, sonic, tails);
      fx.items.moveToTrash(token, sonic);

      remove(id, tails);
      fx.items.restore(token, sonic);

      expect(titles(id)).toEqual(['Sonic']);
    });

    it('removes an item deleted for good from its collections', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');
      add(id, sonic);

      fx.items.moveToTrash(token, sonic);
      fx.items.deletePermanently(token, sonic);

      expect(titles(id)).toEqual([]);
      expectCode(() => fx.collections.forItem(token, sonic), 'item.not_found');
    });

    it('never deletes items when the collection is deleted', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');
      add(id, sonic);

      fx.collections.delete(token, id);

      expect(fx.collections.list(token)).toEqual([]);
      expect(fx.items.get(token, sonic).title).toBe('Sonic');
      expect(fx.collections.forItem(token, sonic)).toEqual([]);
      expectCode(() => fx.collections.get(token, id), 'collection.not_found');
    });

    it('tells the collections of an item, by name', () => {
      const sonic = item('game', 'Sonic');
      const pending = collection('Pendientes');
      const favorites = collection('Favoritos');
      collection('Vacía');
      fx.collections.changeMemberships(token, {
        add: [
          { collectionId: pending, itemId: sonic },
          { collectionId: favorites, itemId: sonic },
        ],
        remove: [],
      });

      expect(fx.collections.forItem(token, sonic)).toEqual([
        { id: favorites, name: 'Favoritos' },
        { id: pending, name: 'Pendientes' },
      ]);
    });

    it('ignores adding an item twice or removing one that is not there', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');
      const tails = item('game', 'Tails');
      add(id, sonic);

      add(id, sonic);
      remove(id, tails);

      expect(titles(id)).toEqual(['Sonic']);
    });

    it('refuses an item in the trash, a missing item or collection, and contradictions', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');
      const tails = item('game', 'Tails');
      fx.items.moveToTrash(token, tails);

      expectCode(() => add(id, tails), 'item.in_trash');
      expectCode(() => add(id, 999), 'item.not_found');
      expectCode(() => add(999, sonic), 'collection.not_found');
      expectCode(
        () =>
          fx.collections.changeMemberships(token, {
            add: [{ collectionId: id, itemId: sonic }],
            remove: [{ collectionId: id, itemId: sonic }],
          }),
        'collection.invalid_change',
      );
      expectCode(
        () => fx.collections.listItems(token, 999, { kind: null }),
        'collection.not_found',
      );
    });

    it('applies all the changes or none', () => {
      const id = collection('Favoritos');
      const sonic = item('game', 'Sonic');

      expectCode(
        () =>
          fx.collections.changeMemberships(token, {
            add: [
              { collectionId: id, itemId: sonic },
              { collectionId: 999, itemId: sonic },
            ],
            remove: [],
          }),
        'collection.not_found',
      );

      expect(titles(id)).toEqual([]);
    });
  });

  describe('covers', () => {
    let wide: Buffer;
    let tall: Buffer;

    beforeEach(async () => {
      wide ??= await pngImage(40, 20);
      tall ??= await pngImage(20, 40);
    });

    it('saves an optional cover, shown in the list', async () => {
      const id = fx.collections.create(token, {
        name: 'Favoritos',
        cover: prepared(await prepare('ancha.png', wide)),
      }).id;
      collection('Sin portada');

      expect(fx.collections.list(token)).toEqual([
        {
          id,
          name: 'Favoritos',
          itemCount: 0,
          cover: { sha256: sha256(wide), width: 40, height: 20 },
        },
        expect.objectContaining({ name: 'Sin portada', cover: null }),
      ]);
      expect(fx.collections.get(token, id).cover).toMatchObject({
        sha256: sha256(wide),
        isMissing: false,
      });
    });

    it('changes, keeps and removes the cover, deleting files nothing uses', async () => {
      const id = fx.collections.create(token, {
        name: 'Favoritos',
        cover: prepared(await prepare('ancha.png', wide)),
      }).id;

      fx.collections.update(token, id, {
        name: 'Favoritos',
        cover: prepared(await prepare('alta.png', tall)),
      });
      expect(storedFiles()).toEqual([`${sha256(tall)}.png`]);

      fx.collections.update(token, id, { name: 'Favoritos 2' });
      const kept = fx.collections.get(token, id).cover!;
      fx.collections.update(token, id, {
        name: 'Favoritos 2',
        cover: { kind: 'existing', mediaId: kept.mediaId },
      });
      expect(fx.collections.get(token, id).cover?.sha256).toBe(sha256(tall));

      fx.collections.update(token, id, { name: 'Favoritos 2', cover: null });
      expect(fx.collections.get(token, id).cover).toBeNull();
      expect(storedFiles()).toEqual([]);
    });

    it('keeps a file that is both a collection cover and an item cover', async () => {
      const sonic = fx.items.create(
        token,
        'game',
        { ...EMPTY_ITEM_DRAFT, title: 'Sonic' },
        { cover: prepared(await prepare('ancha.png', wide)) },
      );
      const id = fx.collections.create(token, {
        name: 'Favoritos',
        cover: prepared(await prepare('ancha.png', wide)),
      }).id;
      expect(storedFiles()).toEqual([`${sha256(wide)}.png`]);

      fx.collections.delete(token, id);
      expect(storedFiles()).toEqual([`${sha256(wide)}.png`]);

      const again = fx.collections.create(token, {
        name: 'Favoritos',
        cover: prepared(await prepare('ancha.png', wide)),
      }).id;
      fx.items.update(token, sonic.id, { ...EMPTY_ITEM_DRAFT, title: 'Sonic' }, { cover: null });
      expect(storedFiles()).toEqual([`${sha256(wide)}.png`]);
      expect(fx.collections.get(token, again).cover?.sha256).toBe(sha256(wide));

      fx.collections.delete(token, again);
      expect(storedFiles()).toEqual([]);
    });

    it('keeps collection covers when the profile is opened again', async () => {
      const id = fx.collections.create(token, {
        name: 'Favoritos',
        cover: prepared(await prepare('ancha.png', wide)),
      }).id;

      fx.sessions.closeCurrent();
      token = fx.sessions.open(profileId).token;

      expect(fx.collections.get(token, id).cover?.sha256).toBe(sha256(wide));
      expect(storedFiles()).toEqual([`${sha256(wide)}.png`]);
    });

    it('replaces an optimized cover by its kept original', async () => {
      const big = await pngImage(2400, 1200);
      const id = fx.collections.create(token, {
        name: 'Favoritos',
        cover: prepared(await prepare('grande.png', big), 'optimized_with_original'),
      }).id;
      const optimized = fx.collections.get(token, id).cover!;
      expect(optimized).toMatchObject({ format: 'webp', hasOriginal: true });

      fx.collections.update(token, id, {
        name: 'Favoritos',
        cover: { kind: 'use_original', mediaId: optimized.mediaId },
      });

      expect(fx.collections.get(token, id).cover).toMatchObject({ format: 'png', width: 2400 });
      expect(storedFiles()).toEqual([`${sha256(big)}.png`]);
    });

    it.each([
      ['a document', 'media.not_an_image'],
      ['an image of an item', 'media.not_attached'],
    ])('refuses %s as the cover', async (label, code) => {
      const sonic = fx.items.create(
        token,
        'game',
        { ...EMPTY_ITEM_DRAFT, title: 'Sonic' },
        { cover: prepared(await prepare('alta.png', tall)) },
      );
      const cover: ImagePlanEntry =
        label === 'a document'
          ? prepared(await prepare('Manual.pdf', PDF_BYTES))
          : { kind: 'existing', mediaId: fx.media.list(token, sonic.id).cover!.mediaId };

      expectCode(() => fx.collections.create(token, { name: 'Favoritos', cover }), code);
      expect(fx.collections.list(token)).toEqual([]);
    });

    it('saves nothing when the save fails, and the import can be used again', async () => {
      collection('Favoritos');
      const image = await prepare('ancha.png', wide);

      expectCode(
        () => fx.collections.create(token, { name: 'favoritos', cover: prepared(image) }),
        'collection.duplicate_name',
      );
      expect(storedFiles()).toEqual([]);

      fx.collections.create(token, { name: 'Pendientes', cover: prepared(image) });
      expect(storedFiles()).toEqual([`${sha256(wide)}.png`]);
    });
  });
});
