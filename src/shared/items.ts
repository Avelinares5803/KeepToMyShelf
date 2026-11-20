import type { ItemRole } from '../core/catalogs/catalogs';
import type { PartialDate } from '../core/dates/partial-date';
import type { NumberMeasure } from '../core/filters/filter-fields';
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
  /** The item's cover; null when it has none. */
  readonly cover: ItemCover | null;
}

/** Enough to show a cover: its thumbnails are served by ktms-media:// by hash. */
export interface ItemCover {
  readonly sha256: string;
  readonly width: number;
  readonly height: number;
}

/** A catalog value as an item shows it, with its current name. */
export interface EntryName {
  readonly id: number;
  readonly name: string;
}

/** A catalog value offered by the filters of a library. */
export interface ItemFilterValue extends EntryName {
  /** Other names it is known by; the filters' own search looks at them too. */
  readonly aliases: readonly string[];
}

/** The lowest and highest number the items of a library have for a measure. */
export interface ItemFilterRange {
  readonly min: number;
  readonly max: number;
}

/** What the filters of a library can offer. */
export interface ItemFilterValues {
  /** Per role, the values that the items use, by name. */
  readonly roles: Readonly<Partial<Record<ItemRole, readonly ItemFilterValue[]>>>;
  /** Per measure of the kind, its range; left out when no item has the number. */
  readonly ranges: Readonly<Partial<Record<NumberMeasure, ItemFilterRange>>>;
  /** The collections that have items of the library, by name; they have no aliases. */
  readonly collections: readonly ItemFilterValue[];
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
