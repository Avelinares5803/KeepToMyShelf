import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { ImagePlanEntry } from '../../../src/shared/media';
import { PDF_BYTES, pngImage, writeFile } from '../../support/media-files';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const draft = (title: string): ItemDraft => ({ ...EMPTY_ITEM_DRAFT, title });

describe('item covers in the library and the trash', () => {
  let fx: ProfileFixture;
  let token: string;
  let wide: Buffer;
  let tall: Buffer;

  const preparedEntry = async (name: string, bytes: Uint8Array): Promise<ImagePlanEntry> => {
    const prepared = await fx.media.prepareImport(token, writeFile(fx.scratchDir, name, bytes));
    return { kind: 'prepared', preparedId: prepared.id, choice: 'original' };
  };
  const coverOf = (title: string) =>
    fx.items.list(token, 'game').find((item) => item.title === title)?.cover;

  beforeEach(async () => {
    fx = createProfileFixture();
    token = fx.sessions.open(fx.profiles.create({ name: 'Ana' }).profile.id).token;
    wide ??= await pngImage(40, 20);
    tall ??= await pngImage(20, 40);
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('gives each item its first image as cover, with its proportions, and none without images', async () => {
    fx.items.create(token, 'game', draft('Con imágenes'), [
      await preparedEntry('ancha.png', wide),
      await preparedEntry('alta.png', tall),
    ]);
    fx.items.create(token, 'game', draft('Sin imágenes'));

    expect(coverOf('Con imágenes')).toEqual({ sha256: sha256(wide), width: 40, height: 20 });
    expect(coverOf('Sin imágenes')).toBeNull();
  });

  it('follows the order: moving another image first changes the cover', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), [
      await preparedEntry('ancha.png', wide),
      await preparedEntry('alta.png', tall),
    ]);
    const [first, second] = fx.media.list(token, item.id).images;

    fx.items.update(token, item.id, draft('Chrono Trigger'), [
      { kind: 'existing', mediaId: second!.mediaId },
      { kind: 'existing', mediaId: first!.mediaId },
    ]);

    expect(coverOf('Chrono Trigger')).toEqual({ sha256: sha256(tall), width: 20, height: 40 });
  });

  it('never uses a document as the cover', async () => {
    const item = fx.items.create(token, 'game', draft('Solo manual'));
    const manual = await fx.media.prepareImport(
      token,
      writeFile(fx.scratchDir, 'Manual.pdf', PDF_BYTES),
    );
    fx.media.commitImport(token, manual.id, item.id, null);

    expect(coverOf('Solo manual')).toBeNull();
  });

  it('shows the cover of items in the trash, and lists each item once', async () => {
    const item = fx.items.create(token, 'game', draft('Chrono Trigger'), [
      await preparedEntry('ancha.png', wide),
      await preparedEntry('alta.png', tall),
    ]);
    fx.items.moveToTrash(token, item.id);

    expect(fx.items.listTrash(token, null)).toEqual([
      expect.objectContaining({ id: item.id, cover: expect.objectContaining({ width: 40 }) }),
    ]);
  });
});
