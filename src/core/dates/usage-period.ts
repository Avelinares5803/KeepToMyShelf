import { ValidationError } from '../errors';
import {
  earliestDay,
  isSameDate,
  latestDay,
  parseIsoPartialDate,
  toIsoPartialDate,
  type PartialDate,
} from './partial-date';

/**
 * Start or end of the period in which an item was played or watched.
 * "unknown" means the user knows the event happened but not when ("Indeterminado").
 * An absent date (not provided at all) is represented with `null` by callers.
 */
export type UsageDate =
  { readonly kind: 'known'; readonly date: PartialDate } | { readonly kind: 'unknown' };

export const UNKNOWN_USAGE_DATE: UsageDate = { kind: 'unknown' };

const UNKNOWN_STORAGE_VALUE = 'unknown';

export function knownUsageDate(date: PartialDate): UsageDate {
  return { kind: 'known', date };
}

/** Storage format: an ISO partial date ("2021-03") or the literal "unknown". */
export function toStoredUsageDate(value: UsageDate): string {
  return value.kind === 'unknown' ? UNKNOWN_STORAGE_VALUE : toIsoPartialDate(value.date);
}

export function parseStoredUsageDate(text: string): UsageDate {
  return text === UNKNOWN_STORAGE_VALUE
    ? UNKNOWN_USAGE_DATE
    : knownUsageDate(parseIsoPartialDate(text));
}

/**
 * Rejects a period whose start is certainly after its end.
 *
 * Partial dates are treated as ranges of days, so "2020" → "03/2020" is accepted (the start
 * could be in January or February), while "2021" → "03/2020" is rejected. Unknown or absent
 * dates are never compared.
 */
export function validateUsagePeriod(start: UsageDate | null, end: UsageDate | null): void {
  if (start?.kind !== 'known' || end?.kind !== 'known') return;
  if (earliestDay(start.date) > latestDay(end.date)) {
    throw new ValidationError(
      'date.end_before_start',
      `End ${toIsoPartialDate(end.date)} is before start ${toIsoPartialDate(start.date)}`,
    );
  }
}

export type UsagePeriodView =
  | { readonly kind: 'none' }
  | { readonly kind: 'single'; readonly date: PartialDate }
  | { readonly kind: 'period'; readonly start: UsageDate | null; readonly end: UsageDate | null };

/**
 * Decides what the detail view shows: nothing, a single date (start and end are identical,
 * with the same precision) or the provided start and/or end.
 */
export function describeUsagePeriod(
  start: UsageDate | null,
  end: UsageDate | null,
): UsagePeriodView {
  if (start === null && end === null) return { kind: 'none' };
  if (start?.kind === 'known' && end?.kind === 'known' && isSameDate(start.date, end.date)) {
    return { kind: 'single', date: start.date };
  }
  return { kind: 'period', start, end };
}
