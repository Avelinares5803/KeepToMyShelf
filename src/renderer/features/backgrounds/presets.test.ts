import { describe, expect, it } from 'vitest';
import type { ImportedBackground } from '../../../shared/backgrounds';
import { BACKGROUND_PRESETS } from '../../../shared/settings';
import { backgroundPreview, backgroundSource, PRESET_SOURCES } from './presets';

const imported = (id: number, overrides: Partial<ImportedBackground> = {}): ImportedBackground => ({
  id,
  sha256: String(id).repeat(64).slice(0, 64),
  format: 'webp',
  byteSize: 1000,
  width: 1920,
  height: 1080,
  isAnimated: false,
  hasOriginal: false,
  isMissing: false,
  profileCount: 0,
  ...overrides,
});

describe('backgroundPreview', () => {
  it('uses the thumbnail of an imported background, never its full file', () => {
    const background = imported(2);
    expect(backgroundPreview({ kind: 'imported', id: 2 }, [background])).toEqual({
      src: `ktms-media://background/${background.sha256}/320`,
      srcSet: `ktms-media://background/${background.sha256}/320 1x, ktms-media://background/${background.sha256}/640 2x`,
    });
  });

  it('uses the picture of a background that comes with the app', () => {
    expect(backgroundPreview({ kind: 'preset', id: 'ocean' }, [])).toEqual({
      src: PRESET_SOURCES.ocean,
    });
  });

  it('has nothing for no background, nor for an imported one that is gone or missing', () => {
    expect(backgroundPreview({ kind: 'none' }, [])).toBeNull();
    expect(backgroundPreview({ kind: 'imported', id: 3 }, [imported(1)])).toBeNull();
    expect(
      backgroundPreview({ kind: 'imported', id: 1 }, [imported(1, { isMissing: true })]),
    ).toBeNull();
  });
});

describe('backgroundSource', () => {
  it('shows nothing without a background', () => {
    expect(backgroundSource({ kind: 'none' }, [])).toBeNull();
  });

  it('has a picture for every background that comes with the app', () => {
    for (const id of BACKGROUND_PRESETS) {
      expect(PRESET_SOURCES[id]).toMatch(/\.svg|^data:image\/svg/);
      expect(backgroundSource({ kind: 'preset', id }, [])).toBe(PRESET_SOURCES[id]);
    }
    expect(new Set(Object.values(PRESET_SOURCES)).size).toBe(BACKGROUND_PRESETS.length);
  });

  it('shows an imported background at full quality', () => {
    const background = imported(2);
    expect(backgroundSource({ kind: 'imported', id: 2 }, [imported(1), background])).toBe(
      `ktms-media://background/${background.sha256}`,
    );
  });

  it('shows nothing for an imported background that is gone or whose file is missing', () => {
    expect(backgroundSource({ kind: 'imported', id: 3 }, [imported(1)])).toBeNull();
    expect(
      backgroundSource({ kind: 'imported', id: 1 }, [imported(1, { isMissing: true })]),
    ).toBeNull();
  });
});
