import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors';
import type { ImageStorageChoice } from '../../../src/core/media/import-rules';
import type { ImportedBackground } from '../../../src/shared/backgrounds';
import { NO_BACKGROUND } from '../../../src/shared/settings';
import { animatedGif, PDF_BYTES, pngImage, SVG_BYTES, writeFile } from '../../support/media-files';
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

describe('BackgroundService', () => {
  let fx: ProfileFixture;
  let anaId: string;
  let beaId: string;
  let widePng: Buffer;

  const dir = () => fx.paths.backgroundsDir;

  /** Names of the files inside a folder of the gallery, at any depth. */
  const filesIn = (folder: string): string[] =>
    existsSync(join(dir(), folder))
      ? (readdirSync(join(dir(), folder), { recursive: true }) as string[])
          .filter((path) => statSync(join(dir(), folder, path)).isFile())
          .map((path) => basename(path))
          .sort()
      : [];

  const pick = (name: string, bytes: Uint8Array, token: string | null = null) =>
    fx.backgrounds.prepareMany(token, [writeFile(fx.scratchDir, name, bytes)]);

  async function importBackground(
    name: string,
    bytes: Uint8Array,
    choice: ImageStorageChoice = 'original',
  ): Promise<ImportedBackground> {
    const { prepared } = await pick(name, bytes);
    return fx.backgrounds.commitImport(prepared[0]!.id, choice);
  }

  beforeEach(async () => {
    fx = createProfileFixture();
    anaId = fx.profiles.create({ name: 'Ana' }).profile.id;
    beaId = fx.profiles.create({ name: 'Bea' }).profile.id;
    // A small optimized size keeps the test images small.
    fx.settings.setGlobal({ key: 'backgroundMaxSide', value: 1920 });
    widePng ??= await pngImage(2400, 1200);
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('importing', () => {
    it('works with no profile open, using the global optimized size', async () => {
      const { prepared, rejected } = await pick('playa.png', widePng);

      expect(rejected).toEqual([]);
      expect(prepared).toEqual([
        expect.objectContaining({
          fileName: 'playa.png',
          kind: 'image',
          format: 'png',
          width: 2400,
          height: 1200,
          fitsOptimizedSize: false,
          optimized: expect.objectContaining({ width: 1920, height: 960 }),
        }),
      ]);
    });

    it("uses the open profile's optimized size when a token is given", async () => {
      fx.settings.setForProfile(anaId, { key: 'backgroundMaxSide', value: 2560 });
      const { token } = fx.sessions.open(anaId);

      const { prepared } = await pick('playa.png', widePng, token);

      expect(prepared[0]).toMatchObject({ fitsOptimizedSize: true, optimized: { width: 2400 } });
    });

    it('rejects a stale token before preparing anything', async () => {
      const { token } = fx.sessions.open(anaId);
      fx.sessions.closeCurrent();

      await expectCode(() => pick('playa.png', widePng, token), 'session.stale');
      expect(filesIn('.tmp')).toEqual([]);
    });

    it('refuses documents and files that are not accepted images, keeping the others', async () => {
      const result = await fx.backgrounds.prepareMany(null, [
        writeFile(fx.scratchDir, 'manual.pdf', PDF_BYTES),
        writeFile(fx.scratchDir, 'dibujo.svg', SVG_BYTES),
        writeFile(fx.scratchDir, 'playa.png', widePng),
      ]);

      expect(result.rejected).toEqual([
        { fileName: 'manual.pdf', code: 'media.not_an_image' },
        { fileName: 'dibujo.svg', code: 'media.unsupported_format' },
      ]);
      expect(result.prepared.map((p) => p.fileName)).toEqual(['playa.png']);
    });

    it('keeps the original exactly as chosen', async () => {
      const background = await importBackground('playa.png', widePng, 'original');

      expect(background).toMatchObject({
        sha256: sha256(widePng),
        format: 'png',
        width: 2400,
        height: 1200,
        hasOriginal: false,
        isMissing: false,
        profileCount: 0,
      });
      const stored = join(
        dir(),
        'files',
        background.sha256.slice(0, 2),
        `${background.sha256}.png`,
      );
      expect(readFileSync(stored).equals(widePng)).toBe(true);
      expect(filesIn('cache')).toEqual([
        `${background.sha256}-320.webp`,
        `${background.sha256}-640.webp`,
      ]);
      expect(filesIn('.tmp')).toEqual([]);
    });

    it('uses an optimized WebP copy and keeps the original apart', async () => {
      const background = await importBackground('playa.png', widePng, 'optimized_with_original');

      expect(background).toMatchObject({
        format: 'webp',
        width: 1920,
        height: 960,
        hasOriginal: true,
      });
      expect(filesIn('files')).toEqual([`${background.sha256}.webp`]);
      expect(filesIn('originals')).toEqual([`${sha256(widePng)}.png`]);
      const stored = readFileSync(
        join(dir(), 'files', background.sha256.slice(0, 2), `${background.sha256}.webp`),
      );
      expect(await sharp(stored).metadata()).toMatchObject({ format: 'webp', width: 1920 });
    });

    it('uses only the optimized copy when asked', async () => {
      const background = await importBackground('playa.png', widePng, 'optimized_only');

      expect(background).toMatchObject({ format: 'webp', hasOriginal: false });
      expect(filesIn('originals')).toEqual([]);
    });

    it('keeps animated images only as the original', async () => {
      const gif = await animatedGif(40, 20);
      const { prepared } = await pick('animado.gif', gif);

      await expectCode(
        () => fx.backgrounds.commitImport(prepared[0]!.id, 'optimized_only'),
        'media.animated_original_only',
      );
      expect(fx.backgrounds.commitImport(prepared[0]!.id, 'original')).toMatchObject({
        format: 'gif',
        isAnimated: true,
      });
    });

    it('never stores the same image twice', async () => {
      const first = await importBackground('playa.png', widePng);
      const again = await importBackground('copia.png', widePng);

      expect(again.id).toBe(first.id);
      expect(fx.backgrounds.list()).toHaveLength(1);
    });

    it('forgets an import once it is saved or discarded', async () => {
      const { prepared } = await pick('playa.png', widePng);
      const { prepared: other } = await pick('otra.png', await pngImage(300, 200));
      fx.backgrounds.discardImports([other[0]!.id]);
      // Only the other one is left: its source, its optimized copy and two thumbnails.
      expect(filesIn('.tmp')).toHaveLength(4);

      fx.backgrounds.commitImport(prepared[0]!.id, 'original');
      await expectCode(
        () => fx.backgrounds.commitImport(prepared[0]!.id, 'original'),
        'media.import_expired',
      );
      await expectCode(
        () => fx.backgrounds.commitImport(other[0]!.id, 'original'),
        'media.import_expired',
      );
      expect(filesIn('.tmp')).toEqual([]);
    });

    it('keeps imports when a profile opens or closes: they belong to no profile', async () => {
      const { prepared } = await pick('playa.png', widePng);
      fx.sessions.open(anaId);
      fx.sessions.closeCurrent();

      expect(fx.backgrounds.commitImport(prepared[0]!.id, 'original').width).toBe(2400);
    });

    it('serves the thumbnail of an import not saved yet', async () => {
      const { prepared } = await pick('playa.png', widePng);

      const thumbnail = await fx.backgrounds.readPreparedThumbnail(prepared[0]!.id, 320);
      expect(await sharp(thumbnail!.bytes).metadata()).toMatchObject({ width: 320, height: 160 });
      expect(await fx.backgrounds.readPreparedThumbnail(randomUUID(), 320)).toBeNull();
    });
  });

  describe('the gallery', () => {
    it('lists the backgrounds oldest first, with how many profiles show each', async () => {
      const playa = await importBackground('playa.png', widePng);
      const bosque = await importBackground('bosque.png', await pngImage(300, 200));
      fx.settings.setGlobal({ key: 'background', value: { kind: 'imported', id: playa.id } });
      fx.settings.setForProfile(beaId, {
        key: 'background',
        value: { kind: 'imported', id: bosque.id },
      });

      expect(fx.backgrounds.list().map((b) => [b.id, b.profileCount])).toEqual([
        [playa.id, 1],
        [bosque.id, 1],
      ]);
    });

    it('marks a background whose file was deleted by hand', async () => {
      const background = await importBackground('playa.png', widePng);
      rmSync(join(dir(), 'files'), { recursive: true });

      expect(fx.backgrounds.list()[0]).toMatchObject({ id: background.id, isMissing: true });
    });
  });

  describe('deleting', () => {
    it('sends every profile that used it back to no background, and nobody else', async () => {
      const playa = await importBackground('playa.png', widePng);
      const bosque = await importBackground('bosque.png', await pngImage(300, 200));
      const usePlaya = { kind: 'imported', id: playa.id } as const;
      fx.settings.setGlobal({ key: 'background', value: usePlaya });
      fx.settings.setForProfile(anaId, { key: 'background', value: usePlaya });
      fx.settings.setForProfile(beaId, {
        key: 'background',
        value: { kind: 'imported', id: bosque.id },
      });
      fx.settings.setForProfile(anaId, { key: 'backgroundBlur', value: 20 });

      fx.backgrounds.delete(playa.id);

      // Stored as no background, not left pointing at a background that no longer exists.
      const stored = fx.appDb
        .prepare(
          `SELECT value FROM app_setting WHERE key = 'background'
           UNION ALL SELECT value FROM profile_setting WHERE key = 'background' AND profile_id = ?`,
        )
        .pluck()
        .all(anaId);
      expect(stored).toEqual([JSON.stringify(NO_BACKGROUND), JSON.stringify(NO_BACKGROUND)]);
      expect(fx.settings.getGlobal().background).toEqual(NO_BACKGROUND);
      expect(fx.settings.getForProfile(anaId)).toMatchObject({
        background: NO_BACKGROUND,
        backgroundBlur: 20,
      });
      expect(fx.settings.getForProfile(beaId).background).toEqual({
        kind: 'imported',
        id: bosque.id,
      });
      expect(fx.backgrounds.list().map((b) => b.id)).toEqual([bosque.id]);
    });

    it('removes its files, its kept original and its thumbnails', async () => {
      const background = await importBackground('playa.png', widePng, 'optimized_with_original');

      fx.backgrounds.delete(background.id);

      expect(filesIn('files')).toEqual([]);
      expect(filesIn('originals')).toEqual([]);
      expect(filesIn('cache')).toEqual([]);
      expect(fx.appDb.prepare('SELECT COUNT(*) FROM background_file').pluck().get()).toBe(0);
    });

    it('fails for a background that does not exist, changing nothing', async () => {
      const background = await importBackground('playa.png', widePng, 'optimized_with_original');
      const originalId = fx.appDb
        .prepare("SELECT id FROM background_file WHERE store = 'originals'")
        .pluck()
        .get() as number;

      await expectCode(() => fx.backgrounds.delete(999), 'background.not_found');
      // A kept original is not a background of the gallery.
      await expectCode(() => fx.backgrounds.delete(originalId), 'background.not_found');
      expect(fx.backgrounds.list().map((b) => b.id)).toEqual([background.id]);
    });
  });

  describe('housekeeping at startup', () => {
    it('drops imports left half-way and files nothing uses, never other files', async () => {
      const background = await importBackground('playa.png', widePng);
      await pick('a-medias.png', await pngImage(300, 200));
      const stray = writeFile(
        mkdirAndReturn(join(dir(), 'files', 'cd')),
        `${'cd'.repeat(32)}.png`,
        widePng,
      );
      const userFile = writeFile(join(dir(), 'files', 'cd'), 'mis-notas.txt', PDF_BYTES);

      fx.backgrounds.onStartup();

      expect(filesIn('.tmp')).toEqual([]);
      expect(existsSync(stray)).toBe(false);
      expect(existsSync(userFile)).toBe(true);
      expect(fx.backgrounds.list().map((b) => b.id)).toEqual([background.id]);
    });
  });

  describe('preferences', () => {
    it('refuses an imported background that does not exist', async () => {
      await expectCode(
        () => fx.settings.setGlobal({ key: 'background', value: { kind: 'imported', id: 42 } }),
        'background.not_found',
      );
      await expectCode(
        () =>
          fx.settings.setForProfile(anaId, {
            key: 'background',
            value: { kind: 'imported', id: 42 },
          }),
        'background.not_found',
      );
    });

    it('shows no background when a stored one is missing from the gallery', () => {
      fx.appDb
        .prepare("INSERT INTO app_setting (key, value) VALUES ('background', ?)")
        .run(JSON.stringify({ kind: 'imported', id: 42 }));
      fx.settings.setForProfile(anaId, {
        key: 'background',
        value: { kind: 'preset', id: 'ocean' },
      });

      expect(fx.settings.getGlobal().background).toEqual(NO_BACKGROUND);
      expect(fx.settings.getForProfile(beaId).background).toEqual(NO_BACKGROUND);
      expect(fx.settings.getForProfile(anaId).background).toEqual({ kind: 'preset', id: 'ocean' });
    });
  });
});

function mkdirAndReturn(folder: string): string {
  mkdirSync(folder, { recursive: true });
  return folder;
}
