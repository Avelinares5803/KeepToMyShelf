export const ITEM_SORT_FIELDS = [
  'title',
  'createdAt',
  'rating',
  'releaseDate',
  'startedOn',
  'finishedOn',
] as const;
export type ItemSortField = (typeof ITEM_SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface ItemSort {
  readonly field: ItemSortField;
  readonly direction: SortDirection;
}

export const DEFAULT_ITEM_SORT: ItemSort = { field: 'title', direction: 'asc' };
