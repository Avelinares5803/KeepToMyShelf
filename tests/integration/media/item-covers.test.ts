import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { ImageStorageChoice } from '../../../src/core/media/import-rules';
import type { ImagePlanEntry, PreparedImport } from '../../../src/shared/media';
import { PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const draft = (title: string): ItemDraft => ({ ...EMPTY_ITEM_DRAFT, title });

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

describe('item covers', () => {
  let fx: ProfileFixture;
  let token: string;
  let profileId: string;
  let wide: Buffer;
  let tall: Buffer;
  let square: Buffer;

  const prepare = (name: string, bytes: Uint8Array): Promise<PreparedImport> =>
    fx.media.prepareImport(token, writeFile(fx.scratchDir, name, bytes));
  const prepared = (
    preparation: PreparedImport,
    choice: ImageStorageChoice = 'original',
  ): ImagePlanEntry => ({ kind: 'prepared', preparedId: preparation.id, choice });
  const existing = (mediaId: number): ImagePlanEntry => ({ kind: 'existing', mediaId });

  const coverOf = (title: string) =>
    fx.items.list(token, 'game').find((item) => item.title === title)?.cover;
  const mediaOf = (itemId: number) => fx.media.list(token, itemId);
  const storedFiles = (): string[] => {
    const folder = join(fx.paths.mediaDir(profileId), 'files');
    return existsSync(folder)
      ? (readdirSync(folder, { recursive: true }) as string[])
          .filter((path) => statSync(join(folder, path)).isFile())
          .map((path) => basename(path))
          .sort()
      : [];
  };

  beforeEach(async () => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana' }).profile.id;
    token = fx.sessions.open(profileId).token;
    wide ??= await pngImage(40, 20);
    tall ??= await pngImage(20, 40);
    square ??= await pngImage(30, 30);
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('saves the cover with its proportions, apart from the gallery', async () => {
    const item = fx.items.create(token, 'game', draft('Con portada'), {
      cover: prepared(await prepare('ancha.png', wide)),
      images: [prepared(await prepare('alta.png', tall))],
    });
    fx.items.create(token, 'game', draft('Sin portada'));

    expect(coverOf('Con portada')).toEqual({ sha256: sha256(wide), width: 40, height: 20 });
    expect(coverOf('Sin portada')).toBeNull();
    expect(mediaOf(item.id)).toMatchObject({
      cover: { sha256: sha256(wide), width: 40, height: 20, isMissing: false },
      images: [{ sha256: sha256(tall) }],
    });
  });

  it('never makes a gallery image the cover by itself', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      images: [prepared(await prepare('ancha.png', wide))],
    });
    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      images: [
        prepared(await prepare('alta.png', tall)),
        existing(mediaOf(item.id).images[0]!.mediaId),
      ],
    });

    expect(coverOf('Chrono Trigger')).toBeNull();
    expect(mediaOf(item.id).cover).toBeNull();
  });

  it('keeps the cover when the gallery is reordered, emptied or left out', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      cover: prepared(await prepare('cuadrada.png', square)),
      images: [
        prepared(await prepare('ancha.png', wide)),
        prepared(await prepare('alta.png', tall)),
      ],
    });
    const [first, second] = mediaOf(item.id).images;

    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      images: [existing(second!.mediaId), existing(first!.mediaId)],
    });
    expect(coverOf('Chrono Trigger')?.sha256).toBe(sha256(square));

    fx.items.update(token, item.id, { ...draft('Chrono Trigger'), isFavorite: true });
    fx.items.update(token, item.id, draft('Chrono Trigger'), { images: [] });
    expect(coverOf('Chrono Trigger')?.sha256).toBe(sha256(square));
  });

  it('"Use as cover" makes a saved gallery image the cover too, storing it once', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      images: [
        prepared(await prepare('ancha.png', wide)),
        prepared(await prepare('alta.png', tall)),
      ],
    });
    const [, second] = mediaOf(item.id).images;

    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      cover: existing(second!.mediaId),
    });

    const media = mediaOf(item.id);
    expect(media.cover?.mediaId).toBe(second!.mediaId);
    expect(media.images.map((image) => image.sha256)).toEqual([sha256(wide), sha256(tall)]);
    expect(storedFiles()).toHaveLength(2);
  });

  it('"Use as cover" on an image not saved yet stores it once for both', async () => {
    const image = await prepare('ancha.png', wide);

    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      cover: prepared(image, 'optimized_only'),
      images: [prepared(image, 'optimized_only')],
    });

    const media = mediaOf(item.id);
    expect(media.cover?.mediaId).toBe(media.images[0]!.mediaId);
    expect(storedFiles()).toHaveLength(1);
    // The import was used up.
    expectCode(
      () => fx.items.create(token, 'game', draft('Otro'), { cover: prepared(image) }),
      'media.import_expired',
    );
  });

  it('deletes a file only when neither the cover nor the gallery uses it', async () => {
    const image = await prepare('ancha.png', wide);
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      cover: prepared(image),
      images: [prepared(image)],
    });
    const name = `${sha256(wide)}.png`;

    fx.items.update(token, item.id, draft('Chrono Trigger'), { images: [] });
    expect(storedFiles()).toEqual([name]);

    const again = await prepare('ancha.png', wide);
    fx.items.update(token, item.id, draft('Chrono Trigger'), { images: [prepared(again)] });
    fx.items.update(token, item.id, draft('Chrono Trigger'), { cover: null });
    expect(storedFiles()).toEqual([name]);
    expect(mediaOf(item.id).cover).toBeNull();

    fx.items.update(token, item.id, draft('Chrono Trigger'), { images: [] });
    expect(storedFiles()).toEqual([]);
  });

  it('changing the cover deletes the previous one if nothing else uses it', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      cover: prepared(await prepare('ancha.png', wide)),
    });

    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      cover: prepared(await prepare('alta.png', tall)),
    });

    expect(coverOf('Chrono Trigger')?.sha256).toBe(sha256(tall));
    expect(storedFiles()).toEqual([`${sha256(tall)}.png`]);
  });

  it('replaces an optimized cover by its kept original', async () => {
    const big = await pngImage(2400, 1200);
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      cover: prepared(await prepare('grande.png', big), 'optimized_with_original'),
    });
    const optimized = mediaOf(item.id).cover!;
    expect(optimized).toMatchObject({ format: 'webp', width: 2000, hasOriginal: true });

    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      cover: { kind: 'use_original', mediaId: optimized.mediaId },
    });

    expect(mediaOf(item.id).cover).toMatchObject({
      format: 'png',
      width: 2400,
      hasOriginal: false,
    });
    expect(storedFiles()).toEqual([`${sha256(big)}.png`]);
  });

  it.each([
    ['a document', 'media.not_an_image'],
    ['an image of another item', 'media.not_attached'],
  ])('refuses %s as the cover', async (label, code) => {
    const other = fx.items.create(token, 'game', draft('Otro'), {
      cover: prepared(await prepare('alta.png', tall)),
    });
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      cover: prepared(await prepare('ancha.png', wide)),
    });
    const cover =
      label === 'a document'
        ? prepared(await prepare('Manual.pdf', PDF_BYTES))
        : existing(mediaOf(other.id).cover!.mediaId);

    expectCode(() => fx.items.update(token, item.id, draft('Chrono Trigger'), { cover }), code);
    expect(coverOf('Chrono Trigger')?.sha256).toBe(sha256(wide));
  });

  it('saves nothing when the save fails, and the cover import can be used again', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'));
    const image = await prepare('ancha.png', wide);
    const broken: ItemDraft = {
      ...draft('Chrono Trigger'),
      relations: { tag: [{ kind: 'existing', id: 999 }] },
    };

    expectCode(
      () => fx.items.update(token, item.id, broken, { cover: prepared(image) }),
      'catalog.not_found',
    );

    expect(mediaOf(item.id).cover).toBeNull();
    expect(storedFiles()).toEqual([]);
    fx.items.update(token, item.id, draft('Chrono Trigger'), { cover: prepared(image) });
    expect(coverOf('Chrono Trigger')?.sha256).toBe(sha256(wide));
  });

  it('never uses a document as the cover', async () => {
    const item = fx.items.create(token, 'game', draft('Solo manual'));
    const manual = await prepare('Manual.pdf', PDF_BYTES);
    fx.media.commitImport(token, manual.id, item.id, null);

    expect(coverOf('Solo manual')).toBeNull();
  });

  it('shows the cover of items in the trash, and deletes it with the item', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      cover: prepared(await prepare('ancha.png', wide)),
      images: [prepared(await prepare('alta.png', tall))],
    });
    fx.items.moveToTrash(token, item.id);

    expect(fx.items.listTrash(token, null)).toEqual([
      expect.objectContaining({ id: item.id, cover: expect.objectContaining({ width: 40 }) }),
    ]);
    expect(storedFiles()).toHaveLength(2);

    fx.items.deletePermanently(token, item.id);
    expect(storedFiles()).toEqual([]);
  });
});
