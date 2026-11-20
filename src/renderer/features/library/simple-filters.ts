import type { ItemRole } from '../../../core/catalogs/catalogs';
import { isValidNumber, type NumberMeasure } from '../../../core/filters/filter-fields';
import type { FilterCondition, FilterNode } from '../../../core/filters/filter-tree';
import type { ItemStatus } from '../../../core/items/item-draft';
import type { ItemFilterValues } from '../../../shared/items';

export const FORMAT_OPTIONS = ['physical', 'digital'] as const;
export type FormatOption = (typeof FORMAT_OPTIONS)[number];

/** What is marked in the simple filters of a library. */
export interface SimpleFilters {
  readonly favorite: boolean;
  readonly replay: boolean;
  readonly status: readonly ItemStatus[];
  readonly format: readonly FormatOption[];
  /** "At least" this stored rating (1..10). */
  readonly minRating: number | null;
  readonly unrated: boolean;
  /** Ids of the catalog values marked in each role. */
  readonly roles: Readonly<Partial<Record<ItemRole, readonly number[]>>>;
  /** "From" and "to" of each number, as typed: only valid numbers apply. */
  readonly ranges: Readonly<Partial<Record<NumberMeasure, NumberRangeText>>>;
  /** Ids of the collections marked. */
  readonly collections: readonly number[];
}

export interface NumberRangeText {
  readonly from: string;
  readonly to: string;
}

export const NO_SIMPLE_FILTERS: SimpleFilters = {
  favorite: false,
  replay: false,
  status: [],
  format: [],
  minRating: null,
  unrated: false,
  roles: {},
  ranges: {},
  collections: [],
};

/** The number typed, if `measure` can have it; null when empty or not valid. */
export function parseBound(measure: NumberMeasure, text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,9}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return isValidNumber(measure, value) ? value : null;
}

/** Whether `text` is something that does not apply: neither empty nor a valid number. */
export const isInvalidBound = (measure: NumberMeasure, text: string) =>
  text.trim() !== '' && parseBound(measure, text) === null;

/** The bounds of a range that apply, as conditions on its field. */
function rangeConditions(measure: NumberMeasure, range: NumberRangeText): FilterCondition[] {
  const bounds = [
    ['gte', parseBound(measure, range.from)],
    ['lte', parseBound(measure, range.to)],
  ] as const;
  return bounds.flatMap(([operator, value]) =>
    value === null ? [] : [{ type: 'condition', field: measure, operator, value } as const],
  );
}

const is = (field: string, value: FilterCondition['value']): FilterCondition => ({
  type: 'condition',
  field,
  operator: 'is',
  value,
});

/**
 * The tree the simple filters mean: any of the marks of an attribute (OR), and all the
 * attributes with marks (AND). A range must keep both its bounds (AND). Undefined when nothing
 * is marked.
 */
export function toFilterTree(filters: SimpleFilters): FilterNode | undefined {
  const anyOf: FilterNode[][] = [
    filters.favorite ? [is('favorite', true)] : [],
    filters.replay ? [is('replay', true)] : [],
    filters.status.map((status) => is('status', status)),
    filters.format.map((format) => is('format', format)),
    [
      ...(filters.minRating === null
        ? []
        : [
            {
              type: 'condition',
              field: 'rating',
              operator: 'gte',
              value: filters.minRating,
            } as const,
          ]),
      ...(filters.unrated
        ? [{ type: 'condition', field: 'rating', operator: 'isEmpty', value: null } as const]
        : []),
    ],
    ...Object.entries(filters.roles).map(([role, ids]) => ids.map((id) => is(role, id))),
    filters.collections.map((id) => is('collection', id)),
  ];
  const allOf = rangeEntries(filters).map(([measure, range]) => rangeConditions(measure, range));
  const children: FilterNode[] = [
    ...anyOf
      .filter((marks) => marks.length > 0)
      .map((marks) => ({ type: 'group', op: 'or', children: marks }) as const),
    ...allOf
      .filter((bounds) => bounds.length > 0)
      .map((bounds) => ({ type: 'group', op: 'and', children: bounds }) as const),
  ];
  return children.length === 0 ? undefined : { type: 'group', op: 'and', children };
}

const rangeEntries = (filters: SimpleFilters) =>
  Object.entries(filters.ranges) as [NumberMeasure, NumberRangeText][];

/** How many marks there are, for the "Filters (3)" button. Each bound that applies is one. */
export function countMarks(filters: SimpleFilters): number {
  return (
    Number(filters.favorite) +
    Number(filters.replay) +
    filters.status.length +
    filters.format.length +
    Number(filters.minRating !== null) +
    Number(filters.unrated) +
    Object.values(filters.roles).reduce((total, ids) => total + ids.length, 0) +
    filters.collections.length +
    rangeEntries(filters).reduce(
      (total, [measure, range]) => total + rangeConditions(measure, range).length,
      0,
    )
  );
}

/** Adds `value` to `list`, or takes it out if it was there. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((other) => other !== value) : [...list, value];
}

/**
 * Takes out the marks of values no item uses any more (e.g. deleted from its catalog, or a
 * collection deleted or left without items of the library), which would find nothing without
 * any way to see why. Returns the same object if none is missing.
 */
export function withoutMissingValues(
  filters: SimpleFilters,
  values: ItemFilterValues,
): SimpleFilters {
  let changed = false;
  const roles: Partial<Record<ItemRole, readonly number[]>> = {};
  for (const [role, ids] of Object.entries(filters.roles) as [ItemRole, readonly number[]][]) {
    const known = new Set((values.roles[role] ?? []).map((value) => value.id));
    const kept = ids.filter((id) => known.has(id));
    if (kept.length !== ids.length) changed = true;
    if (kept.length > 0) roles[role] = kept;
  }
  const knownCollections = new Set(values.collections.map((value) => value.id));
  const collections = filters.collections.filter((id) => knownCollections.has(id));
  if (collections.length !== filters.collections.length) changed = true;
  return changed ? { ...filters, roles, collections } : filters;
}
