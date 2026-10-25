import type { ItemDraft, ItemStatus } from '../core/items/item-draft';
import type { ItemKind } from './content';

/** What the library grid and the trash need to show an item. */
export interface ItemSummary {
  readonly id: number;
  readonly kind: ItemKind;
  /** Null for untitled items, shown as "Untitled N" in the UI language. */
  readonly title: string | null;
  readonly placeholderNumber: number | null;
  readonly isFavorite: boolean;
  readonly rating: number | null;
  readonly status: ItemStatus | null;
  readonly deletedAt: string | null;
}

/** Everything known about an item, for the detail view and the edit form. */
export interface ItemDetails extends Omit<ItemDraft, 'title' | 'description' | 'notes'> {
  readonly id: number;
  readonly kind: ItemKind;
  readonly title: string | null;
  readonly placeholderNumber: number | null;
  readonly description: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}
