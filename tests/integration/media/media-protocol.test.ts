import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_ITEM_DRAFT } from '../../../src/core/items/item-draft';
import { createMediaProtocolHandler, parseMediaUrl } from '../../../src/main/media-protocol';
import type { MediaAttachment } from '../../../src/shared/media';
import { PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const SHA = 'ab'.repeat(32);
const PREPARED = '3f2b8c1e-5d4a-4b6f-9e8d-7c6b5a493827';

describe('parseMediaUrl', () => {
  it('reads files and thumbnails', () => {
    expect(parseMediaUrl(`ktms-media://file/${SHA}`)).toEqual({ type: 'file', sha256: SHA });
    expect(parseMediaUrl(`ktms-media://thumb/${SHA}/320`)).toEqual({
      type: 'thumb',
      sha256: SHA,
      size: 320,
    });
    expect(parseMediaUrl(`ktms-media://thumb/${SHA}/640`)).toMatchObject({ size: 640 });
    expect(parseMediaUrl(`ktms-media://prepared/${PREPARED}/320`)).toEqual({
      type: 'prepared',
      id: PREPARED,
      size: 320,
    });
  });

  it('reads backgrounds and their thumbnails', () => {
    expect(parseMediaUrl(`ktms-media://background/${SHA}`)).toEqual({
      type: 'background',
      sha256: SHA,
      size: null,
    });
    expect(parseMediaUrl(`ktms-media://background/${SHA}/640`)).toEqual({
      type: 'background',
      sha256: SHA,
      size: 640,
    });
  });

  it.each([
    ['a prepared import that is not a UUID', 'ktms-media://prepared/..%2F..%2Flibrary.db/320'],
    ['a prepared import named by a hash', `ktms-media://prepared/${SHA}/320`],
    ['a prepared import without a size', `ktms-media://prepared/${PREPARED}`],
    ['another scheme', `file:///C:/Windows/${SHA}`],
    ['an https URL', `https://file/${SHA}`],
    ['an unknown kind', `ktms-media://original/${SHA}`],
    ['a short hash', 'ktms-media://file/abc'],
    ['an uppercase hash', `ktms-media://file/${SHA.toUpperCase()}`],
    ['a parent folder', 'ktms-media://file/../../library.db'],
    ['an encoded parent folder', 'ktms-media://file/%2e%2e/%2e%2e/library.db'],
    ['an encoded slash', `ktms-media://file/${SHA}%2F..`],
    ['an extra part', `ktms-media://file/${SHA}/extra`],
    ['a file with a size', `ktms-media://file/${SHA}/320`],
    ['a thumbnail without a size', `ktms-media://thumb/${SHA}`],
    ['a thumbnail size that is not made', `ktms-media://thumb/${SHA}/1280`],
    ['a non-numeric size', `ktms-media://thumb/${SHA}/320px`],
    ['a query', `ktms-media://file/${SHA}?path=C:/Windows`],
    ['a fragment', `ktms-media://file/${SHA}#x`],
    ['credentials', `ktms-media://user:pass@file/${SHA}`],
    ['a port', `ktms-media://file:8080/${SHA}`],
    ['a background named by a UUID', `ktms-media://background/${PREPARED}`],
    ['a background with a size that is not made', `ktms-media://background/${SHA}/1280`],
    ['a background with an extra part', `ktms-media://background/${SHA}/320/x`],
    ['a background parent folder', 'ktms-media://background/../app.db'],
    ['nonsense', 'not a url'],
  ])('rejects %s', (_label, url) => {
    expect(parseMediaUrl(url)).toBeNull();
  });

  it('resolves dot segments like the browser does, so they never leave the scheme', () => {
    expect(parseMediaUrl(`ktms-media://file/%2e%2e/${SHA}`)).toEqual(
      parseMediaUrl(`ktms-media://file/${SHA}`),
    );
  });
});

describe('ktms-media:// handler', () => {
  let fx: ProfileFixture;
  let token: string;
  let profileId: string;
  let image: MediaAttachment;
  let imageBytes: Buffer;
  let handle: (request: Request) => Promise<Response>;

  const get = (url: string) => handle(new Request(url));
  const thumbnailPath = (sha: string, size: number) =>
    join(fx.paths.cacheDir(profileId), 'thumbs', sha.slice(0, 2), `${sha}-${size}.webp`);

  async function attach(
    name: string,
    bytes: Uint8Array,
    choice: 'original' | 'optimized_with_original' | null,
  ) {
    const itemId = fx.items.create(token, 'game', { ...EMPTY_ITEM_DRAFT, title: name }).id;
    const prepared = await fx.media.prepareImport(token, writeFile(fx.scratchDir, name, bytes));
    return fx.media.commitImport(token, prepared.id, itemId, choice);
  }

  beforeEach(async () => {
    fx = createProfileFixture();
    profileId = fx.profiles.create({ name: 'Ana' }).profile.id;
    token = fx.sessions.open(profileId).token;
    handle = createMediaProtocolHandler(fx.media, fx.backgrounds);
    imageBytes = await pngImage(800, 400);
    image = await attach('portada.png', imageBytes, 'original');
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('serves a stored file with the type recorded in the database', async () => {
    const response = await get(`ktms-media://file/${image.sha256}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await response.arrayBuffer()).equals(imageBytes)).toBe(true);
  });

  it('serves both thumbnail sizes', async () => {
    for (const [size, width] of [
      [320, 320],
      [640, 640],
    ] as const) {
      const response = await get(`ktms-media://thumb/${image.sha256}/${size}`);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/webp');
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      expect(metadata).toMatchObject({ format: 'webp', width, height: width / 2 });
    }
  });

  it('makes a deleted thumbnail again and keeps it in the cache', async () => {
    rmSync(thumbnailPath(image.sha256, 320));

    const response = await get(`ktms-media://thumb/${image.sha256}/320`);

    expect(response.status).toBe(200);
    expect(existsSync(thumbnailPath(image.sha256, 320))).toBe(true);
    const metadata = await sharp(readFileSync(thumbnailPath(image.sha256, 320))).metadata();
    expect(metadata).toMatchObject({ width: 320, height: 160 });
  });

  it('never serves documents nor thumbnails of them: they open in the system viewer', async () => {
    const pdf = await attach('Manual.pdf', PDF_BYTES, null);

    expect((await get(`ktms-media://file/${pdf.sha256}`)).status).toBe(404);
    expect((await get(`ktms-media://thumb/${pdf.sha256}/320`)).status).toBe(404);
  });

  it('never serves the kept originals, only the files items use', async () => {
    const original = await pngImage(900, 300);
    await attach('optimizada.png', original, 'optimized_with_original');
    const { createHash } = await import('node:crypto');
    const originalSha = createHash('sha256').update(original).digest('hex');

    expect((await get(`ktms-media://file/${originalSha}`)).status).toBe(404);
  });

  it('answers 404 for unknown files and files deleted by hand', async () => {
    expect((await get(`ktms-media://file/${SHA}`)).status).toBe(404);

    const stored = join(fx.paths.mediaDir(profileId), 'files', image.sha256.slice(0, 2));
    rmSync(stored, { recursive: true });
    rmSync(thumbnailPath(image.sha256, 640));
    expect((await get(`ktms-media://file/${image.sha256}`)).status).toBe(404);
    expect((await get(`ktms-media://thumb/${image.sha256}/640`)).status).toBe(404);
    // Its 320 px thumbnail is still cached, but the image is missing everywhere alike.
    expect(existsSync(thumbnailPath(image.sha256, 320))).toBe(true);
    expect((await get(`ktms-media://thumb/${image.sha256}/320`)).status).toBe(404);
  });

  it('only serves files of the open profile', async () => {
    const other = fx.profiles.create({ name: 'Berta' }).profile.id;
    fx.sessions.open(other);
    expect((await get(`ktms-media://file/${image.sha256}`)).status).toBe(404);

    fx.sessions.closeCurrent();
    expect((await get(`ktms-media://file/${image.sha256}`)).status).toBe(404);
  });

  it('serves the thumbnail of an import not saved yet, until it is discarded', async () => {
    const preparation = await fx.media.prepareImport(
      token,
      writeFile(fx.scratchDir, 'nueva.png', await pngImage(400, 100)),
    );
    const url = `ktms-media://prepared/${preparation.id}/320`;

    const response = await get(url);
    expect(response.status).toBe(200);
    const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
    expect(metadata).toMatchObject({ format: 'webp', width: 320, height: 80 });

    fx.media.discardImports(token, [preparation.id]);
    expect((await get(url)).status).toBe(404);
  });

  describe('backgrounds', () => {
    const importBackground = async (
      name: string,
      bytes: Buffer,
      choice: 'original' | 'optimized_with_original',
    ) => {
      const { prepared } = await fx.backgrounds.prepareMany(null, [
        writeFile(fx.scratchDir, name, bytes),
      ]);
      return fx.backgrounds.commitImport(prepared[0]!.id, choice);
    };

    it('serves a background and its thumbnails with or without an open profile', async () => {
      const bytes = await pngImage(800, 400);
      const background = await importBackground('fondo.png', bytes, 'original');

      for (const open of [true, false]) {
        if (!open) fx.sessions.closeCurrent();
        const response = await get(`ktms-media://background/${background.sha256}`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('image/png');
        expect(response.headers.get('x-content-type-options')).toBe('nosniff');
        expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);

        const thumbnail = await get(`ktms-media://background/${background.sha256}/320`);
        const metadata = await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata();
        expect(metadata).toMatchObject({ format: 'webp', width: 320, height: 160 });
      }
    });

    it('never serves a profile image as a background, nor a background as a profile image', async () => {
      const background = await importBackground('fondo.png', await pngImage(500, 300), 'original');

      expect((await get(`ktms-media://background/${image.sha256}`)).status).toBe(404);
      expect((await get(`ktms-media://file/${background.sha256}`)).status).toBe(404);
    });

    it('never serves the kept original of a background', async () => {
      const original = await pngImage(900, 300);
      await importBackground('fondo.png', original, 'optimized_with_original');
      const { createHash } = await import('node:crypto');
      const originalSha = createHash('sha256').update(original).digest('hex');

      expect((await get(`ktms-media://background/${originalSha}`)).status).toBe(404);
    });

    it('serves the thumbnail of a background import not saved yet', async () => {
      fx.sessions.closeCurrent();
      const { prepared } = await fx.backgrounds.prepareMany(null, [
        writeFile(fx.scratchDir, 'nuevo.png', await pngImage(400, 100)),
      ]);

      const response = await get(`ktms-media://prepared/${prepared[0]!.id}/320`);
      expect(response.status).toBe(200);
      fx.backgrounds.discardImports([prepared[0]!.id]);
      expect((await get(`ktms-media://prepared/${prepared[0]!.id}/320`)).status).toBe(404);
    });
  });

  it('answers 400 for malformed URLs and 405 for anything but GET', async () => {
    expect((await get('ktms-media://file/../library.db')).status).toBe(400);
    expect((await get(`ktms-media://thumb/${image.sha256}/1280`)).status).toBe(400);
    const post = await handle(new Request(`ktms-media://file/${image.sha256}`, { method: 'POST' }));
    expect(post.status).toBe(405);
  });
});
