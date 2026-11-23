import type { ItemRole } from '../../../core/catalogs/catalogs';
import { createPartialDate, type PartialDate } from '../../../core/dates/partial-date';
import {
  knownUsageDate,
  UNKNOWN_USAGE_DATE,
  type UsageDate,
} from '../../../core/dates/usage-period';
import { ValidationError } from '../../../core/errors';
import { FieldErrorCollector, type FieldError } from '../../../core/field-errors';
import { toHoursAndMinutes, toTotalMinutes } from '../../../core/items/duration';
import { checkItemDraft, type ItemDraft, type ItemStatus } from '../../../core/items/item-draft';
import type {
  EntryRef,
  ItemRelationsDraft,
  ReleaseDraft,
} from '../../../core/items/item-relations';
import {
  toOwnershipFlags,
  toOwnershipFormat,
  type OwnershipFormat,
} from '../../../core/items/ownership';
import type { ItemKind } from '../../../shared/content';
import type { EntryName, ItemDetails } from '../../../shared/items';
import type { EntryChoice } from './entry-picker';

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
  readonly relations: RelationFields;
  readonly releases: readonly ReleaseFields[];
}

/** The values chosen for each role, with their names so the form can show them. */
export type RelationFields = Readonly<Partial<Record<ItemRole, readonly EntryChoice[]>>>;

/** A release date row as typed: an optional region and the parts of the date. */
export interface ReleaseFields {
  readonly region: EntryChoice | null;
  readonly day: string;
  readonly month: string;
  readonly year: string;
}

export const EMPTY_DATE_FIELDS: DateFields = { day: '', month: '', year: '', unknown: false };
export const EMPTY_RELEASE_FIELDS: ReleaseFields = { region: null, day: '', month: '', year: '' };

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

const existing = ({ id, name }: EntryName): EntryChoice => ({ kind: 'existing', id, name });

const toRef = (choice: EntryChoice): EntryRef =>
  choice.kind === 'existing' ? { kind: 'existing', id: choice.id } : choice;

function toRelationFields(relations: ItemDetails['relations']): RelationFields {
  return Object.fromEntries(
    Object.entries(relations).map(([role, entries]) => [role, entries.map(existing)]),
  );
}

function toReleaseFields({ region, date }: ItemDetails['releases'][number]): ReleaseFields {
  return {
    region: region === null ? null : existing(region),
    day: text(date.day),
    month: text(date.month),
    year: text(date.year),
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
    relations: item ? toRelationFields(item.relations) : {},
    releases: item?.releases.map(toReleaseFields) ?? [],
  };
}

/** A whole number typed by the user, or NaN; blank text is "not provided". */
function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

/** The part of a date (day, month or year) an error code points at. */
function datePart(code: string): keyof Omit<DateFields, 'unknown'> {
  if (code === 'date.invalid_day') return 'day';
  if (code === 'date.invalid_month' || code === 'date.day_without_month') return 'month';
  return 'year';
}

/**
 * A partial date from its typed parts, null when all of them are blank, or undefined when
 * they are not valid; the error is recorded for the part at fault (`<field>.day`...).
 */
function parsePartialDate(
  fields: Omit<DateFields, 'unknown'>,
  field: string,
  errors: FieldErrorCollector,
): PartialDate | null | undefined {
  const year = parseNumber(fields.year);
  const month = parseNumber(fields.month);
  const day = parseNumber(fields.day);
  if (year === null && month === null && day === null) return null;
  if (year === null) {
    errors.add(`${field}.year`, 'date.invalid_year', 'A date needs a year');
    return undefined;
  }
  // createPartialDate rejects impossible values (day 31 in April, a day without a month...).
  return errors.check(
    (code) => `${field}.${datePart(code)}`,
    () => createPartialDate(year, month ?? undefined, day ?? undefined),
  );
}

/** A usage date, or null when it is blank or not valid (its error is recorded). */
function parseDateFields(
  fields: DateFields,
  field: string,
  errors: FieldErrorCollector,
): UsageDate | null {
  if (fields.unknown) return UNKNOWN_USAGE_DATE;
  const date = parsePartialDate(fields, field, errors);
  return date == null ? null : knownUsageDate(date);
}

function toRelationsDraft(relations: RelationFields): ItemRelationsDraft {
  return Object.fromEntries(
    Object.entries(relations).map(([role, choices]) => [role, choices.map(toRef)]),
  );
}

/**
 * Rows left completely empty are ignored; any other row needs at least a year. Returns the
 * releases and, for each one, the index of the row it comes from.
 */
