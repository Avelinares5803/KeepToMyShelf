import { ITEM_KINDS, type ItemKind } from '../../shared/content';
import { catalogForRole, ITEM_ROLES, type ItemRole } from '../catalogs/catalogs';
import { MAX_HOURS_PLAYED } from '../items/duration';
import { ITEM_LIMITS, ITEM_STATUSES } from '../items/item-draft';
import { isValidRating } from '../items/rating';

export const FILTER_OPERATORS = ['is', 'isNot', 'gte', 'lte', 'isEmpty'] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** A column of `item` that holds 0 or 1. */
export type ItemFlagColumn = 'is_favorite' | 'is_replay' | 'owns_physical' | 'owns_digital';

/**
 * A whole number about an item, which may be missing:
 * - `releaseYear`: the year of its earliest release, the same date that sorts by release;
 * - `finishedYear`: the year of its end date; an empty or unknown one has no year;
 * - `hoursPlayed`: whole hours, compared with the minutes stored, so 10:30 is "at most 11";
 * - `seasons`: the seasons of a series.
 */
export const NUMBER_MEASURES = ['releaseYear', 'finishedYear', 'hoursPlayed', 'seasons'] as const;
export type NumberMeasure = (typeof NUMBER_MEASURES)[number];

/** The values each measure can have, the same that items can store. */
export const NUMBER_LIMITS: Readonly<Record<NumberMeasure, { min: number; max: number }>> = {
  releaseYear: { min: 1, max: 9999 },
  finishedYear: { min: 1, max: 9999 },
  hoursPlayed: { min: 0, max: MAX_HOURS_PLAYED },
  seasons: { min: 0, max: ITEM_LIMITS.count },
};

/**
 * Where a field's data lives. The query engine knows how to filter each type, so a new field
 * of an existing type only needs a descriptor in FILTER_FIELDS.
 */
export type FilterSource =
  /** A catalog value related to the item in this role. The value is the entry's id. */
  | { readonly type: 'role'; readonly role: ItemRole }
  /** A text column with a closed list of values, which may be missing. */
  | { readonly type: 'choice'; readonly column: 'status'; readonly values: readonly string[] }
  /** A yes/no column. */
  | { readonly type: 'flag'; readonly column: ItemFlagColumn }
  /** Named options stored as yes/no columns, so an item can match several of them. */
  | { readonly type: 'flags'; readonly columns: Readonly<Record<string, ItemFlagColumn>> }
  /** The stored rating (1..10), which may be missing. */
  | { readonly type: 'rating' }
  /** A whole number, which may be missing. */
  | { readonly type: 'number'; readonly measure: NumberMeasure }
  /** The collections the item is in. The value is the collection's id. */
  | { readonly type: 'collection' };

export interface FilterField {
  readonly id: string;
  readonly kinds: readonly ItemKind[];
  readonly source: FilterSource;
}

const SOURCE_OPERATORS: Record<FilterSource['type'], readonly FilterOperator[]> = {
  role: ['is', 'isNot'],
  choice: ['is', 'isNot', 'isEmpty'],
  flag: ['is'],
  flags: ['is', 'isNot'],
  rating: ['gte', 'lte', 'isEmpty'],
  number: ['gte', 'lte', 'isEmpty'],
  collection: ['is', 'isNot'],
};

const roleField = (role: ItemRole): FilterField => ({
  id: role,
  kinds: ITEM_KINDS.filter((kind) => catalogForRole(kind, role) !== null),
  source: { type: 'role', role },
});

/** Every field items can be filtered by. To add a filter, add its descriptor here. */
export const FILTER_FIELDS: readonly FilterField[] = [
  {
    id: 'status',
    kinds: ITEM_KINDS,
    source: { type: 'choice', column: 'status', values: ITEM_STATUSES },
  },
  { id: 'replay', kinds: ITEM_KINDS, source: { type: 'flag', column: 'is_replay' } },
  {
    id: 'format',
    kinds: ITEM_KINDS,
    source: {
      type: 'flags',
      columns: { physical: 'owns_physical', digital: 'owns_digital' },
    },
  },
  { id: 'rating', kinds: ITEM_KINDS, source: { type: 'rating' } },
  { id: 'favorite', kinds: ITEM_KINDS, source: { type: 'flag', column: 'is_favorite' } },
  { id: 'releaseYear', kinds: ITEM_KINDS, source: { type: 'number', measure: 'releaseYear' } },
  { id: 'finishedYear', kinds: ITEM_KINDS, source: { type: 'number', measure: 'finishedYear' } },
  { id: 'hoursPlayed', kinds: ['game'], source: { type: 'number', measure: 'hoursPlayed' } },
  { id: 'seasons', kinds: ['series'], source: { type: 'number', measure: 'seasons' } },
  ...ITEM_ROLES.map(roleField),
  { id: 'collection', kinds: ITEM_KINDS, source: { type: 'collection' } },
];

/** The field `id` if items of `kind` can be filtered by it. */
export function filterFieldFor(kind: ItemKind, id: string): FilterField | null {
  return FILTER_FIELDS.find((field) => field.id === id && field.kinds.includes(kind)) ?? null;
}

export function filterFieldsFor(kind: ItemKind): FilterField[] {
  return FILTER_FIELDS.filter((field) => field.kinds.includes(kind));
}

export function operatorsFor(source: FilterSource): readonly FilterOperator[] {
  return SOURCE_OPERATORS[source.type];
}

/** Whether `value` is what `operator` expects for a field with this source. */
export function isValidFilterValue(
  source: FilterSource,
  operator: FilterOperator,
  value: unknown,
): boolean {
  switch (source.type) {
    case 'role':
    case 'collection':
      return typeof value === 'number' && Number.isInteger(value) && value > 0;
    case 'choice':
      return operator === 'isEmpty'
        ? value === null
        : typeof value === 'string' && source.values.includes(value);
    case 'flag':
      return typeof value === 'boolean';
    case 'flags':
      return typeof value === 'string' && Object.hasOwn(source.columns, value);
    case 'rating':
      return operator === 'isEmpty'
        ? value === null
        : typeof value === 'number' && isValidRating(value);
    case 'number':
      return operator === 'isEmpty' ? value === null : isValidNumber(source.measure, value);
  }
}

/** Whether `value` is a whole number that `measure` can have. */
export function isValidNumber(measure: NumberMeasure, value: unknown): value is number {
  const { min, max } = NUMBER_LIMITS[measure];
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}
