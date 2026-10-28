import type { ItemRole } from '../../../core/catalogs/catalogs';
import { createPartialDate, type PartialDate } from '../../../core/dates/partial-date';
import {
  knownUsageDate,
  UNKNOWN_USAGE_DATE,
  type UsageDate,
} from '../../../core/dates/usage-period';
import { ValidationError } from '../../../core/errors';
import { toHoursAndMinutes, toTotalMinutes } from '../../../core/items/duration';
import { validateItemDraft, type ItemDraft, type ItemStatus } from '../../../core/items/item-draft';
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

/** A partial date from its typed parts, or null when all of them are blank. */
function parsePartialDate(fields: Omit<DateFields, 'unknown'>): PartialDate | null {
  const year = parseNumber(fields.year);
  const month = parseNumber(fields.month);
  const day = parseNumber(fields.day);
  if (year === null && month === null && day === null) return null;
  if (year === null) {
    throw new ValidationError('date.invalid_year', 'A date needs a year');
  }
  // createPartialDate rejects impossible values (day 31 in April, a day without a month...).
  return createPartialDate(year, month ?? undefined, day ?? undefined);
}

function parseDateFields(fields: DateFields): UsageDate | null {
  if (fields.unknown) return UNKNOWN_USAGE_DATE;
  const date = parsePartialDate(fields);
  return date === null ? null : knownUsageDate(date);
}

function toRelationsDraft(relations: RelationFields): ItemRelationsDraft {
  return Object.fromEntries(
    Object.entries(relations).map(([role, choices]) => [role, choices.map(toRef)]),
  );
}

/** Rows left completely empty are ignored; any other row needs at least a year. */
function toReleasesDraft(rows: readonly ReleaseFields[]): ReleaseDraft[] {
  const releases: ReleaseDraft[] = [];
  for (const row of rows) {
    const date = parsePartialDate(row);
    if (date === null && row.region === null) continue;
    if (date === null) {
      throw new ValidationError('item.release_date_required', 'A release date needs a year');
    }
    releases.push({ region: row.region === null ? null : toRef(row.region), date });
  }
  return releases;
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
    relations: toRelationsDraft(form.relations),
    releases: toReleasesDraft(form.releases),
  };
  validateItemDraft(kind, draft);
  return draft;
}

/** Whether the form differs from its last saved state. */
export function hasChanges(current: ItemFormState, saved: ItemFormState): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved);
}
