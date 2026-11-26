import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { toCsv } from '../export/csv';
import { parseCsv } from './csv-parse';

describe('parseCsv', () => {
  it.each([';', ','] as const)('reads back what toCsv writes, with "%s"', (separator) => {
    const rows = [
      ['Título', 'Notas'],
      ['a;b', 'a,b'],
      ['say "hi"', 'two\nlines\r\nand three'],
      ['', ' spaces '],
      ['"', 'ñ日本🎮'],
    ];
    expect(parseCsv(toCsv(rows, separator))).toEqual({ separator, records: rows });
  });

  it('takes the separator from the header, where a quoted cell does not count', () => {
    expect(parseCsv('"A,B";C\r\n1,5;2').records).toEqual([
      ['A,B', 'C'],
      ['1,5', '2'],
    ]);
    expect(parseCsv('"A;B",C\n1;5,2').records).toEqual([
      ['A;B', 'C'],
      ['1;5', '2'],
    ]);
  });

  it('reads a single column, with either separator in its cells', () => {
    expect(parseCsv('Título\nOkami, el\nIco; HD')).toEqual({
      separator: null,
      records: [['Título'], ['Okami, el'], ['Ico; HD']],
    });
  });

  it('accepts LF, CR and a last line without a line break', () => {
    expect(parseCsv('a;b\nc;d\re;f').records).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
    expect(parseCsv('a;b\r\n').records).toEqual([['a', 'b']]);
  });

  it('keeps empty cells and empty lines, so rows keep their number', () => {
    expect(parseCsv('a;b\r\n;\r\n\r\nc;').records).toEqual([['a', 'b'], ['', ''], [''], ['c', '']]);
  });

  it('keeps text after a closing quote, as spreadsheets do', () => {
    expect(parseCsv('a;b\n"x"y;z"w').records).toEqual([
      ['a', 'b'],
      ['xy', 'z"w'],
    ]);
  });

  it('refuses a quote that is never closed', () => {
    const error: unknown = (() => {
      try {
        return parseCsv('a;b\n"x;y\n');
      } catch (caught) {
        return caught;
      }
    })();
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('import.csv_unclosed_quote');
  });

  it('reads an empty file as no records', () => {
    expect(parseCsv('').records).toEqual([]);
    expect(parseCsv('\u{FEFF}').records).toEqual([]);
  });
});
