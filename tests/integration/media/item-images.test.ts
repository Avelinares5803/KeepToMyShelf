import { createHash } from 'node:crypto';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { ImageStorageChoice } from '../../../src/core/media/import-rules';
import type { ImagePlanEntry, PreparedImport } from '../../../src/shared/media';
import { animatedGif, PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
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

describe('saving an item with its images', () => {
  let fx: ProfileFixture;
  let token: string;
  let profileId: string;
  let images: Buffer[];

  const mediaDir = () => fx.paths.mediaDir(profileId);
  const filesIn = (folder: string): string[] =>
    existsSync(folder)
      ? (readdirSync(folder, { recursive: true }) as string[])
          .filter((path) => statSync(join(folder, path)).isFile())
          .map((path) => basename(path))
          .sort()
      : [];

  const prepare = (name: string, bytes: Uint8Array): Promise<PreparedImport> =>
    fx.media.prepareImport(token, writeFile(fx.scratchDir, name, bytes));
  const prepared = (
    preparation: PreparedImport,
    choice: ImageStorageChoice = 'original',
  ): ImagePlanEntry => ({ kind: 'prepared', preparedId: preparation.id, choice });
  const existing = (mediaId: number): ImagePlanEntry => ({ kind: 'existing', mediaId });
  const listed = (itemId: number) => fx.media.list(token, itemId).images;

  beforeEach(async () => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana' }).profile.id;
    token = fx.sessions.open(profileId).token;
    images ??= await Promise.all([pngImage(30, 20), pngImage(31, 20), pngImage(32, 20)]);
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('creates an item with its images in the given order', async () => {
    const first = await prepare('uno.png', images[0]!);
    const second = await prepare('dos.png', images[1]!);

    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      images: [prepared(second), prepared(first)],
    });

    expect(listed(item.id).map((image) => image.sha256)).toEqual([
      sha256(images[1]!),
      sha256(images[0]!),
    ]);
    // The imports were used up: their temporary files are gone and they cannot be reused.
    expect(filesIn(join(mediaDir(), '.tmp'))).toEqual([]);
    expectCode(
      () => fx.items.create(token, 'game', draft('Otro'), { images: [prepared(first)] }),
      'media.import_expired',
    );
  });

  it('leaves the images alone when the item is saved without a list', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      images: [prepared(await prepare('uno.png', images[0]!))],
    });

    fx.items.update(token, item.id, { ...draft('Chrono Trigger'), isFavorite: true });

    expect(listed(item.id)).toHaveLength(1);
  });

  it('reorders, adds and removes images, deleting the files nothing uses', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      images: [
        prepared(await prepare('uno.png', images[0]!)),
        prepared(await prepare('dos.png', images[1]!)),
      ],
    });
    const [one, two] = listed(item.id);
    const three = await prepare('tres.png', images[2]!);

    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      images: [prepared(three), existing(two!.mediaId)],
    });

    expect(listed(item.id).map((image) => image.sha256)).toEqual([sha256(images[2]!), two!.sha256]);
    expect(filesIn(join(mediaDir(), 'files'))).not.toContain(`${one!.sha256}.png`);
    expect(filesIn(join(mediaDir(), 'files'))).toHaveLength(2);
  });

  it('keeps the documents when the images change', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'));
    const manual = await prepare('Manual.pdf', PDF_BYTES);
    fx.media.commitImport(token, manual.id, item.id, null);

    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      images: [prepared(await prepare('uno.png', images[0]!))],
    });
    fx.items.update(token, item.id, draft('Chrono Trigger'), { images: [] });

    expect(fx.media.list(token, item.id)).toMatchObject({
      images: [],
      documents: [{ label: 'Manual' }],
    });
  });

  it('replaces an optimized image by its kept original', async () => {
    const big = await pngImage(2400, 1200);
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      images: [prepared(await prepare('grande.png', big), 'optimized_with_original')],
    });
    const [optimized] = listed(item.id);
    expect(optimized).toMatchObject({ format: 'webp', width: 2000, hasOriginal: true });

    fx.items.update(token, item.id, draft('Chrono Trigger'), {
      images: [{ kind: 'use_original', mediaId: optimized!.mediaId }],
    });

    expect(listed(item.id)).toMatchObject([
      { format: 'png', width: 2400, height: 1200, hasOriginal: false, isMissing: false },
    ]);
    expect(filesIn(join(mediaDir(), 'files'))).toEqual([`${sha256(big)}.png`]);
    expect(filesIn(join(mediaDir(), 'originals'))).toEqual([]);
  });

  it('refuses to use the original of an image that has none, or whose original is gone', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      images: [
        prepared(await prepare('uno.png', images[0]!)),
        prepared(await prepare('dos.png', images[1]!), 'optimized_with_original'),
      ],
    });
    const [plain, optimized] = listed(item.id);

    expectCode(
      () =>
        fx.items.update(token, item.id, draft('Chrono Trigger'), {
          images: [{ kind: 'use_original', mediaId: plain!.mediaId }],
        }),
      'media.no_original',
    );
    rmSync(join(mediaDir(), 'originals'), { recursive: true });
    expectCode(
      () =>
        fx.items.update(token, item.id, draft('Chrono Trigger'), {
          images: [{ kind: 'use_original', mediaId: optimized!.mediaId }],
        }),
      'media.original_missing',
    );
    expect(listed(item.id)).toHaveLength(2);
  });

  it('saves nothing when the save fails, and the imports can be used again', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'));
    const image = await prepare('uno.png', images[0]!);
    // A catalog value that no longer exists makes the item's own update fail.
    const broken: ItemDraft = {
      ...draft('Chrono Trigger'),
      relations: { tag: [{ kind: 'existing', id: 999 }] },
    };

    expectCode(
      () => fx.items.update(token, item.id, broken, { images: [prepared(image)] }),
      'catalog.not_found',
    );

    expect(listed(item.id)).toEqual([]);
    expect(filesIn(join(mediaDir(), 'files'))).toEqual([]);
    fx.items.update(token, item.id, draft('Chrono Trigger'), { images: [prepared(image)] });
    expect(listed(item.id)).toHaveLength(1);
  });

  it('creates no item when its images are refused', async () => {
    const animated = await prepare('animada.gif', await animatedGif(8, 8));

    expectCode(
      () =>
        fx.items.create(token, 'game', draft('Chrono Trigger'), {
          images: [prepared(animated, 'optimized_only')],
        }),
      'media.animated_original_only',
    );

    expect(fx.items.list(token, 'game')).toEqual([]);
  });

  it.each([
    ['the same image twice', 'media.already_attached'],
    ['an image of another item', 'media.not_attached'],
    ['a document', 'media.not_an_image'],
  ])('refuses a list with %s', async (label, code) => {
    const other = fx.items.create(token, 'game', draft('Otro'), {
      images: [prepared(await prepare('otro.png', images[2]!))],
    });
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), {
      images: [prepared(await prepare('uno.png', images[0]!))],
    });
    const [mine] = listed(item.id);

    const plans: Record<string, () => Promise<ImagePlanEntry[]>> = {
      'the same image twice': async () => [existing(mine!.mediaId), existing(mine!.mediaId)],
      'an image of another item': async () => [existing(listed(other.id)[0]!.mediaId)],
      'a document': async () => [prepared(await prepare('Manual.pdf', PDF_BYTES))],
    };
    const plan = await plans[label]!();

    expectCode(
      () => fx.items.update(token, item.id, draft('Chrono Trigger'), { images: plan }),
      code,
    );
    expect(listed(item.id).map((image) => image.mediaId)).toEqual([mine!.mediaId]);
  });

  it('optimizes to the size chosen in the profile settings', async () => {
    fx.settings.setForProfile(profileId, { key: 'optimizedMaxSide', value: 1280 });

    const preparation = await prepare('grande.png', await pngImage(2400, 1200));

    expect(preparation).toMatchObject({
      fitsOptimizedSize: false,
      optimized: { width: 1280, height: 640 },
    });
  });

  it('prepares several files, reporting the ones it refuses', async () => {
    const paths = [
      writeFile(fx.scratchDir, 'buena.png', images[0]!),
      writeFile(fx.scratchDir, 'falsa.png', Buffer.from('no soy una imagen')),
      join(fx.scratchDir, 'borrada.png'),
      writeFile(fx.scratchDir, 'Manual.pdf', PDF_BYTES),
    ];

    const result = await fx.media.prepareMany(token, paths, 'image');

    expect(result.prepared.map((p) => p.fileName)).toEqual(['buena.png']);
    expect(result.rejected).toEqual([
      { fileName: 'falsa.png', code: 'media.unsupported_format' },
      { fileName: 'borrada.png', code: 'media.source_unreadable' },
      { fileName: 'Manual.pdf', code: 'media.not_an_image' },
    ]);
    // A refused file leaves nothing prepared behind.
    expect(readdirSync(join(mediaDir(), '.tmp'))).toEqual([result.prepared[0]!.id]);
  });

  it('drops imports that were not saved when the profile closes', async () => {
    const image = await prepare('uno.png', images[0]!);
    expect(filesIn(join(mediaDir(), '.tmp')).length).toBeGreaterThan(0);

    fx.sessions.closeCurrent();

    expect(existsSync(join(mediaDir(), '.tmp'))).toBe(false);
    const newToken = fx.sessions.open(profileId).token;
    expectCode(
      () =>
        fx.items.create(newToken, 'game', draft('Chrono Trigger'), {
          images: [{ kind: 'prepared', preparedId: image.id, choice: 'original' }],
        }),
      'media.import_expired',
    );
  });

  it('serves the thumbnail of a prepared import only to the open session', async () => {
    const image = await prepare('uno.png', images[0]!);

    await expect(fx.media.readPreparedThumbnail(image.id, 320)).resolves.toMatchObject({
      mimeType: 'image/webp',
    });

    fx.media.discardImports(token, [image.id]);
    await expect(fx.media.readPreparedThumbnail(image.id, 320)).resolves.toBeNull();
  });
});
