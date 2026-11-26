/**
 * Imports into the open profile of a library exported to JSON, or of the items of one kind in
 * a CSV file with the columns of the export (see `exports.ts`). They only add: nothing that
 * exists is ever replaced or removed.
 *
 * This file is imported by the sandboxed preload script, so it may only hold types.
 */
import type { ItemKind } from './content';

/** What an import adds, or would add, to the open profile. */
export interface ImportCounts {
  /** Items added; those whose UUID exists here (also in the trash) are left out. */
  readonly items: number;
  /** Of the items added, how many go to the trash, where they were. */
  readonly itemsInTrash: number;
  /** Items left out because they already exist here. */
  readonly existingItems: number;
  readonly catalogValues: number;
  readonly collections: number;
  /** Collections that already existed here and gain items. */
  readonly updatedCollections: number;
  /** New collections whose name was taken here, so they got "(1)", "(2)"… */
  readonly renamedCollections: number;
  /** Movie/series genres of this profile that were limited to one kind and now cover both. */
  readonly widenedGenres: number;
}

/** A JSON export chosen to import, checked and waiting for the user to confirm. */
export interface ImportPreview {
  /** Names the chosen file in the main process: the UI never handles paths. */
  readonly importId: string;
  readonly fileName: string;
  /** The profile the file was exported from. */
  readonly profileName: string;
  readonly exportedAt: string;
  readonly counts: ImportCounts;
}

/** An item of the file that breaks a rule of the app, so nothing can be imported. */
export interface InvalidImportItem {
  /** Its position in the file, from 1. */
  readonly position: number;
  readonly title: string | null;
  /** Translatable code of the first rule it breaks (e.g. "item.title_too_long"). */
  readonly code: string;
}

/** The result of checking a file: what importing it would add, or the item that prevents it. */
export type ImportCheck =
  | { readonly valid: true; readonly preview: ImportPreview }
  | { readonly valid: false; readonly fileName: string; readonly item: InvalidImportItem };

/** Something in a CSV file that prevents importing it. */
export interface CsvImportError {
  /** Its row in the spreadsheet: 1 is the header. */
  readonly row: number;
  /** The header of its column, as the file writes it; null when it is not about one cell. */
  readonly column: string | null;
  /** Translatable code (e.g. "import.csv_invalid_date" or "item.title_too_long"). */
  readonly code: string;
}

/** A row of a CSV file whose title is that of an item of the profile, of the same kind. */
export interface CsvDuplicate {
  readonly row: number;
  readonly title: string;
  /** How the item of the profile writes it, which may differ in case or accents. */
  readonly existingTitle: string;
}

/** A CSV file chosen to import, checked and waiting for the user to choose and confirm. */
export interface CsvImportPreview {
  /** Names the chosen file in the main process: the UI never handles paths. */
  readonly importId: string;
  readonly fileName: string;
  readonly kind: ItemKind;
  /** The rows with an item, without the header and blank rows. */
  readonly rows: number;
  /** Left out unless the user chooses otherwise. */
  readonly duplicates: readonly CsvDuplicate[];
  /** What importing adds, leaving out every duplicate. */
  readonly counts: ImportCounts;
}

/** The result of checking a CSV file: what importing it would add, or what prevents it. */
export type CsvImportCheck =
  | { readonly valid: true; readonly preview: CsvImportPreview }
  | {
      readonly valid: false;
      readonly fileName: string;
      /** The first ones, by row: a long list would not help. */
      readonly errors: readonly CsvImportError[];
      readonly errorCount: number;
    };
