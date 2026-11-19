import { describe, expect, it } from 'vitest';
import { naturalSortKey } from './natural-sort';

/** Sorts the way SQLite compares text: by UTF-16 code unit, which is what `<` does. */
function naturalSort(values: readonly string[]): string[] {
  return [...values].sort((a, b) => {
    const [keyA, keyB] = [naturalSortKey(a), naturalSortKey(b)];
    return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
  });
}

describe('naturalSortKey', () => {
  it('sorts numbers by their value, not digit by digit', () => {
    expect(naturalSort(['final fantasy 10', 'final fantasy 2', 'final fantasy 1'])).toEqual([
      'final fantasy 1',
      'final fantasy 2',
      'final fantasy 10',
    ]);
  });

  it('handles numbers of very different lengths', () => {
    const values = ['n 1000000000', 'n 99', 'n 123456789012', 'n 100', 'n 9', 'n 0'];
    expect(naturalSort(values)).toEqual([
      'n 0',
      'n 9',
      'n 99',
      'n 100',
      'n 1000000000',
      'n 123456789012',
    ]);
  });

  it('compares every number in the text, in order', () => {
    expect(naturalSort(['v 2.10', 'v 2.9', 'v 10.1', 'v 2.1'])).toEqual([
      'v 2.1',
      'v 2.9',
      'v 2.10',
      'v 10.1',
    ]);
  });

  it('ignores leading zeros, so they tie', () => {
    expect(naturalSortKey('agent 007')).toBe(naturalSortKey('agent 7'));
    expect(naturalSortKey('000')).toBe(naturalSortKey('0'));
    expect(naturalSort(['agent 010', 'agent 9'])).toEqual(['agent 9', 'agent 010']);
  });

  it('keeps digits before letters and leaves text without digits unchanged', () => {
    expect(naturalSort(['zelda', '2048', 'abc'])).toEqual(['2048', 'abc', 'zelda']);
    expect(naturalSortKey('the legend of zelda')).toBe('the legend of zelda');
    expect(naturalSortKey('')).toBe('');
  });

  it('sorts the same title without a number first', () => {
    expect(naturalSort(['halo 2', 'halo', 'halo 10'])).toEqual(['halo', 'halo 2', 'halo 10']);
  });
});
