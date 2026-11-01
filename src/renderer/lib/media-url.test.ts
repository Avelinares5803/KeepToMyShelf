import { describe, expect, it } from 'vitest';
import { formatFileSize, preparedThumbnailSource, thumbnailSource } from './media-url';

describe('media URLs', () => {
  it('offers the HiDPI thumbnail to high-density screens', () => {
    const sha = 'a'.repeat(64);
    expect(thumbnailSource(sha)).toEqual({
      src: `ktms-media://thumb/${sha}/320`,
      srcSet: `ktms-media://thumb/${sha}/320 1x, ktms-media://thumb/${sha}/640 2x`,
    });
    expect(preparedThumbnailSource('id').src).toBe('ktms-media://prepared/id/320');
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
