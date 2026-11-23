import type { ItemKind } from '../../shared/content';
import { createPartialDate } from '../dates/partial-date';
import { validateUsagePeriod, type UsageDate } from '../dates/usage-period';
import { ValidationError } from '../errors';
import { FieldErrorCollector, type FieldError } from '../field-errors';
import { characterCount, cleanMultiLine, cleanSingleLine } from '../text/clean-text';
import { normalizeForSearch } from '../text/normalize';
import { MAX_HOURS_PLAYED } from './duration';
import {
  assertReleaseCount,
  validateRelations,
  validateRelease,
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

/**
 * Removes blank and repeated alternate titles (ignoring case and accents), keeping order.
 * Errors are recorded per title (`alternateTitles.<index>`) and for the whole list.
 */
function cleanAlternateTitles(raw: readonly string[], errors: FieldErrorCollector): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  raw.forEach((candidate, index) => {
    const title = errors.check(`alternateTitles.${index}`, () =>
      cleanTitle(candidate, ALTERNATE_TITLE_ERRORS),
    );
    if (title === undefined) return;
    const key = normalizeForSearch(title);
    if (title.length === 0 || seen.has(key)) return;
    seen.add(key);
    titles.push(title);
  });
  if (titles.length > ITEM_LIMITS.alternateTitles) {
    errors.add('alternateTitles', 'item.too_many_alternate_titles', 'Too many alternate titles');
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

/** The result of checking a draft: the clean draft, or every error found, by field. */
export type ItemDraftCheck =
  | { readonly ok: true; readonly value: ValidItemDraft }
  | { readonly ok: false; readonly errors: readonly FieldError[] };

/**
 * Checks every field of a draft for an item of the given kind and gathers all the errors.
 * Fields: `title`, `alternateTitles.<index>`, `alternateTitles`, `description`, `notes`,
 * `rating`, `startedOn`, `finishedOn` (also when it is before the start), `minutesPlayed`,
 * `seasonsCount`, `episodesCount`, `relations`, `releases` and `releases.<index>`.
 * The errors come in the order `validateItemDraft` has always reported them.
 */
export function checkItemDraft(kind: ItemKind, draft: ItemDraft): ItemDraftCheck {
  const errors = new FieldErrorCollector();
  const title = errors.check('title', () => cleanTitle(draft.title, TITLE_ERRORS));

  if (draft.rating !== null && !isValidRating(draft.rating)) {
    errors.add('rating', 'item.invalid_rating', `Invalid rating: ${draft.rating}`);
  }
  errors.check('startedOn', () => assertValidUsageDate(draft.startedOn));
  errors.check('finishedOn', () => assertValidUsageDate(draft.finishedOn));
  if (!errors.has('startedOn') && !errors.has('finishedOn')) {
    errors.check('finishedOn', () => validateUsagePeriod(draft.startedOn, draft.finishedOn));
  }

  if (kind !== 'game' && draft.minutesPlayed !== null) {
    errors.add('minutesPlayed', 'item.hours_only_for_games', 'Only video games have hours played');
  }
  errors.check('minutesPlayed', () =>
    assertCount(draft.minutesPlayed, 'item.invalid_hours', MAX_HOURS_PLAYED * 60 + 59),
  );

  if (kind !== 'series') {
    const field = draft.seasonsCount !== null ? 'seasonsCount' : 'episodesCount';
    if (draft.seasonsCount !== null || draft.episodesCount !== null) {
      errors.add(field, 'item.counts_only_for_series', 'Only series have seasons/episodes');
    }
  }
  errors.check('seasonsCount', () =>
    assertCount(draft.seasonsCount, 'item.invalid_count', ITEM_LIMITS.count),
  );
  errors.check('episodesCount', () =>
    assertCount(draft.episodesCount, 'item.invalid_count', ITEM_LIMITS.count),
  );

  const alternateTitles = cleanAlternateTitles(draft.alternateTitles, errors);
  const description = errors.check('description', () =>
    cleanLongText(draft.description, 'item.description_too_long'),
  );
  const notes = errors.check('notes', () => cleanLongText(draft.notes, 'item.notes_too_long'));
  const relations = errors.check('relations', () => validateRelations(kind, draft.relations));
  errors.check('releases', () => assertReleaseCount(draft.releases));
  const releases = draft.releases.map((release, index) =>
    errors.check(`releases.${index}`, () => validateRelease(release)),
  );

  const validReleases = releases.filter((release) => release !== undefined);
  // A check returns undefined only when it recorded an error, so these go together.
  if (
    errors.errors.length > 0 ||
    title === undefined ||
    description === undefined ||
    notes === undefined ||
    relations === undefined ||
    validReleases.length !== releases.length
  ) {
    return { ok: false, errors: errors.errors };
  }
  return {
    ok: true,
    value: {
      ...draft,
      title: title.length === 0 ? null : title,
      alternateTitles,
      description,
      notes,
      relations,
      releases: validReleases,
    },
  };
}

/** Validates and cleans a draft for an item of the given kind, throwing its first error. */
export function validateItemDraft(kind: ItemKind, draft: ItemDraft): ValidItemDraft {
  const result = checkItemDraft(kind, draft);
  if (result.ok) return result.value;
  const [first] = result.errors;
  if (first === undefined) throw new Error('An item draft check failed without an error');
  throw new ValidationError(first.code, first.message);
}
