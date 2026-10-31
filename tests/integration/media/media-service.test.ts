import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import {
  DEFAULT_MEDIA_LIMITS,
  type ImageStorageChoice,
} from '../../../src/core/media/import-rules';
import { MediaService } from '../../../src/main/application/media-service';
import type { MediaAttachment } from '../../../src/shared/media';
import {
  animatedGif,
  PDF_BYTES,
  pngImage,
  rotatedJpeg,
  SVG_BYTES,
  writeFile,
} from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function expectCode(run: () => unknown, code: string): Promise<void> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  expect.fail(`Expected error "${code}"`);
}

describe('MediaService', () => {
  let fx: ProfileFixture;
  let token: string;
  let profileId: string;
  let bigPng: Buffer;

  const mediaDir = () => fx.paths.mediaDir(profileId);
  const cacheDir = () => fx.paths.cacheDir(profileId);

  /** Names of the files inside a folder of the profile, at any depth. */
  const filesIn = (folder: string): string[] =>
    existsSync(folder)
      ? (readdirSync(folder, { recursive: true }) as string[])
          .filter((path) => statSync(join(folder, path)).isFile())
          .map((path) => basename(path))
          .sort()
      : [];

  const newItem = (title = 'Chrono Trigger') =>
    fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title }).id;

  const prepare = (name: string, bytes: Uint8Array) =>
    fx.media.prepareImport(token, writeFile(fx.scratchDir, name, bytes));

  async function attach(
    itemId: number,
    name: string,
    bytes: Uint8Array,
    choice: ImageStorageChoice | null = 'original',
  ): Promise<MediaAttachment> {
    const prepared = await prepare(name, bytes);
    return fx.media.commitImport(token, prepared.id, itemId, choice);
  }

  const imageIds = (itemId: number) => fx.media.list(token, itemId).images.map((m) => m.mediaId);

  beforeEach(async () => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana' }).profile.id;
    token = fx.sessions.open(profileId).token;
    bigPng ??= await pngImage(3000, 1500);
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('preparing an import', () => {
    it('describes the image and its optimized copy without storing anything yet', async () => {
      const prepared = await prepare('portada.png', bigPng);

      expect(prepared).toMatchObject({
        fileName: 'portada.png',
        kind: 'image',
        format: 'png',
        byteSize: bigPng.length,
        width: 3000,
        height: 1500,
        isAnimated: false,
        fitsOptimizedSize: false,
        optimized: { width: 2000, height: 1000 },
      });
      expect(prepared.optimized!.byteSize).toBeGreaterThan(0);
      expect(filesIn(join(mediaDir(), 'files'))).toEqual([]);
      expect(filesIn(join(mediaDir(), 'originals'))).toEqual([]);
    });

    it('never enlarges an image that already fits, and says so', async () => {
      const prepared = await prepare('pequeña.png', await pngImage(300, 120));

      expect(prepared.fitsOptimizedSize).toBe(true);
      expect(prepared.optimized).toMatchObject({ width: 300, height: 120 });
    });

    it('judges the format by the content, not by the extension', async () => {
      const prepared = await prepare('en-realidad-es-png.jpg', await pngImage(10, 10));
      expect(prepared.format).toBe('png');
    });

    it('applies the EXIF orientation to the reported size', async () => {
      const prepared = await prepare('girada.jpg', await rotatedJpeg(40, 20));
      expect(prepared).toMatchObject({ format: 'jpeg', width: 20, height: 40 });
      expect(prepared.optimized).toMatchObject({ width: 20, height: 40 });
    });

    it('offers no optimized copy of an animated image', async () => {
      const prepared = await prepare('animada.gif', await animatedGif(12, 8));
      expect(prepared).toMatchObject({ format: 'gif', isAnimated: true, optimized: null });
      expect(prepared).toMatchObject({ width: 12, height: 8 });
    });

    it('accepts PDF documents as they are', async () => {
      const prepared = await prepare('Manual.pdf', PDF_BYTES);
      expect(prepared).toMatchObject({
        kind: 'document',
        format: 'pdf',
        width: null,
        height: null,
        optimized: null,
        fitsOptimizedSize: false,
      });
    });

    it.each([
      ['an SVG renamed as PNG', 'dibujo.png', SVG_BYTES],
      ['a text file', 'notas.jpg', Buffer.from('Esto no es una imagen')],
      ['an empty file', 'vacía.png', Buffer.alloc(0)],
    ])('rejects %s', async (_label, name, bytes) => {
      await expectCode(() => prepare(name, bytes), 'media.unsupported_format');
    });

    it('rejects a damaged image whose signature looks fine', async () => {
      const truncated = (await pngImage(200, 200)).subarray(0, 200);
      await expectCode(() => prepare('rota.png', truncated), 'media.unreadable');
    });

    it('rejects a file that cannot be opened', async () => {
      await expectCode(
        () => fx.media.prepareImport(token, join(fx.scratchDir, 'no-existe.png')),
        'media.source_unreadable',
      );
      const folder = join(fx.scratchDir, 'carpeta.png');
      mkdirSync(folder);
      await expectCode(() => fx.media.prepareImport(token, folder), 'media.source_unreadable');
    });

    it('applies the size limit of each kind', async () => {
      const strict = new MediaService({
        sessions: fx.sessions,
        paths: fx.paths,
        now: () => new Date(),
        limits: { ...DEFAULT_MEDIA_LIMITS, maxImageBytes: 100, maxDocumentBytes: 1000 },
      });
      const image = writeFile(fx.scratchDir, 'grande.png', await pngImage(20, 20));
      const pdf = writeFile(fx.scratchDir, 'pequeño.pdf', PDF_BYTES);

      await expectCode(() => strict.prepareImport(token, image), 'media.too_large');
      await expect(strict.prepareImport(token, pdf)).resolves.toMatchObject({ kind: 'document' });
    });

    it('stores the bytes read when preparing, even if the chosen file changes afterwards', async () => {
      const path = writeFile(fx.scratchDir, 'cambia.png', await pngImage(10, 10));
      const prepared = await fx.media.prepareImport(token, path);
      writeFile(fx.scratchDir, 'cambia.png', await pngImage(30, 30));

      const stored = fx.media.commitImport(token, prepared.id, newItem(), 'original');
      expect(stored).toMatchObject({ width: 10, height: 10 });
    });

    it('is refused once the profile has been closed or switched', async () => {
      const path = writeFile(fx.scratchDir, 'portada.png', await pngImage(10, 10));
      const prepared = await fx.media.prepareImport(token, path);
      const itemId = newItem();

      const newToken = fx.sessions.open(profileId).token;
      await expectCode(() => fx.media.prepareImport(token, path), 'session.stale');
      await expectCode(
        () => fx.media.commitImport(token, prepared.id, itemId, 'original'),
        'session.stale',
      );
      // Opening the profile again discarded the half-finished import.
      await expectCode(
        () => fx.media.commitImport(newToken, prepared.id, itemId, 'original'),
        'media.import_expired',
      );
      expect(filesIn(join(mediaDir(), '.tmp'))).toEqual([]);
    });

    it('can be discarded, removing its temporary files', async () => {
      const prepared = await prepare('portada.png', bigPng);
      expect(filesIn(join(mediaDir(), '.tmp')).length).toBeGreaterThan(0);

      fx.media.discardImport(token, prepared.id);

      expect(filesIn(join(mediaDir(), '.tmp'))).toEqual([]);
      await expectCode(
        () => fx.media.commitImport(token, prepared.id, newItem(), 'original'),
        'media.import_expired',
      );
    });
  });

  describe('saving an import', () => {
    it('keeps the original byte for byte and makes thumbnails with its proportions', async () => {
      const media = await attach(newItem(), 'portada.png', bigPng, 'original');
      const sha = sha256(bigPng);

      expect(media).toMatchObject({
        kind: 'image',
        format: 'png',
        sha256: sha,
        byteSize: bigPng.length,
        width: 3000,
        height: 1500,
        hasOriginal: false,
        isMissing: false,
        label: null,
      });
      const stored = join(mediaDir(), 'files', sha.slice(0, 2), `${sha}.png`);
      expect(readFileSync(stored).equals(bigPng)).toBe(true);
      expect(filesIn(join(mediaDir(), 'originals'))).toEqual([]);

      for (const [size, width, height] of [
        [320, 320, 160],
        [640, 640, 320],
      ] as const) {
        const thumbnail = join(cacheDir(), 'thumbs', sha.slice(0, 2), `${sha}-${size}.webp`);
        const metadata = await sharp(readFileSync(thumbnail)).metadata();
        expect(metadata).toMatchObject({ format: 'webp', width, height });
      }
      expect(filesIn(join(mediaDir(), '.tmp'))).toEqual([]);
    });

    it('uses an optimized WebP copy and keeps the original apart', async () => {
      const media = await attach(newItem(), 'portada.png', bigPng, 'optimized_with_original');

      expect(media).toMatchObject({ format: 'webp', width: 2000, height: 1000, hasOriginal: true });
      expect(filesIn(join(mediaDir(), 'files'))).toEqual([`${media.sha256}.webp`]);
      expect(filesIn(join(mediaDir(), 'originals'))).toEqual([`${sha256(bigPng)}.png`]);
    });

    it('can keep only the optimized copy', async () => {
      const media = await attach(newItem(), 'portada.png', bigPng, 'optimized_only');

      expect(media).toMatchObject({ format: 'webp', hasOriginal: false });
      expect(filesIn(join(mediaDir(), 'files'))).toEqual([`${media.sha256}.webp`]);
      expect(filesIn(join(mediaDir(), 'originals'))).toEqual([]);
    });

    it('drops the EXIF orientation by applying it to the optimized copy', async () => {
      const media = await attach(
        newItem(),
        'girada.jpg',
        await rotatedJpeg(40, 20),
        'optimized_only',
      );
      const stored = join(mediaDir(), 'files', media.sha256.slice(0, 2), `${media.sha256}.webp`);
      const metadata = await sharp(readFileSync(stored)).metadata();

      expect(metadata).toMatchObject({ width: 20, height: 40 });
      expect(metadata.orientation).toBeUndefined();
    });

    it('needs a choice for images and only allows the original of an animated one', async () => {
      const itemId = newItem();
      const still = await prepare('portada.png', bigPng);
      await expectCode(
        () => fx.media.commitImport(token, still.id, itemId, null),
        'media.choice_required',
      );
      // A refused choice keeps the prepared import, so the user can choose again.
      expect(fx.media.commitImport(token, still.id, itemId, 'optimized_only').format).toBe('webp');

      const animated = await prepare('animada.gif', await animatedGif(12, 8));
      await expectCode(
        () => fx.media.commitImport(token, animated.id, itemId, 'optimized_only'),
        'media.animated_original_only',
      );
      expect(fx.media.commitImport(token, animated.id, itemId, 'original')).toMatchObject({
        format: 'gif',
        isAnimated: true,
      });
    });

    it('names a document after its file and keeps it in its own list', async () => {
      const itemId = newItem();
      await attach(itemId, 'portada.png', bigPng);
      const manual = await attach(itemId, 'Manual de instrucciones.pdf', PDF_BYTES, null);

      expect(manual).toMatchObject({ kind: 'document', label: 'Manual de instrucciones.pdf' });
      const { images, documents } = fx.media.list(token, itemId);
      expect(images).toHaveLength(1);
      expect(documents.map((m) => m.mediaId)).toEqual([manual.mediaId]);
      expect(filesIn(join(cacheDir(), 'thumbs'))).toHaveLength(2);
    });

    it('stores a file once even when several items use it', async () => {
      const first = await attach(newItem('Uno'), 'portada.png', bigPng);
      const second = await attach(newItem('Dos'), 'copia.png', bigPng);

      expect(second.mediaId).toBe(first.mediaId);
      expect(filesIn(join(mediaDir(), 'files'))).toHaveLength(1);
    });

    it('refuses to add the same file twice to one item', async () => {
      const itemId = newItem();
      await attach(itemId, 'portada.png', bigPng);
      await expectCode(() => attach(itemId, 'otra-vez.png', bigPng), 'media.already_attached');
      expect(imageIds(itemId)).toHaveLength(1);
    });

    it('makes an identical copy when the same bytes are needed in both folders', async () => {
      await attach(newItem('Uno'), 'portada.png', bigPng, 'original');
      await attach(newItem('Dos'), 'portada.png', bigPng, 'optimized_with_original');

      const name = `${sha256(bigPng)}.png`;
      expect(filesIn(join(mediaDir(), 'files'))).toContain(name);
      expect(filesIn(join(mediaDir(), 'originals'))).toEqual([name]);
    });

    it('refuses items that do not exist or are in the trash', async () => {
      const prepared = await prepare('portada.png', bigPng);
      await expectCode(
        () => fx.media.commitImport(token, prepared.id, 999, 'original'),
        'item.not_found',
      );
      const itemId = newItem();
      fx.items.moveToTrash(token, itemId);
      await expectCode(
        () => fx.media.commitImport(token, prepared.id, itemId, 'original'),
        'item.in_trash',
      );
    });
  });

  describe('order and cover', () => {
    let itemId: number;
    let ids: number[];

    beforeEach(async () => {
      itemId = newItem();
      ids = [];
      for (const size of [10, 11, 12]) {
        ids.push((await attach(itemId, `imagen-${size}.png`, await pngImage(size, size))).mediaId);
      }
    });

    it('keeps images in the order they were added: the first one is the cover', () => {
      expect(imageIds(itemId)).toEqual(ids);
    });

    it('"Use as cover" moves an image to the first place', () => {
      fx.media.setCover(token, itemId, ids[2]!);
      expect(imageIds(itemId)).toEqual([ids[2], ids[0], ids[1]]);
    });

    it('accepts any order that lists every image once', () => {
      fx.media.reorder(token, itemId, 'image', [ids[1]!, ids[2]!, ids[0]!]);
      expect(imageIds(itemId)).toEqual([ids[1], ids[2], ids[0]]);
    });

    it.each([
      ['a missing image', (all: number[]) => all.slice(1)],
      ['a repeated image', (all: number[]) => [all[0]!, all[0]!, all[1]!]],
      ['a file of another item', (all: number[]) => [all[0]!, all[1]!, 999]],
    ])('rejects an order with %s', async (_label, order) => {
      await expectCode(
        () => fx.media.reorder(token, itemId, 'image', order(ids)),
        'media.invalid_order',
      );
      expect(imageIds(itemId)).toEqual(ids);
    });

    it('orders documents apart from images, and never makes one the cover', async () => {
      const pdf = await attach(itemId, 'Guía.pdf', PDF_BYTES, null);
      await expectCode(
        () => fx.media.setCover(token, itemId, pdf.mediaId),
        'media.cover_must_be_image',
      );
      await expectCode(
        () => fx.media.reorder(token, itemId, 'image', [...ids, pdf.mediaId]),
        'media.invalid_order',
      );
      fx.media.reorder(token, itemId, 'document', [pdf.mediaId]);
      expect(imageIds(itemId)).toEqual(ids);
    });

    it('refuses files the item does not have', async () => {
      await expectCode(() => fx.media.setCover(token, itemId, 999), 'media.not_attached');
      await expectCode(() => fx.media.detach(token, itemId, 999), 'media.not_attached');
    });

    it('cannot change the files of an item in the trash', async () => {
      fx.items.moveToTrash(token, itemId);
      await expectCode(() => fx.media.setCover(token, itemId, ids[1]!), 'item.in_trash');
      await expectCode(() => fx.media.detach(token, itemId, ids[1]!), 'item.in_trash');
      // It can still be looked at.
      expect(imageIds(itemId)).toEqual(ids);
    });
  });

  describe('removing files nothing uses', () => {
    it('keeps a file while another item still uses it', async () => {
      const first = newItem('Uno');
      const second = newItem('Dos');
      const media = await attach(first, 'portada.png', bigPng);
      await attach(second, 'portada.png', bigPng);

      fx.media.detach(token, first, media.mediaId);
      expect(filesIn(join(mediaDir(), 'files'))).toHaveLength(1);

      fx.media.detach(token, second, media.mediaId);
      expect(filesIn(join(mediaDir(), 'files'))).toEqual([]);
      expect(filesIn(join(cacheDir(), 'thumbs'))).toEqual([]);
    });

    it('removes an optimized copy together with its original', async () => {
      const itemId = newItem();
      const media = await attach(itemId, 'portada.png', bigPng, 'optimized_with_original');

      fx.media.detach(token, itemId, media.mediaId);

      expect(filesIn(join(mediaDir(), 'files'))).toEqual([]);
      expect(filesIn(join(mediaDir(), 'originals'))).toEqual([]);
    });

    it('keeps the files of an item in the trash and removes them when it is deleted', async () => {
      const kept = newItem('Se queda');
      const deleted = newItem('Se borra');
      await attach(kept, 'compartida.png', bigPng);
      await attach(deleted, 'compartida.png', bigPng);
      await attach(deleted, 'propia.pdf', PDF_BYTES, null);

      fx.items.moveToTrash(token, deleted);
      expect(filesIn(join(mediaDir(), 'files'))).toHaveLength(2);

      fx.items.deletePermanently(token, deleted);
      expect(filesIn(join(mediaDir(), 'files'))).toEqual([`${sha256(bigPng)}.png`]);
    });

    it('removes the files of the items deleted by emptying the trash', async () => {
      const itemId = newItem();
      await attach(itemId, 'portada.png', bigPng, 'optimized_with_original');
      fx.items.moveToTrash(token, itemId);

      expect(fx.items.emptyTrash(token, null)).toBe(1);

      expect(filesIn(join(mediaDir(), 'files'))).toEqual([]);
      expect(filesIn(join(mediaDir(), 'originals'))).toEqual([]);
      expect(filesIn(join(cacheDir(), 'thumbs'))).toEqual([]);
    });

    it('cleans up when the profile opens, leaving files it did not create alone', async () => {
      const itemId = newItem();
      const used = await attach(itemId, 'portada.png', bigPng);
      // Left behind by a crash: a stored file without a row, and an unfinished import.
      const strayFolder = join(mediaDir(), 'files', 'ff');
      mkdirSync(strayFolder, { recursive: true });
      writeFile(strayFolder, `${'f'.repeat(64)}.png`, bigPng);
      await prepare('a-medias.png', bigPng);
      // Not named like a stored file: never touched.
      writeFile(strayFolder, 'nota del usuario.txt', Buffer.from('hola'));

      fx.sessions.open(profileId);

      expect(filesIn(join(mediaDir(), 'files'))).toEqual([
        `${used.sha256}.png`,
        'nota del usuario.txt',
      ]);
      expect(filesIn(join(mediaDir(), '.tmp'))).toEqual([]);
    });
  });

  it('reports a file deleted by hand without failing', async () => {
    const itemId = newItem();
    const media = await attach(itemId, 'portada.png', bigPng);
    rmSync(join(mediaDir(), 'files', media.sha256.slice(0, 2), `${media.sha256}.png`));

    expect(fx.media.list(token, itemId).images).toMatchObject([
      { mediaId: media.mediaId, isMissing: true },
    ]);
  });
});
