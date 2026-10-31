import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  assertChoiceAllowed,
  assertWithinSizeLimit,
  DEFAULT_MEDIA_LIMITS,
  fitsWithin,
  IMAGE_STORAGE_CHOICES,
  isThumbnailSize,
} from './import-rules';

const MB = 1024 * 1024;

const codeOf = (run: () => void): string | undefined => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return (error as ValidationError).code;
  }
  return undefined;
};

describe('assertWithinSizeLimit', () => {
  it('uses the agreed defaults: 50 MB per image and 200 MB per PDF', () => {
    expect(DEFAULT_MEDIA_LIMITS.maxImageBytes).toBe(50 * MB);
    expect(DEFAULT_MEDIA_LIMITS.maxDocumentBytes).toBe(200 * MB);
    expect(DEFAULT_MEDIA_LIMITS.optimizedMaxSide).toBe(2000);
  });

  it('accepts files up to the limit of their kind, inclusive', () => {
    expect(codeOf(() => assertWithinSizeLimit('image', 50 * MB, DEFAULT_MEDIA_LIMITS))).toBe(
      undefined,
    );
    expect(codeOf(() => assertWithinSizeLimit('document', 200 * MB, DEFAULT_MEDIA_LIMITS))).toBe(
      undefined,
    );
  });

  it('rejects larger files', () => {
    expect(codeOf(() => assertWithinSizeLimit('image', 50 * MB + 1, DEFAULT_MEDIA_LIMITS))).toBe(
      'media.too_large',
    );
    expect(
      codeOf(() => assertWithinSizeLimit('document', 200 * MB + 1, DEFAULT_MEDIA_LIMITS)),
    ).toBe('media.too_large');
  });

  it('applies each kind its own limit', () => {
    // 100 MB: too large for an image, fine for a PDF.
    expect(codeOf(() => assertWithinSizeLimit('image', 100 * MB, DEFAULT_MEDIA_LIMITS))).toBe(
      'media.too_large',
    );
    expect(codeOf(() => assertWithinSizeLimit('document', 100 * MB, DEFAULT_MEDIA_LIMITS))).toBe(
      undefined,
    );
  });
});

describe('assertChoiceAllowed', () => {
  it('allows every choice for still images', () => {
    for (const choice of IMAGE_STORAGE_CHOICES) {
      expect(codeOf(() => assertChoiceAllowed(choice, false))).toBe(undefined);
    }
  });

  it('only allows keeping the original of an animated image', () => {
    expect(codeOf(() => assertChoiceAllowed('original', true))).toBe(undefined);
    expect(codeOf(() => assertChoiceAllowed('optimized_only', true))).toBe(
      'media.animated_original_only',
    );
    expect(codeOf(() => assertChoiceAllowed('optimized_with_original', true))).toBe(
      'media.animated_original_only',
    );
  });
});

describe('fitsWithin', () => {
  it('compares the longest side, whatever the orientation', () => {
    expect(fitsWithin(2000, 1500, 2000)).toBe(true);
    expect(fitsWithin(1500, 2000, 2000)).toBe(true);
    expect(fitsWithin(2001, 10, 2000)).toBe(false);
    expect(fitsWithin(10, 2001, 2000)).toBe(false);
  });
});

describe('isThumbnailSize', () => {
  it('only accepts the two thumbnail sizes', () => {
    expect(isThumbnailSize(320)).toBe(true);
    expect(isThumbnailSize(640)).toBe(true);
    expect(isThumbnailSize(1280)).toBe(false);
    expect(isThumbnailSize(0)).toBe(false);
  });
});
