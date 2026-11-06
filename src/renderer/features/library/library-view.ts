import {
  DEFAULT_ITEM_SORT,
  type ItemSort,
  type ItemSortField,
  type SortDirection,
} from '../../../core/filters/item-sort';
import type { FilterNode } from '../../../core/filters/filter-tree';
import type { ItemKind } from '../../../shared/content';
import {
  countConditions,
  NO_ADVANCED_FILTERS,
  toAdvancedTree,
  type AdvancedGroup,
} from './advanced-filters';
import { countMarks, NO_SIMPLE_FILTERS, toFilterTree, type SimpleFilters } from './simple-filters';

/** The two ways to filter a library, of which only one applies. */
export type FilterMode = 'simple' | 'advanced';

/** The first item the user could see. Its place is kept in case the item is gone on return. */
export interface LibraryAnchor {
  readonly itemId: number;
  readonly index: number;
}

/** How the user left a library. It lasts until the profile is closed, not across restarts. */
export interface LibraryView {
  readonly search: string;
  readonly sort: ItemSort;
  readonly filterMode: FilterMode;
  readonly filters: SimpleFilters;
  readonly advanced: AdvancedGroup;
  readonly filtersOpen: boolean;
  /** Where to return to; null is the top of the page. */
  readonly anchor: LibraryAnchor | null;
}

export type LibraryViews = Readonly<Partial<Record<ItemKind, LibraryView>>>;

export const INITIAL_LIBRARY_VIEW: LibraryView = {
  search: '',
  sort: DEFAULT_ITEM_SORT,
  filterMode: 'simple',
  filters: NO_SIMPLE_FILTERS,
  advanced: NO_ADVANCED_FILTERS,
  filtersOpen: false,
  anchor: null,
};

/** The filter to apply: that of the mode in use. The other one is kept, but ignored. */
export const activeFilterTree = (kind: ItemKind, view: LibraryView): FilterNode | undefined =>
  view.filterMode === 'simple' ? toFilterTree(view.filters) : toAdvancedTree(kind, view.advanced);

export const activeFilterCount = (kind: ItemKind, view: LibraryView): number =>
  view.filterMode === 'simple' ? countMarks(view.filters) : countConditions(kind, view.advanced);

/** "Remove filters" only empties the mode in use. */
export const clearedActiveFilter = (view: LibraryView): Partial<LibraryView> =>
  view.filterMode === 'simple' ? { filters: NO_SIMPLE_FILTERS } : { advanced: NO_ADVANCED_FILTERS };

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
