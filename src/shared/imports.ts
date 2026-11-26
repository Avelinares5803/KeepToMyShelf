/**
 * Imports into the open profile of a library exported to JSON (see `exports.ts`). They only
 * add: nothing that exists is ever replaced or removed.
 *
 * This file is imported by the sandboxed preload script, so it may only hold types.
 */

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
