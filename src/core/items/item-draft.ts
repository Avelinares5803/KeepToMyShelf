import type { ItemKind } from '../../shared/content';
import { createPartialDate } from '../dates/partial-date';
import { validateUsagePeriod, type UsageDate } from '../dates/usage-period';
import { ValidationError } from '../errors';
import { characterCount, cleanMultiLine, cleanSingleLine } from '../text/clean-text';
import { normalizeForSearch } from '../text/normalize';
import { MAX_HOURS_PLAYED } from './duration';
import {
  validateRelations,
  validateReleases,
  type ItemRelationsDraft,
  type ReleaseDraft,
} from './item-relations';
import { isValidRating } from './rating';

export const ITEM_STATUSES = ['not_started', 'in_progress', 'completed', 'abandoned'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** Sanity limits that protect against absurd input; they are not business limits. */
export const ITEM_LIMITS = {
  titleLength: 300,
  alternateTitles: 50,
  longTextLength: 50_000,
  count: 100_000,
} as const;

/** What the user typed in the item form. Every field is optional except the kind. */
export interface ItemDraft {
  readonly title: string;
  readonly alternateTitles: readonly string[];
  readonly description: string;
  readonly notes: string;
  readonly isFavorite: boolean;
  readonly rating: number | null;
  readonly status: ItemStatus | null;
  readonly isReplay: boolean;
  readonly ownsPhysical: boolean;
  readonly ownsDigital: boolean;
  readonly startedOn: UsageDate | null;
  readonly finishedOn: UsageDate | null;
  /** Video games only. */
  readonly minutesPlayed: number | null;
  /** Series only. */
  readonly seasonsCount: number | null;
  readonly episodesCount: number | null;
  /** Catalog values per role (platforms, genres, people...). */
  readonly relations: ItemRelationsDraft;
  readonly releases: readonly ReleaseDraft[];
}

/** A validated draft ready to be stored. A null title means "use a placeholder title". */
export interface ValidItemDraft extends Omit<ItemDraft, 'title' | 'description' | 'notes'> {
  readonly title: string | null;
  readonly description: string | null;
  readonly notes: string | null;
}

export const EMPTY_ITEM_DRAFT: ItemDraft = {
  title: '',
  alternateTitles: [],
  description: '',
  notes: '',
  isFavorite: false,
  rating: null,
  status: null,
  isReplay: false,
  ownsPhysical: false,
  ownsDigital: false,
  startedOn: null,
  finishedOn: null,
  minutesPlayed: null,
  seasonsCount: null,
  episodesCount: null,
  relations: {},
  releases: [],
};

interface TitleErrorCodes {
  readonly invalidCharacters: string;
  readonly tooLong: string;
}

const TITLE_ERRORS: TitleErrorCodes = {
  invalidCharacters: 'item.title_invalid_characters',
  tooLong: 'item.title_too_long',
};

const ALTERNATE_TITLE_ERRORS: TitleErrorCodes = {
  invalidCharacters: 'item.alternate_title_invalid_characters',
  tooLong: 'item.alternate_title_too_long',
};

function cleanTitle(raw: string, errors: TitleErrorCodes): string {
  const title = cleanSingleLine(raw);
  if (title === null) {
    throw new ValidationError(errors.invalidCharacters, 'Title has control characters');
  }
  if (characterCount(title) > ITEM_LIMITS.titleLength) {
    throw new ValidationError(errors.tooLong, 'Title is too long');
  }
  return title;
}

function cleanLongText(raw: string, code: string): string | null {
  const text = cleanMultiLine(raw);
  if (characterCount(text) > ITEM_LIMITS.longTextLength) {
    throw new ValidationError(code, 'Text is too long');
  }
  return text.length === 0 ? null : text;
}

/** Removes blank and repeated alternate titles (ignoring case and accents), keeping order. */
function cleanAlternateTitles(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const candidate of raw) {
    const title = cleanTitle(candidate, ALTERNATE_TITLE_ERRORS);
    const key = normalizeForSearch(title);
    if (title.length === 0 || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  if (titles.length > ITEM_LIMITS.alternateTitles) {
    throw new ValidationError('item.too_many_alternate_titles', 'Too many alternate titles');
  }
  return titles;
}

/** Dates may come from outside (e.g. the UI): re-check that each one exists in the calendar. */
function assertValidUsageDate(value: UsageDate | null): void {
  if (value?.kind === 'known') {
    createPartialDate(value.date.year, value.date.month, value.date.day);
  }
}

function assertCount(value: number | null, code: string, max: number): void {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value > max)) {
    throw new ValidationError(code, `Invalid number: ${value}`);
  }
}

/** Validates and cleans a draft for an item of the given kind. */
export function validateItemDraft(kind: ItemKind, draft: ItemDraft): ValidItemDraft {
  const title = cleanTitle(draft.title, TITLE_ERRORS);

  if (draft.rating !== null && !isValidRating(draft.rating)) {
    throw new ValidationError('item.invalid_rating', `Invalid rating: ${draft.rating}`);
  }
  assertValidUsageDate(draft.startedOn);
  assertValidUsageDate(draft.finishedOn);
  validateUsagePeriod(draft.startedOn, draft.finishedOn);

  if (kind !== 'game' && draft.minutesPlayed !== null) {
    throw new ValidationError('item.hours_only_for_games', 'Only video games have hours played');
  }
  assertCount(draft.minutesPlayed, 'item.invalid_hours', MAX_HOURS_PLAYED * 60 + 59);

  if (kind !== 'series' && (draft.seasonsCount !== null || draft.episodesCount !== null)) {
    throw new ValidationError('item.counts_only_for_series', 'Only series have seasons/episodes');
  }
  assertCount(draft.seasonsCount, 'item.invalid_count', ITEM_LIMITS.count);
  assertCount(draft.episodesCount, 'item.invalid_count', ITEM_LIMITS.count);

  return {
    ...draft,
    title: title.length === 0 ? null : title,
    alternateTitles: cleanAlternateTitles(draft.alternateTitles),
    description: cleanLongText(draft.description, 'item.description_too_long'),
    notes: cleanLongText(draft.notes, 'item.notes_too_long'),
    relations: validateRelations(kind, draft.relations),
    releases: validateReleases(draft.releases),
  };
}
