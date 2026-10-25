import { createPartialDate } from '../../../core/dates/partial-date';
import {
  knownUsageDate,
  UNKNOWN_USAGE_DATE,
  type UsageDate,
} from '../../../core/dates/usage-period';
import { ValidationError } from '../../../core/errors';
import { toHoursAndMinutes, toTotalMinutes } from '../../../core/items/duration';
import { validateItemDraft, type ItemDraft, type ItemStatus } from '../../../core/items/item-draft';
import {
  toOwnershipFlags,
  toOwnershipFormat,
  type OwnershipFormat,
} from '../../../core/items/ownership';
import type { ItemKind } from '../../../shared/content';
import type { ItemDetails } from '../../../shared/items';

/** Date inputs as typed: every part optional, or "unknown". */
export interface DateFields {
  readonly day: string;
  readonly month: string;
  readonly year: string;
  readonly unknown: boolean;
}

/** The edit form's state. Numbers are kept as typed text until the form is saved. */
export interface ItemFormState {
  readonly title: string;
  readonly alternateTitles: readonly string[];
  readonly description: string;
  readonly notes: string;
  readonly isFavorite: boolean;
  readonly rating: number | null;
  readonly status: ItemStatus | '';
  readonly isReplay: boolean;
  readonly format: OwnershipFormat | '';
  readonly startedOn: DateFields;
  readonly finishedOn: DateFields;
  readonly hours: string;
  readonly minutes: string;
  readonly seasons: string;
  readonly episodes: string;
}

export const EMPTY_DATE_FIELDS: DateFields = { day: '', month: '', year: '', unknown: false };

const text = (value: number | undefined | null) => (value == null ? '' : String(value));

function toDateFields(value: UsageDate | null): DateFields {
  if (value === null) return EMPTY_DATE_FIELDS;
  if (value.kind === 'unknown') return { ...EMPTY_DATE_FIELDS, unknown: true };
  return {
    day: text(value.date.day),
    month: text(value.date.month),
    year: text(value.date.year),
    unknown: false,
  };
}

export function toFormState(item: ItemDetails | null): ItemFormState {
  const duration = item?.minutesPlayed == null ? null : toHoursAndMinutes(item.minutesPlayed);
  return {
    title: item?.title ?? '',
    alternateTitles: item?.alternateTitles ?? [],
    description: item?.description ?? '',
    notes: item?.notes ?? '',
    isFavorite: item?.isFavorite ?? false,
    rating: item?.rating ?? null,
    status: item?.status ?? '',
    isReplay: item?.isReplay ?? false,
    format: item ? (toOwnershipFormat(item) ?? '') : '',
    startedOn: toDateFields(item?.startedOn ?? null),
    finishedOn: toDateFields(item?.finishedOn ?? null),
    hours: text(duration?.hours),
    minutes: text(duration?.minutes),
    seasons: text(item?.seasonsCount),
    episodes: text(item?.episodesCount),
  };
}

/** A whole number typed by the user, or NaN; blank text is "not provided". */
function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function parseDateFields(fields: DateFields): UsageDate | null {
  if (fields.unknown) return UNKNOWN_USAGE_DATE;
  const year = parseNumber(fields.year);
  const month = parseNumber(fields.month);
  const day = parseNumber(fields.day);
  if (year === null && month === null && day === null) return null;
  if (year === null) {
    throw new ValidationError('date.invalid_year', 'A date needs a year');
  }
  // createPartialDate rejects impossible values (day 31 in April, a day without a month...).
  return knownUsageDate(createPartialDate(year, month ?? undefined, day ?? undefined));
}

function parseDuration(hours: string, minutes: string): number | null {
  const h = parseNumber(hours);
  const m = parseNumber(minutes);
  if (h === null && m === null) return null;
  return toTotalMinutes({ hours: h ?? 0, minutes: m ?? 0 });
}

/**
 * Converts the form into a draft for an item of `kind`, checking it with the same rules
 * the main process applies, so most errors appear before anything is sent.
 * Fields that do not apply to the kind are left out.
 */
export function toItemDraft(kind: ItemKind, form: ItemFormState): ItemDraft {
  const draft: ItemDraft = {
    title: form.title,
    alternateTitles: form.alternateTitles,
    description: form.description,
    notes: form.notes,
    isFavorite: form.isFavorite,
    rating: form.rating,
    status: form.status === '' ? null : form.status,
    isReplay: form.isReplay,
    ...toOwnershipFlags(form.format === '' ? null : form.format),
    startedOn: parseDateFields(form.startedOn),
    finishedOn: parseDateFields(form.finishedOn),
    minutesPlayed: kind === 'game' ? parseDuration(form.hours, form.minutes) : null,
    seasonsCount: kind === 'series' ? parseNumber(form.seasons) : null,
    episodesCount: kind === 'series' ? parseNumber(form.episodes) : null,
  };
  validateItemDraft(kind, draft);
  return draft;
}

/** Whether the form differs from its last saved state. */
export function hasChanges(current: ItemFormState, saved: ItemFormState): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved);
}
