import { DEFAULT_ITEM_SORT, type ItemSort } from '../../../core/filters/item-sort';
import type { ItemKind } from '../../../shared/content';
import type { LibraryAnchor } from '../library/library-view';

/** How the user left a collection. It lasts until the profile is closed, not across restarts. */
export interface CollectionView {
  readonly search: string;
  readonly sort: ItemSort;
  /** The kind shown; null shows every kind. */
  readonly kind: ItemKind | null;
  /** Where to return to; null is the top of the page. */
  readonly anchor: LibraryAnchor | null;
}

/** The view of each collection, by its id. */
export type CollectionViews = Readonly<Record<number, CollectionView>>;

export const INITIAL_COLLECTION_VIEW: CollectionView = {
  search: '',
  sort: DEFAULT_ITEM_SORT,
  kind: null,
  anchor: null,
};

export const collectionViewOf = (views: CollectionViews, id: number): CollectionView =>
  views[id] ?? INITIAL_COLLECTION_VIEW;

export const withCollectionView = (
  views: CollectionViews,
  id: number,
  change: Partial<CollectionView>,
): CollectionViews => ({ ...views, [id]: { ...collectionViewOf(views, id), ...change } });

/** A deleted collection's view is forgotten, so a new one never inherits it. */
export function withoutCollectionView(views: CollectionViews, id: number): CollectionViews {
  const rest = { ...views };
  delete rest[id];
  return rest;
}
