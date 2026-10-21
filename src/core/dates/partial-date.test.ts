import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  createPartialDate,
  daysInMonth,
  earliestDay,
  isSameDate,
  latestDay,
  parseIsoPartialDate,
  precisionOf,
  toIsoPartialDate,
} from './partial-date';

function expectValidationError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe(code);
    return;
  }
  expect.fail(`Expected ValidationError with code "${code}"`);
}

describe('createPartialDate', () => {
  it('creates dates with year, month or day precision without inventing components', () => {
    expect(createPartialDate(2021)).toEqual({ year: 2021 });
    expect(createPartialDate(2021, 3)).toEqual({ year: 2021, month: 3 });
    expect(createPartialDate(2021, 3, 14)).toEqual({ year: 2021, month: 3, day: 14 });
  });

  it.each([0, 10000, 2021.5, Number.NaN])('rejects invalid year %s', (year) => {
    expectValidationError(() => createPartialDate(year), 'date.invalid_year');
  });

  it.each([0, 13, 1.5])('rejects invalid month %s', (month) => {
    expectValidationError(() => createPartialDate(2021, month), 'date.invalid_month');
  });

  it('rejects a day without a month', () => {
    expectValidationError(() => createPartialDate(2021, undefined, 5), 'date.day_without_month');
  });

  it.each([
    [2021, 4, 31],
    [2023, 2, 29],
    [1900, 2, 29],
    [2021, 1, 0],
  ])('rejects day that does not exist: %s-%s-%s', (year, month, day) => {
    expectValidationError(() => createPartialDate(year, month, day), 'date.invalid_day');
  });

  it('accepts 29 February in leap years', () => {
    expect(createPartialDate(2024, 2, 29)).toEqual({ year: 2024, month: 2, day: 29 });
    expect(createPartialDate(2000, 2, 29)).toEqual({ year: 2000, month: 2, day: 29 });
  });
});

describe('daysInMonth', () => {
  it.each([
    [2021, 1, 31],
    [2021, 4, 30],
    [2023, 2, 28],
    [2024, 2, 29],
    [2021, 12, 31],
  ])('%s-%s has %s days', (year, month, days) => {
    expect(daysInMonth(year, month)).toBe(days);
  });
});

describe('precisionOf', () => {
  it('reports the most specific component provided', () => {
    expect(precisionOf({ year: 2021 })).toBe('year');
    expect(precisionOf({ year: 2021, month: 3 })).toBe('month');
    expect(precisionOf({ year: 2021, month: 3, day: 14 })).toBe('day');
  });
});

describe('ISO partial date format', () => {
  it.each([
    [{ year: 2021 }, '2021'],
    [{ year: 2021, month: 3 }, '2021-03'],
    [{ year: 2021, month: 3, day: 4 }, '2021-03-04'],
    [{ year: 987 }, '0987'],
  ])('round-trips %j ↔ "%s"', (date, text) => {
    expect(toIsoPartialDate(date)).toBe(text);
    expect(parseIsoPartialDate(text)).toEqual(date);
  });

  it.each([
    '',
    '21',
    '2021-3',
    '2021-03-4',
    '2021/03/04',
    '04-03-2021',
    '2021-03-04T00:00',
    ' 2021',
  ])('rejects malformed text "%s"', (text) => {
    expectValidationError(() => parseIsoPartialDate(text), 'date.invalid_format');
  });

  it('rejects well-formed text with impossible values', () => {
    expectValidationError(() => parseIsoPartialDate('2021-13'), 'date.invalid_month');
    expectValidationError(() => parseIsoPartialDate('2021-02-30'), 'date.invalid_day');
  });

  it('sorts chronologically when compared as strings', () => {
    const sorted = ['2021-03-04', '2020', '2021', '2021-03', '2020-12-31'].sort();
    expect(sorted).toEqual(['2020', '2020-12-31', '2021', '2021-03', '2021-03-04']);
  });
});

describe('earliestDay / latestDay', () => {
  it.each([
    [{ year: 2020 }, '2020-01-01', '2020-12-31'],
    [{ year: 2024, month: 2 }, '2024-02-01', '2024-02-29'],
    [{ year: 2023, month: 2 }, '2023-02-01', '2023-02-28'],
    [{ year: 2021, month: 3, day: 14 }, '2021-03-14', '2021-03-14'],
  ])('%j spans %s … %s', (date, earliest, latest) => {
    expect(earliestDay(date)).toBe(earliest);
    expect(latestDay(date)).toBe(latest);
  });
});

describe('isSameDate', () => {
  it('requires identical components and precision', () => {
    expect(isSameDate({ year: 2021, month: 3, day: 14 }, { year: 2021, month: 3, day: 14 })).toBe(
      true,
    );
    expect(isSameDate({ year: 2021 }, { year: 2021 })).toBe(true);
    expect(isSameDate({ year: 2021 }, { year: 2021, month: 1 })).toBe(false);
    expect(isSameDate({ year: 2021, month: 3 }, { year: 2021, month: 4 })).toBe(false);
  });
});
