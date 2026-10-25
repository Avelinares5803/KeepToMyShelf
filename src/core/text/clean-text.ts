const CONTROL_CHARACTERS = /\p{Cc}/u;
const WHITESPACE_RUNS = /\s+/g;
const LINE_BREAKS = /\r\n?/g;

/** Number of characters as a person counts them (code points): an emoji counts as one. */
export function characterCount(text: string): number {
  return [...text].length;
}

/**
 * Single-line text (names, titles): unifies Unicode forms, trims and collapses whitespace,
 * including tabs and line breaks. Returns null if other control characters remain.
 */
export function cleanSingleLine(raw: string): string | null {
  const text = raw.normalize('NFC').replace(WHITESPACE_RUNS, ' ').trim();
  return CONTROL_CHARACTERS.test(text) ? null : text;
}

/**
 * Multi-line text (descriptions, notes): unifies Unicode forms and line endings and trims
 * the ends, keeping the user's line breaks and indentation.
 */
export function cleanMultiLine(raw: string): string {
  return raw.normalize('NFC').replace(LINE_BREAKS, '\n').trim();
}
