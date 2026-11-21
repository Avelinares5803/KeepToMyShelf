import { describe, expect, it } from 'vitest';
import {
  backgroundImageSource,
  backgroundThumbnailSource,
  formatFileSize,
  preparedThumbnailSource,
  thumbnailSource,
  thumbnailSourceByWidth,
} from './media-url';

describe('media URLs', () => {
  it('offers the HiDPI thumbnail to high-density screens', () => {
    const sha = 'a'.repeat(64);
    expect(thumbnailSource(sha)).toEqual({
      src: `ktms-media://thumb/${sha}/320`,
      srcSet: `ktms-media://thumb/${sha}/320 1x, ktms-media://thumb/${sha}/640 2x`,
    });
    expect(preparedThumbnailSource('id').src).toBe('ktms-media://prepared/id/320');
  });

  it('can describe the thumbnails by their width, keeping the proportions', () => {
    const sha = 'c'.repeat(64);
    const url = (side: number) => `ktms-media://thumb/${sha}/${side}`;
    // A portrait cover: its longest side is the height.
    expect(thumbnailSourceByWidth(sha, 1000, 1400)).toEqual({
      src: url(320),
      srcSet: `${url(320)} 229w, ${url(640)} 457w`,
    });
    // Thumbnails are never larger than the image.
    expect(thumbnailSourceByWidth(sha, 500, 250).srcSet).toBe(`${url(320)} 320w, ${url(640)} 500w`);
    expect(thumbnailSourceByWidth(sha, 200, 300).srcSet).toBe(`${url(320)} 200w`);
  });

  it('serves backgrounds from their own part of the scheme', () => {
    const sha = 'b'.repeat(64);
    expect(backgroundImageSource(sha)).toBe(`ktms-media://background/${sha}`);
    expect(backgroundThumbnailSource(sha)).toEqual({
      src: `ktms-media://background/${sha}/320`,
      srcSet: `ktms-media://background/${sha}/320 1x, ktms-media://background/${sha}/640 2x`,
    });
  });
});

describe('formatFileSize', () => {
  it('uses KB below a megabyte and MB above, in the UI language', () => {
    expect(formatFileSize(850 * 1024, 'es')).toBe('850 KB');
    expect(formatFileSize(3.25 * 1024 * 1024, 'es')).toBe('3,3 MB');
    expect(formatFileSize(3.25 * 1024 * 1024, 'en')).toBe('3.3 MB');
  });

  it('never shows 0 KB for a tiny file', () => {
    expect(formatFileSize(10, 'es')).toBe('1 KB');
  });
});
