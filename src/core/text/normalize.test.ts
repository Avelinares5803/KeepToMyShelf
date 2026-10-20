import { describe, expect, it } from 'vitest';
import { normalizeForSearch } from './normalize';

describe('normalizeForSearch', () => {
  it.each([
    ['Pokémon', 'pokemon'],
    ['ÑANDÚ', 'nandu'],
    ['Über Ça', 'uber ca'],
    ['THE LEGEND OF ZELDA', 'the legend of zelda'],
  ])('removes accents and case: %s → %s', (input, expected) => {
    expect(normalizeForSearch(input)).toBe(expected);
  });

  it('treats precomposed and decomposed accents the same', () => {
    const precomposed = 'Pokémon';
    const decomposed = 'Pokémon';
    expect(normalizeForSearch(precomposed)).toBe(normalizeForSearch(decomposed));
  });

  it('unifies compatibility characters such as Roman numerals and full-width letters', () => {
    expect(normalizeForSearch('Final Fantasy Ⅶ')).toBe('final fantasy vii');
    expect(normalizeForSearch('ＡＢＣ')).toBe('abc');
  });

  it('trims and collapses whitespace', () => {
    expect(normalizeForSearch('  Final \t  Fantasy\n ')).toBe('final fantasy');
  });

  it('preserves marks that belong to non-Latin scripts', () => {
    expect(normalizeForSearch('ポケモン')).toBe('ポケモン');
    expect(normalizeForSearch('ドラゴンクエスト')).toBe('ドラゴンクエスト');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeForSearch('')).toBe('');
    expect(normalizeForSearch('   ')).toBe('');
  });
});
