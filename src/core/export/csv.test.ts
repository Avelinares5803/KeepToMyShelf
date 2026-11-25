import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../tests/support/csv';
import { formatDecimal, guardFormula, joinList, toCsv } from './csv';

describe('toCsv', () => {
  it('starts with the byte order mark and ends every row with CRLF', () => {
    expect(toCsv([['Título'], ['Ñu']], ';')).toBe('\u{FEFF}Título\r\nÑu\r\n');
  });

  it.each([';', ','] as const)('writes any text so it is read back the same, with "%s"', (sep) => {
    const rows = [
      ['a;b', 'a,b', 'say "hi"', 'two\nlines', 'tab\there'],
      ['', ' spaces ', '"', '""', 'ñ日本🎮'],
    ];
    const text = toCsv(rows, sep);
    expect(parseCsv(text.slice(1), sep)).toEqual(rows);
  });

  it('quotes only what needs it', () => {
    expect(toCsv([['plain', 'a;b']], ';').slice(1)).toBe('plain;"a;b"\r\n');
  });

  it('guards the cells that look like formulas', () => {
    const text = toCsv([['=1+1', '=HYPERLINK("x";"y")']], ';');
    expect(parseCsv(text.slice(1), ';')).toEqual([["'=1+1", `'=HYPERLINK("x";"y")`]]);
  });
});

describe('guardFormula', () => {
  it.each(['=1', '+1', '-1', '@x', '\tx', '\rx', '＝1', '＋1', '－1', '＠x', "'=1", "''=1"])(
    'puts an apostrophe before %j',
    (text) => {
      expect(guardFormula(text)).toBe(`'${text}`);
    },
  );

  it.each(['', 'a=b', "'Tis", "'", '.hack', '1-2', '(-1)'])('leaves %j as it is', (text) => {
    expect(guardFormula(text)).toBe(text);
  });
});

describe('joinList', () => {
  it('joins values and escapes what separates them', () => {
    expect(joinList(['PC', 'Switch'])).toBe('PC | Switch');
    expect(joinList(['a|b', 'c\\d'])).toBe('a\\|b | c\\\\d');
    expect(joinList([])).toBe('');
  });
});

describe('formatDecimal', () => {
  it('uses the decimal mark that goes with the separator', () => {
    expect(formatDecimal(4.5, ';')).toBe('4,5');
    expect(formatDecimal(4.5, ',')).toBe('4.5');
    expect(formatDecimal(4, ';')).toBe('4');
  });
});