function toReleasesDraft(
  rows: readonly ReleaseFields[],
  errors: FieldErrorCollector,
): { releases: ReleaseDraft[]; rowIndexes: number[] } {
  const releases: ReleaseDraft[] = [];
  const rowIndexes: number[] = [];
  rows.forEach((row, index) => {
    const date = parsePartialDate(row, `releases.${index}`, errors);
    if (date === undefined) return;
    if (date === null && row.region === null) return;
    if (date === null) {
      errors.add(
        `releases.${index}.year`,
        'item.release_date_required',
        'A release date needs a year',
      );
      return;
    }
    releases.push({ region: row.region === null ? null : toRef(row.region), date });
    rowIndexes.push(index);
  });
  return { releases, rowIndexes };
}

/** Total minutes, or null when blank or not valid (the error goes to `hours` or `minutes`). */
function parseDuration(hours: string, minutes: string, errors: FieldErrorCollector): number | null {
  const h = parseNumber(hours);
  const m = parseNumber(minutes);
  if (h === null && m === null) return null;
  return (
    errors.check(
      (code) => (code === 'item.invalid_minutes' ? 'minutes' : 'hours'),
      () => toTotalMinutes({ hours: h ?? 0, minutes: m ?? 0 }),
    ) ?? null
  );
}

/**
 * The form field that shows an error of the draft (see `checkItemDraft`), or null when no
 * single field of the form shows it (too many alternate titles, a catalog value...).
 */
function formFieldFor(error: FieldError, rowIndexes: readonly number[]): string | null {
  const [field = '', index] = error.field.split('.');
  switch (field) {
    case 'title':
    case 'description':
    case 'notes':
      return field;
    case 'alternateTitles':
      return index === undefined ? null : error.field;
    case 'startedOn':
    case 'finishedOn':
      return `${field}.${datePart(error.code)}`;
    case 'minutesPlayed':
      return 'hours';
    case 'seasonsCount':
      return 'seasons';
    case 'episodesCount':
      return 'episodes';
    case 'releases': {
      const row = index === undefined ? undefined : rowIndexes[Number(index)];
      return row !== undefined && error.code.startsWith('date.')
        ? `releases.${row}.${datePart(error.code)}`
        : null;
    }
    default:
      return null;
  }
}

/** The result of checking the form: the draft, or the errors found. */
export interface ItemFormCheck {
  /** Null when there is any error. */
  readonly draft: ItemDraft | null;
  /**
   * Errors shown next to a field. Fields: `title`, `alternateTitles.<index>`, `description`,
   * `notes`, `startedOn.<part>`, `finishedOn.<part>` (part: day, month or year), `hours`,
   * `minutes`, `seasons`, `episodes` and `releases.<row>.<part>`.
   */
  readonly fieldErrors: readonly FieldError[];
  /** Errors that no single field shows. */
  readonly otherErrors: readonly FieldError[];
}

/**
 * Converts the form into a draft for an item of `kind`, checking every field with the same
 * rules the main process applies, so the errors appear before anything is sent.
 * Fields that do not apply to the kind are left out.
 */
export function checkItemForm(kind: ItemKind, form: ItemFormState): ItemFormCheck {
  const errors = new FieldErrorCollector();
  const { releases, rowIndexes } = toReleasesDraft(form.releases, errors);
  // Fields that could not be read are left blank, so the draft's own checks skip them.
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
    startedOn: parseDateFields(form.startedOn, 'startedOn', errors),
    finishedOn: parseDateFields(form.finishedOn, 'finishedOn', errors),
    minutesPlayed: kind === 'game' ? parseDuration(form.hours, form.minutes, errors) : null,
    seasonsCount: kind === 'series' ? parseNumber(form.seasons) : null,
    episodesCount: kind === 'series' ? parseNumber(form.episodes) : null,
    relations: toRelationsDraft(form.relations),
    releases,
  };

  const otherErrors: FieldError[] = [];
  const checked = checkItemDraft(kind, draft);
  if (!checked.ok) {
    for (const error of checked.errors) {
      const field = formFieldFor(error, rowIndexes);
      if (field === null) otherErrors.push(error);
      else errors.add(field, error.code, error.message);
    }
  }
  const valid = errors.errors.length === 0 && otherErrors.length === 0;
  return { draft: valid ? draft : null, fieldErrors: errors.errors, otherErrors };
}

/** Like `checkItemForm`, but throws the first error. */
export function toItemDraft(kind: ItemKind, form: ItemFormState): ItemDraft {
  const { draft, fieldErrors, otherErrors } = checkItemForm(kind, form);
  if (draft !== null) return draft;
  const [first] = [...fieldErrors, ...otherErrors];
  if (first === undefined) throw new Error('The item form check failed without an error');
  throw new ValidationError(first.code, first.message);
}

/** Whether the form differs from its last saved state. */
export function hasChanges(current: ItemFormState, saved: ItemFormState): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved);
}
