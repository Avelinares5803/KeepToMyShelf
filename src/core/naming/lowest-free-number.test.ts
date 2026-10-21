import { describe, expect, it } from 'vitest';
import { lowestFreeNumber } from './lowest-free-number';

describe('lowestFreeNumber', () => {
  it('starts at 1 when nothing is used', () => {
    expect(lowestFreeNumber([])).toBe(1);
  });

  it('returns the next number after a contiguous sequence', () => {
    expect(lowestFreeNumber([1, 2, 3])).toBe(4);
  });

  it('reuses the lowest gap left by deleted or renamed items', () => {
    expect(lowestFreeNumber([1, 2, 4])).toBe(3);
    expect(lowestFreeNumber([2, 3])).toBe(1);
  });

  it('ignores order and duplicates', () => {
    expect(lowestFreeNumber([3, 1, 1, 2, 5])).toBe(4);
  });
});
