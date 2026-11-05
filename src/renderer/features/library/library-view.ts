import {
  DEFAULT_ITEM_SORT,
  type ItemSort,
  type ItemSortField,
  type SortDirection,
} from '../../../core/filters/item-sort';
import type { ItemKind } from '../../../shared/content';
import { NO_SIMPLE_FILTERS, type SimpleFilters } from './simple-filters';

/** The first item the user could see. Its place is kept in case the item is gone on return. */
export interface LibraryAnchor {
  readonly itemId: number;
  readonly index: number;
}

/** How the user left a library. It lasts until the profile is closed, not across restarts. */
export interface LibraryView {
  readonly search: string;
  readonly sort: ItemSort;
  readonly filters: SimpleFilters;
  readonly filtersOpen: boolean;
  /** Where to return to; null is the top of the page. */
  readonly anchor: LibraryAnchor | null;
}

export type LibraryViews = Readonly<Partial<Record<ItemKind, LibraryView>>>;

export const INITIAL_LIBRARY_VIEW: LibraryView = {
  search: '',
  sort: DEFAULT_ITEM_SORT,
  filters: NO_SIMPLE_FILTERS,
  filtersOpen: false,
  anchor: null,
};

export const libraryViewOf = (views: LibraryViews, kind: ItemKind): LibraryView =>
  views[kind] ?? INITIAL_LIBRARY_VIEW;

/** Titles read from A to Z; for the rest, what people look for first is the newest or best. */
function initialDirection(field: ItemSortField): SortDirection {
  return field === 'title' ? 'asc' : 'desc';
}

export const sortByField = (field: ItemSortField): ItemSort => ({
  field,
  direction: initialDirection(field),
});

export const reversedSort = (sort: ItemSort): ItemSort => ({
  ...sort,
  direction: sort.direction === 'asc' ? 'desc' : 'asc',
});
