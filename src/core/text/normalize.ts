// Combining diacritical marks (accents, tilde, diaeresis...) produced by NFKD on Latin letters.
// Restricted to this block so that marks in other scripts (e.g. Japanese dakuten) are preserved.
const LATIN_COMBINING_MARKS = /[̀-ͯ]/g;
const WHITESPACE_RUNS = /\s+/g;

/**
 * Normalizes text for case- and accent-insensitive search.
 *
 * - "Pokémon" → "pokemon", "ÑANDÚ" → "nandu"
 * - Compatibility characters are unified: "Final Fantasy Ⅶ" → "final fantasy vii"
 * - Whitespace is trimmed and collapsed.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(LATIN_COMBINING_MARKS, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(WHITESPACE_RUNS, ' ')
    .trim();
}
