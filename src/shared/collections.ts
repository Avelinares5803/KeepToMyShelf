import type { ItemCover } from './items';
import type { ImagePlanEntry, MediaAttachment } from './media';

/**
 * A collection's new cover: an image like an item's, or the cover one of its items has now.
 * That one is the same file, not a copy, and does not follow later changes of the item.
 */
export type CollectionCoverPlan =
  ImagePlanEntry | { readonly kind: 'item_cover'; readonly itemId: number };

/** What the list of collections needs to show one. */
export interface CollectionSummary {
  readonly id: number;
  readonly name: string;
  /** Items in it, without those in the trash. */
  readonly itemCount: number;
  /** Null when it has no cover. */
  readonly cover: ItemCover | null;
}

/** A collection as its edit window needs it: the cover with everything the form uses. */
export interface CollectionDetails {
  readonly id: number;
  readonly name: string;
  readonly itemCount: number;
  readonly cover: MediaAttachment | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A collection named in an item's detail view. */
export interface CollectionName {
  readonly id: number;
  readonly name: string;
}

/** An item in a collection, for adding or removing it. */
export interface CollectionMembership {
  readonly collectionId: number;
  readonly itemId: number;
}
