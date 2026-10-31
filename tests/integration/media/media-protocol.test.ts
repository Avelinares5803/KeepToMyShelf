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

describe('parseMediaUrl', () => {
  it('reads files and thumbnails', () => {
    expect(parseMediaUrl(`ktms-media://file/${SHA}`)).toEqual({ type: 'file', sha256: SHA });
    expect(parseMediaUrl(`ktms-media://thumb/${SHA}/320`)).toEqual({
      type: 'thumb',
      sha256: SHA,
      size: 320,
    });
    expect(parseMediaUrl(`ktms-media://thumb/${SHA}/640`)).toMatchObject({ size: 640 });
  });

  it.each([
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
    handle = createMediaProtocolHandler(fx.media);
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

  it('serves documents, but no thumbnail for them', async () => {
    const pdf = await attach('Manual.pdf', PDF_BYTES, null);

    const file = await get(`ktms-media://file/${pdf.sha256}`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/pdf');
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
  });

  it('only serves files of the open profile', async () => {
    const other = fx.profiles.create({ name: 'Berta' }).profile.id;
    fx.sessions.open(other);
    expect((await get(`ktms-media://file/${image.sha256}`)).status).toBe(404);

    fx.sessions.closeCurrent();
    expect((await get(`ktms-media://file/${image.sha256}`)).status).toBe(404);
  });

  it('answers 400 for malformed URLs and 405 for anything but GET', async () => {
    expect((await get('ktms-media://file/../library.db')).status).toBe(400);
    expect((await get(`ktms-media://thumb/${image.sha256}/1280`)).status).toBe(400);
    const post = await handle(new Request(`ktms-media://file/${image.sha256}`, { method: 'POST' }));
    expect(post.status).toBe(405);
  });
});
