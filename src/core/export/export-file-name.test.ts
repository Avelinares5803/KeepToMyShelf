import { describe, expect, it } from 'vitest';
import { exportFileName } from './export-file-name';

const DATE = new Date(2026, 10, 25, 18, 5);

describe('exportFileName', () => {
  it('names the profile, what is exported and when', () => {
    expect(exportFileName('Adrián', { format: 'json' }, 'es', DATE)).toBe(
      'KeepToMyShelf - Adrián - Biblioteca - 2026-11-25 18-05.json',
    );
    expect(exportFileName('Ana', { format: 'csv', kind: 'game', separator: ',' }, 'en', DATE)).toBe(
      'KeepToMyShelf - Ana - Video games - 2026-11-25 18-05.csv',
    );
  });

  it('replaces what a file name cannot have', () => {
    expect(exportFileName('a/b:c', { format: 'json' }, 'en', DATE)).toContain(' - a_b_c - ');
  });
});
