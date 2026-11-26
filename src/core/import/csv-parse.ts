import { CSV_BOM, type CsvSeparator } from '../export/csv';
import { ValidationError } from '../errors';

export interface ParsedCsv {
  /** Null for a file with a single column, whose cells may hold either one. */
  readonly separator: CsvSeparator | null;
  /**
   * Every record, the header first. A record is a row of the spreadsheet, even when a quoted
   * cell spans several lines, so row N of the spreadsheet is `records[N - 1]`.
   */
  readonly records: readonly (readonly string[])[];
}

/**
 * The separator of a file, from its first line: the header names neither ";" nor ",", so the
 * one that appears there is the separator. With neither, the file has a single column.
 */
function detectSeparator(text: string): CsvSeparator | null {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const character of text) {
    if (character === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (character === '\n' || character === '\r') break;
    else if (character === ';') semicolons++;
    else if (character === ',') commas++;
  }
  if (semicolons === 0 && commas === 0) return null;
  return commas > semicolons ? ',' : ';';
}

/**
 * Reads the text of a CSV file as RFC 4180 describes it: cells in double quotes may hold the
 * separator, line breaks and doubled quotes. Lines may end in CRLF, LF or CR. A text after a
 * closing quote is kept as part of the cell, as spreadsheets do. Throws
 * `import.csv_unclosed_quote` if a quote is never closed.
 */
export function parseCsv(raw: string): ParsedCsv {
  const text = raw.startsWith(CSV_BOM) ? raw.slice(CSV_BOM.length) : raw;
  const separator = detectSeparator(text);
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  let index = 0;

  const endCell = () => {
    record.push(cell);
    cell = '';
  };
  const endRecord = () => {
    endCell();
    records.push(record);
    record = [];
  };

  while (index < text.length) {
    const character = text[index]!;
    if (quoted) {
      if (character !== '"') {
        cell += character;
      } else if (text[index + 1] === '"') {
        cell += '"';
        index++;
      } else {
        quoted = false;
      }
    } else if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === separator) {
      endCell();
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      endRecord();
    } else {
      cell += character;
    }
    index++;
  }
  if (quoted) {
    throw new ValidationError('import.csv_unclosed_quote', 'A quoted cell is never closed');
  }
  // The last line may or may not end in a line break.
  if (cell.length > 0 || record.length > 0) endRecord();
  return { separator, records };
}
