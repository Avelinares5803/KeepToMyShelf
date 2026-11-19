const DIGIT_RUNS = /\d+/g;
const LEADING_ZEROS = /^0+(?=\d)/;

/**
 * Turns text into a key whose plain character-by-character order is the natural order of
 * its numbers: "final fantasy 2" sorts before "final fantasy 10".
 *
 * Each run of digits is replaced by its value without leading zeros, preceded by its
 * length, and that length by its own length: "2" → "1" + "1" + "2", "10" → "1" + "2" +
 * "10", "1000000000" → "2" + "10" + "1000000000". A shorter number therefore always
 * sorts first, and numbers of the same length compare digit by digit. Digits still sort
 * before letters, as before. "007" and "7" get the same key, so callers break the tie.
 *
 * Expects text already normalized with `normalizeForSearch`, which turns full-width
 * digits into ASCII ones. Roman numerals are left as letters.
 */
export function naturalSortKey(text: string): string {
  return text.replace(DIGIT_RUNS, (run) => {
    const digits = run.replace(LEADING_ZEROS, '');
    const length = String(digits.length);
    return `${length.length}${length}${digits}`;
  });
}
