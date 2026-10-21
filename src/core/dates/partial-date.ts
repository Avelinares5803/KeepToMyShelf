import { ValidationError } from '../errors';

export type DatePrecision = 'year' | 'month' | 'day';

/**
 * A calendar date whose month and day may be unknown: "2021", "03/2021" or "14/03/2021".
 * Missing components are never invented.
 */
export interface PartialDate {
  readonly year: number;
  readonly month?: number;
  readonly day?: number;
}

const MIN_YEAR = 1;
const MAX_YEAR = 9999;
const ISO_PARTIAL_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Builds a validated partial date. A day can only be given together with a month. */
export function createPartialDate(year: number, month?: number, day?: number): PartialDate {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new ValidationError('date.invalid_year', `Invalid year: ${year}`);
  }
  if (month === undefined) {
    if (day !== undefined) {
      throw new ValidationError('date.day_without_month', 'A day requires a month');
    }
    return { year };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ValidationError('date.invalid_month', `Invalid month: ${month}`);
  }
  if (day === undefined) {
    return { year, month };
  }
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) {
    throw new ValidationError('date.invalid_day', `Invalid day ${day} for ${year}-${month}`);
  }
  return { year, month, day };
}

export function precisionOf(date: PartialDate): DatePrecision {
  if (date.day !== undefined) return 'day';
  if (date.month !== undefined) return 'month';
  return 'year';
}

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

/** Storage format: "YYYY", "YYYY-MM" or "YYYY-MM-DD". Sorting these strings sorts chronologically. */
export function toIsoPartialDate(date: PartialDate): string {
  let text = pad(date.year, 4);
  if (date.month !== undefined) text += `-${pad(date.month, 2)}`;
  if (date.day !== undefined) text += `-${pad(date.day, 2)}`;
  return text;
}

export function parseIsoPartialDate(text: string): PartialDate {
  const match = ISO_PARTIAL_DATE.exec(text);
  if (!match) {
    throw new ValidationError('date.invalid_format', `Invalid partial date: "${text}"`);
  }
  const [, year, month, day] = match;
  return createPartialDate(
    Number(year),
    month === undefined ? undefined : Number(month),
    day === undefined ? undefined : Number(day),
  );
}

/** First calendar day the partial date could refer to, as "YYYY-MM-DD". */
export function earliestDay(date: PartialDate): string {
  return toIsoPartialDate({ year: date.year, month: date.month ?? 1, day: date.day ?? 1 });
}

/** Last calendar day the partial date could refer to, as "YYYY-MM-DD". */
export function latestDay(date: PartialDate): string {
  const month = date.month ?? 12;
  return toIsoPartialDate({
    year: date.year,
    month,
    day: date.day ?? daysInMonth(date.year, month),
  });
}

/** True only when both dates have the same components, and therefore the same precision. */
export function isSameDate(a: PartialDate, b: PartialDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}
