import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  describeUsagePeriod,
  knownUsageDate,
  parseStoredUsageDate,
  toStoredUsageDate,
  UNKNOWN_USAGE_DATE,
  validateUsagePeriod,
} from './usage-period';

const year = (y: number) => knownUsageDate({ year: y });
const month = (y: number, m: number) => knownUsageDate({ year: y, month: m });
const day = (y: number, m: number, d: number) => knownUsageDate({ year: y, month: m, day: d });

describe('stored usage date', () => {
  it('round-trips known and unknown dates', () => {
    for (const value of [year(2020), month(2020, 3), day(2020, 3, 14), UNKNOWN_USAGE_DATE]) {
      expect(parseStoredUsageDate(toStoredUsageDate(value))).toEqual(value);
    }
    expect(toStoredUsageDate(UNKNOWN_USAGE_DATE)).toBe('unknown');
    expect(toStoredUsageDate(month(2020, 3))).toBe('2020-03');
  });

  it('rejects stored text that is neither a date nor "unknown"', () => {
    expect(() => parseStoredUsageDate('Unknown')).toThrow(ValidationError);
    expect(() => parseStoredUsageDate('')).toThrow(ValidationError);
  });
});

describe('validateUsagePeriod', () => {
  it.each([
    ['same exact day', day(2021, 3, 14), day(2021, 3, 14)],
    ['start before end', day(2021, 3, 14), day(2021, 3, 15)],
    ['year vs later month of the same year', year(2020), month(2020, 3)],
    ['month vs a day inside that month', month(2020, 3), day(2020, 3, 1)],
    ['same year twice', year(2020), year(2020)],
  ])('accepts %s', (_label, start, end) => {
    expect(() => validateUsagePeriod(start, end)).not.toThrow();
  });

  it.each([
    ['end day before start day', day(2021, 3, 15), day(2021, 3, 14)],
    ['end year before start year', year(2021), month(2020, 3)],
    ['end month before start month', month(2020, 5), day(2020, 4, 30)],
  ])('rejects %s', (_label, start, end) => {
    try {
      validateUsagePeriod(start, end);
      expect.fail('Expected ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe('date.end_before_start');
    }
  });

  it('never compares unknown or absent dates', () => {
    expect(() => validateUsagePeriod(UNKNOWN_USAGE_DATE, year(1990))).not.toThrow();
    expect(() => validateUsagePeriod(year(2020), UNKNOWN_USAGE_DATE)).not.toThrow();
    expect(() => validateUsagePeriod(null, year(1990))).not.toThrow();
    expect(() => validateUsagePeriod(year(2020), null)).not.toThrow();
  });
});

describe('describeUsagePeriod', () => {
  it('shows nothing when no date was provided', () => {
    expect(describeUsagePeriod(null, null)).toEqual({ kind: 'none' });
  });

  it('collapses identical dates with the same precision into a single date', () => {
    expect(describeUsagePeriod(day(2021, 3, 14), day(2021, 3, 14))).toEqual({
      kind: 'single',
      date: { year: 2021, month: 3, day: 14 },
    });
    expect(describeUsagePeriod(year(2021), year(2021))).toEqual({
      kind: 'single',
      date: { year: 2021 },
    });
  });

  it('keeps both dates when they differ or have different precision', () => {
    expect(describeUsagePeriod(year(2021), month(2021, 1))).toEqual({
      kind: 'period',
      start: year(2021),
      end: month(2021, 1),
    });
  });

  it('shows only the date that was provided', () => {
    expect(describeUsagePeriod(null, day(2021, 3, 14))).toEqual({
      kind: 'period',
      start: null,
      end: day(2021, 3, 14),
    });
    expect(describeUsagePeriod(month(2021, 3), null)).toEqual({
      kind: 'period',
      start: month(2021, 3),
      end: null,
    });
  });

  it('never collapses unknown dates', () => {
    expect(describeUsagePeriod(UNKNOWN_USAGE_DATE, UNKNOWN_USAGE_DATE)).toEqual({
      kind: 'period',
      start: UNKNOWN_USAGE_DATE,
      end: UNKNOWN_USAGE_DATE,
    });
  });
});
