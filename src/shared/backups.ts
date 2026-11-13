/**
 * Backups of one profile: a .zip with `manifest.json`, a snapshot of `library.db` and the
 * stored files of `media` (thumbnails are left out: they are made again when needed).
 *
 * This file is imported by the sandboxed preload script, so it may only hold types and
 * constants without imports of packages.
 */
import type { AppSettings } from './settings';

/** Identifies the manifest of a KeepToMyShelf backup. */
export const BACKUP_FORMAT = 'keeptomyshelf-backup';
/** Raised only when an older app could no longer read a newer backup. */
export const BACKUP_FORMAT_VERSION = 1;

/** Why a backup was made. Automatic backups go to the app's own `backups` folder. */
export type BackupReason = 'manual' | 'before-delete';

export interface BackupManifest {
  readonly format: typeof BACKUP_FORMAT;
  readonly formatVersion: number;
  readonly appVersion: string;
  readonly createdAt: string;
  readonly reason: BackupReason;
  readonly profile: { readonly name: string; readonly createdAt: string };
  /** `PRAGMA user_version` of the snapshot; an older one is migrated when restored. */
  readonly librarySchemaVersion: number;
  /** The profile's own preferences, without the global ones. */
  readonly settings: Partial<AppSettings>;
  readonly media: {
    /** Stored files included. */
    readonly files: number;
    readonly bytes: number;
    /** Files the library lists that were not on disk (deleted by hand), so not included. */
    readonly missing: number;
  };
}

/** How far a backup has got, in bytes read; sent to the UI while it is written. */
export interface BackupProgress {
  readonly doneBytes: number;
  readonly totalBytes: number;
}

/** What the UI is told when a manual backup is saved. */
export interface BackupSaved {
  /** Only the file name: the UI never handles paths. */
  readonly fileName: string;
  readonly files: number;
  readonly missing: number;
}
