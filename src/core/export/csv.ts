/** Cell separators offered; which one a spreadsheet expects depends on the system's region. */
export const CSV_SEPARATORS = [';', ','] as const;
export type CsvSeparator = (typeof CSV_SEPARATORS)[number];

/** Tells Excel that the file is UTF-8. */
export const CSV_BOM = '\u{FEFF}';

const LINE_END = '\r\n';

// What a spreadsheet may take for a formula, also in full width. A text that only looks guarded
// ("'=1") is guarded too, so that removing one apostrophe always gives back the original.
const LOOKS_LIKE_FORMULA = /^'*[=+\-@\t\r＝＋－＠]/u;

const NEEDS_QUOTES = /[",;\t\r\n]/;

/** Puts an apostrophe before a text that a spreadsheet could run as a formula. */
export function guardFormula(text: string): string {
  return LOOKS_LIKE_FORMULA.test(text) ? `'${text}` : text;
}

/** Several values in one cell: "PC | Switch". A "|" or "\" inside a value gets a "\" before. */
export function joinList(values: readonly string[]): string {
  return values.map((value) => value.replace(/[\\|]/g, '\\$&')).join(' | ');
}

/** 9 half stars are "4,5" with ";" and "4.5" with ",", as the regions that use each one. */
export function formatDecimal(value: number, separator: CsvSeparator): string {
  return separator === ';' ? String(value).replace('.', ',') : String(value);
}

function cell(text: string): string {
  const guarded = guardFormula(text);
  return NEEDS_QUOTES.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/** The whole text of a CSV file, with its byte order mark. */
export function toCsv(rows: readonly (readonly string[])[], separator: CsvSeparator): string {
  return CSV_BOM + rows.map((row) => row.map(cell).join(separator) + LINE_END).join('');
}
