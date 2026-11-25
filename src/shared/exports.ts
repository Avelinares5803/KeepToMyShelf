/**
 * Exports of one profile's library: everything in a JSON file, or the items of one kind in a CSV
 * file for spreadsheets. Neither has images, documents nor preferences: backups do.
 */
import type { Catalog, GenreScope, ItemRole } from '../core/catalogs/catalogs';
import type { CsvSeparator } from '../core/export/csv';
import type { ItemStatus } from '../core/items/item-draft';
import type { ItemKind } from './content';

/** Identifies the JSON file of a KeepToMyShelf library. */
export const LIBRARY_EXPORT_FORMAT = 'keeptomyshelf-library';
/** Raised only when an older app could no longer read a newer file. */
export const LIBRARY_EXPORT_FORMAT_VERSION = 1;

export type ExportTarget =
  | { readonly format: 'json' }
  | { readonly format: 'csv'; readonly kind: ItemKind; readonly separator: CsvSeparator };

export interface ExportedCatalogEntry {
  readonly catalog: Catalog;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly scope: GenreScope | null;
}

export interface ExportedItem {
  readonly uuid: string;
  readonly kind: ItemKind;
  /** Null for untitled items, which have a number instead. */
  readonly title: string | null;
  readonly placeholderNumber: number | null;
  readonly alternateTitles: readonly string[];
  readonly description: string | null;
  readonly notes: string | null;
  readonly isFavorite: boolean;
  /** Half stars, 1 to 10. */
  readonly rating: number | null;
  readonly status: ItemStatus | null;
  readonly isReplay: boolean;
  readonly ownsPhysical: boolean;
  readonly ownsDigital: boolean;
  /** "2021", "2021-03", "2021-03-14" or "unknown". */
  readonly startedOn: string | null;
  readonly finishedOn: string | null;
  readonly minutesPlayed: number | null;
  readonly seasonsCount: number | null;
  readonly episodesCount: number | null;
  /** Names of catalog values, in the chosen order; roles without values are left out. */
  readonly relations: Readonly<Partial<Record<ItemRole, readonly string[]>>>;
  readonly releases: readonly { readonly region: string | null; readonly date: string }[];
  readonly createdAt: string;
  readonly updatedAt: string;
  /** When it was moved to the trash; null when it is in the library. */
  readonly deletedAt: string | null;
}

export interface ExportedCollection {
  readonly uuid: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly items: readonly { readonly uuid: string; readonly addedAt: string }[];
}

/** The contents of a library. Values are named, never numbered: ids mean nothing elsewhere. */
export interface ExportedLibrary {
  readonly catalogs: readonly ExportedCatalogEntry[];
  readonly items: readonly ExportedItem[];
  readonly collections: readonly ExportedCollection[];
}

/** The JSON file. */
export interface LibraryExportFile extends ExportedLibrary {
  readonly format: typeof LIBRARY_EXPORT_FORMAT;
  readonly formatVersion: number;
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly profile: { readonly name: string };
}

/** What the UI is told when an export is saved. */
export interface ExportSaved {
  /** Only the file name: the UI never handles paths. */
  readonly fileName: string;
  readonly items: number;
}
