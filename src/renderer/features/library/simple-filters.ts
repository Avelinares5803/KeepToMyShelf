import type { ItemRole } from '../../../core/catalogs/catalogs';
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
}

export const NO_SIMPLE_FILTERS: SimpleFilters = {
  favorite: false,
  replay: false,
  status: [],
  format: [],
  minRating: null,
  unrated: false,
  roles: {},
};

const is = (field: string, value: FilterCondition['value']): FilterCondition => ({
  type: 'condition',
  field,
  operator: 'is',
  value,
});

/**
 * The tree the simple filters mean: any of the marks of an attribute (OR), and all the
 * attributes with marks (AND). Undefined when nothing is marked.
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
  ];
  const children: FilterNode[] = anyOf
    .filter((marks) => marks.length > 0)
    .map((marks) => ({ type: 'group', op: 'or', children: marks }));
  return children.length === 0 ? undefined : { type: 'group', op: 'and', children };
}

/** How many marks there are, for the "Filters (3)" button. */
export function countMarks(filters: SimpleFilters): number {
  return (
    Number(filters.favorite) +
    Number(filters.replay) +
    filters.status.length +
    filters.format.length +
    Number(filters.minRating !== null) +
    Number(filters.unrated) +
    Object.values(filters.roles).reduce((total, ids) => total + ids.length, 0)
  );
}

/** Adds `value` to `list`, or takes it out if it was there. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((other) => other !== value) : [...list, value];
}

/**
 * Takes out the marks of values no item uses any more (e.g. deleted from its catalog), which
 * would find nothing without any way to see why. Returns the same object if none is missing.
 */
export function withoutMissingValues(
  filters: SimpleFilters,
  values: ItemFilterValues,
): SimpleFilters {
  let changed = false;
  const roles: Partial<Record<ItemRole, readonly number[]>> = {};
  for (const [role, ids] of Object.entries(filters.roles) as [ItemRole, readonly number[]][]) {
    const known = new Set((values[role] ?? []).map((value) => value.id));
    const kept = ids.filter((id) => known.has(id));
    if (kept.length !== ids.length) changed = true;
    if (kept.length > 0) roles[role] = kept;
  }
  return changed ? { ...filters, roles } : filters;
}
