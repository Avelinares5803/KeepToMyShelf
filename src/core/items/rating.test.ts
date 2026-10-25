import { describe, expect, it } from 'vitest';
import { isValidRating, ratingToStars, starsToRating } from './rating';

describe('rating', () => {
  it('accepts whole values from 1 (half a star) to 10 (five stars)', () => {
    for (let value = 1; value <= 10; value += 1) expect(isValidRating(value)).toBe(true);
  });

  it.each([0, 11, -1, 4.5, Number.NaN])('rejects %s', (value) => {
    expect(isValidRating(value)).toBe(false);
  });

  it('converts between stored values and stars', () => {
    expect(ratingToStars(1)).toBe(0.5);
    expect(ratingToStars(7)).toBe(3.5);
    expect(ratingToStars(10)).toBe(5);
    expect(starsToRating(0.5)).toBe(1);
    expect(starsToRating(3.5)).toBe(7);
    expect(starsToRating(5)).toBe(10);
  });

  it('refuses star values that are not half-star steps or out of range', () => {
    expect(starsToRating(0)).toBeNull();
    expect(starsToRating(3.25)).toBeNull();
    expect(starsToRating(5.5)).toBeNull();
  });
});
