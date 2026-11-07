import type { ItemCover } from './items';
import type { MediaAttachment } from './media';

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
