import { describe, expect, it } from 'vitest';
import { characterCount, cleanMultiLine, cleanSingleLine } from './clean-text';

describe('characterCount', () => {
  it('counts emoji and accented letters as one character each', () => {
    expect(characterCount('Pokémon 🎮')).toBe(9);
  });
});

describe('cleanSingleLine', () => {
  it('trims and collapses spaces, tabs and line breaks', () => {
    expect(cleanSingleLine('  Final \t Fantasy\nVII  ')).toBe('Final Fantasy VII');
  });

  it('unifies decomposed accents', () => {
    expect(cleanSingleLine('Pokémon')).toBe('Pokémon');
  });

  it('returns null when control characters remain', () => {
    expect(cleanSingleLine('Zel\u0000da')).toBeNull();
    expect(cleanSingleLine('Zelda\u0007')).toBeNull();
  });

  it('returns an empty string for blank input', () => {
    expect(cleanSingleLine('   ')).toBe('');
  });
});

describe('cleanMultiLine', () => {
  it('keeps inner line breaks and indentation but trims the ends', () => {
    expect(cleanMultiLine('\n  Línea 1\n    sangrada\n\n')).toBe('Línea 1\n    sangrada');
  });

  it('converts Windows and old Mac line endings to \\n', () => {
    expect(cleanMultiLine('a\r\nb\rc')).toBe('a\nb\nc');
  });
});
