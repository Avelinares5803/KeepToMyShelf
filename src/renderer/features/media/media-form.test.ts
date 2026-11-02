import { describe, expect, it } from 'vitest';
import type { MediaAttachment, PreparedImport } from '../../../shared/media';
import {
  automaticChoice,
  choicesFor,
  coverChanged,
  fromAttachment,
  fromAttachments,
  imagesChanged,
  moveImage,
  optimizingSavesNothing,
  preparedIds,
  preparedImage,
  sameImage,
  toCoverPlan,
  toggleOriginal,
  toImagePlan,
  withOriginalToggled,
} from './media-form';

const attachment = (mediaId: number, hasOriginal = false): MediaAttachment => ({
  mediaId,
  kind: 'image',
  format: 'webp',
  sha256: String(mediaId).padStart(64, '0'),
  byteSize: 1000,
  width: 100,
  height: 50,
  isAnimated: false,
  label: null,
  hasOriginal,
  isMissing: false,
});

const preparation = (
  id: string,
  byteSize = 1000,
  optimized: PreparedImport['optimized'] = { byteSize: 400, width: 100, height: 50 },
): PreparedImport => ({
  id,
  fileName: `${id}.png`,
  kind: 'image',
  format: 'png',
  byteSize,
  width: 100,
  height: 50,
  isAnimated: optimized === null,
  fitsOptimizedSize: true,
  optimized,
});

const ids = (images: ReturnType<typeof fromAttachments>) =>
  images.map((image) => (image.source === 'existing' ? image.media.mediaId : image.prepared.id));

describe('image list of the edit form', () => {
  const saved = fromAttachments([attachment(1), attachment(2, true), attachment(3)]);

  it('moves an image one place earlier or later, never past the ends', () => {
    expect(ids(moveImage(saved, 1, -1))).toEqual([2, 1, 3]);
    expect(ids(moveImage(saved, 1, 1))).toEqual([1, 3, 2]);
    expect(ids(moveImage(saved, 0, -1))).toEqual([1, 2, 3]);
    expect(ids(moveImage(saved, 2, 1))).toEqual([1, 2, 3]);
  });

  it('only switches to the original images that keep one', () => {
    expect(toImagePlan(toggleOriginal(saved, 1))[1]).toEqual({ kind: 'use_original', mediaId: 2 });
    expect(toImagePlan(toggleOriginal(saved, 0))[0]).toEqual({ kind: 'existing', mediaId: 1 });
    expect(toImagePlan(toggleOriginal(toggleOriginal(saved, 1), 1))[1]).toEqual({
      kind: 'existing',
      mediaId: 2,
    });
  });

  it('builds the list sent with the item, in order', () => {
    const images = [preparedImage(preparation('nueva'), 'optimized_only'), ...saved.slice(0, 1)];
    expect(toImagePlan(images)).toEqual([
      { kind: 'prepared', preparedId: 'nueva', choice: 'optimized_only' },
      { kind: 'existing', mediaId: 1 },
    ]);
    expect(preparedIds(null, images)).toEqual(['nueva']);
  });

  it('notices any change that would be saved, and only those', () => {
    expect(
      imagesChanged(saved, fromAttachments([attachment(1), attachment(2, true), attachment(3)])),
    ).toBe(false);
    expect(imagesChanged(saved, moveImage(saved, 0, 1))).toBe(true);
    expect(imagesChanged(saved, saved.slice(1))).toBe(true);
    expect(imagesChanged(saved, toggleOriginal(saved, 1))).toBe(true);
    expect(imagesChanged([], [preparedImage(preparation('nueva'), 'original')])).toBe(true);
  });
});

describe('cover of the edit form', () => {
  const saved = fromAttachment(attachment(1, true));
  const fresh = preparedImage(preparation('nueva'), 'optimized_only');

  it('is sent as one entry, or null to remove it', () => {
    expect(toCoverPlan(saved)).toEqual({ kind: 'existing', mediaId: 1 });
    expect(toCoverPlan(withOriginalToggled(saved))).toEqual({ kind: 'use_original', mediaId: 1 });
    expect(toCoverPlan(fresh)).toEqual({
      kind: 'prepared',
      preparedId: 'nueva',
      choice: 'optimized_only',
    });
    expect(toCoverPlan(null)).toBeNull();
  });

  it('only switches to the original a cover that keeps one', () => {
    const plain = fromAttachment(attachment(2));
    expect(withOriginalToggled(plain)).toBe(plain);
    expect(withOriginalToggled(fresh)).toBe(fresh);
  });

  it('notices when the cover would change, and only then', () => {
    expect(coverChanged(saved, fromAttachment(attachment(1, true)))).toBe(false);
    expect(coverChanged(null, null)).toBe(false);
    expect(coverChanged(saved, null)).toBe(true);
    expect(coverChanged(null, fresh)).toBe(true);
    expect(coverChanged(saved, withOriginalToggled(saved))).toBe(true);
  });

  it('recognizes the gallery image that is also the cover, however it is kept', () => {
    expect(sameImage(saved, fromAttachment(attachment(1)))).toBe(true);
    expect(sameImage(saved, withOriginalToggled(saved))).toBe(true);
    expect(sameImage(fresh, preparedImage(preparation('nueva'), 'original'))).toBe(true);
    expect(sameImage(saved, fromAttachment(attachment(2)))).toBe(false);
    expect(sameImage(saved, fresh)).toBe(false);
    expect(sameImage(null, saved)).toBe(false);
  });

  it('lists each import once, even when it is the cover and in the gallery', () => {
    const other = preparedImage(preparation('otra'), 'original');
    expect(preparedIds(fresh, [fresh, other, saved])).toEqual(['nueva', 'otra']);
    expect(preparedIds(saved, [])).toEqual([]);
  });
});

describe('choosing how to keep an import', () => {
  it('offers only the original for animated images', () => {
    expect(choicesFor(preparation('animada', 1000, null))).toEqual(['original']);
    expect(choicesFor(preparation('foto'))).toHaveLength(3);
  });

  it('tells when the optimized copy would not be smaller', () => {
    expect(optimizingSavesNothing(preparation('foto', 1000))).toBe(false);
    expect(
      optimizingSavesNothing(preparation('foto', 1000, { byteSize: 1000, width: 1, height: 1 })),
    ).toBe(true);
    expect(optimizingSavesNothing(preparation('animada', 1000, null))).toBe(false);
  });

  it('follows a remembered choice, keeping the original when optimizing is pointless', () => {
    const smaller = preparation('foto');
    const larger = preparation('foto', 1000, { byteSize: 1200, width: 100, height: 50 });
    const animated = preparation('animada', 1000, null);

    expect(automaticChoice(smaller, 'optimized_only')).toBe('optimized_only');
    expect(automaticChoice(smaller, 'optimized_with_original')).toBe('optimized_with_original');
    expect(automaticChoice(smaller, 'original')).toBe('original');
    expect(automaticChoice(larger, 'optimized_only')).toBe('original');
    expect(automaticChoice(animated, 'optimized_with_original')).toBe('original');
  });
});
