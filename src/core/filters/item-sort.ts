/** What a library can be sorted by. */
export const ITEM_SORT_FIELDS = [
  'title',
  'createdAt',
  'rating',
  'releaseDate',
  'startedOn',
  'finishedOn',
] as const;

/** What a collection can be sorted by: the same, and when each item was added to it. */
export const COLLECTION_SORT_FIELDS = [
  'title',
  'addedToCollection',
  'createdAt',
  'rating',
  'releaseDate',
  'startedOn',
  'finishedOn',
] as const;

export type LibrarySortField = (typeof ITEM_SORT_FIELDS)[number];
export type ItemSortField = (typeof COLLECTION_SORT_FIELDS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/** A sort; `F` narrows the fields to those of a screen (e.g. a library's). */
export interface ItemSort<F extends ItemSortField = ItemSortField> {
  readonly field: F;
  readonly direction: SortDirection;
}

export const DEFAULT_ITEM_SORT: ItemSort<LibrarySortField> = { field: 'title', direction: 'asc' };
