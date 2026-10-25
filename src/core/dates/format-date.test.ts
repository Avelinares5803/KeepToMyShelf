import { describe, expect, it } from 'vitest';
import { formatPartialDate, localDayOf } from './format-date';

describe('formatPartialDate', () => {
  it.each([
    [{ year: 2021, month: 3, day: 4 }, '04/03/2021'],
    [{ year: 2021, month: 3 }, '03/2021'],
    [{ year: 2021 }, '2021'],
    [{ year: 987 }, '0987'],
  ])('Spanish: %j → %s', (date, text) => {
    expect(formatPartialDate(date, 'es')).toBe(text);
  });

  it.each([
    [{ year: 2021, month: 3, day: 4 }, '4 Mar 2021'],
    [{ year: 2021, month: 9 }, 'Sep 2021'],
    [{ year: 2021, month: 12, day: 31 }, '31 Dec 2021'],
    [{ year: 2021 }, '2021'],
  ])('English: %j → %s', (date, text) => {
    expect(formatPartialDate(date, 'en')).toBe(text);
  });
});

describe('localDayOf', () => {
  it('returns the local calendar day of a moment', () => {
    expect(localDayOf(new Date(2026, 9, 25, 23, 59))).toEqual({ year: 2026, month: 10, day: 25 });
  });
});
