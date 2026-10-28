import type { ItemRole } from '../core/catalogs/catalogs';
import type { PartialDate } from '../core/dates/partial-date';
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

/** A catalog value as an item shows it, with its current name. */
export interface EntryName {
  readonly id: number;
  readonly name: string;
}

export interface ItemRelease {
  /** Null when no region was given or the region was deleted. */
  readonly region: EntryName | null;
  readonly date: PartialDate;
}

/** Everything known about an item, for the detail view and the edit form. */
export interface ItemDetails extends Omit<
  ItemDraft,
  'title' | 'description' | 'notes' | 'relations' | 'releases'
> {
  readonly id: number;
  readonly kind: ItemKind;
  readonly title: string | null;
  readonly placeholderNumber: number | null;
  readonly description: string | null;
  readonly notes: string | null;
  /** Values of each role in the chosen order; roles without values are left out. */
  readonly relations: Readonly<Partial<Record<ItemRole, readonly EntryName[]>>>;
  readonly releases: readonly ItemRelease[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}
