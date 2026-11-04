import {
  DEFAULT_ITEM_SORT,
  type ItemSort,
  type ItemSortField,
  type SortDirection,
} from '../../../core/filters/item-sort';
import type { ItemKind } from '../../../shared/content';

/** How the user left a library. It lasts until the profile is closed, not across restarts. */
export interface LibraryView {
  readonly search: string;
  readonly sort: ItemSort;
  readonly scrollY: number;
}

export type LibraryViews = Readonly<Partial<Record<ItemKind, LibraryView>>>;

export const INITIAL_LIBRARY_VIEW: LibraryView = {
  search: '',
  sort: DEFAULT_ITEM_SORT,
  scrollY: 0,
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
