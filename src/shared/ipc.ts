/**
 * Contract between the renderer (UI) and the main process.
 * The preload script implements `KeepToMyShelfApi` and exposes it as `window.api`.
 *
 * This file is imported by the sandboxed preload script, so it may only import types:
 * input validation lives in ipc-schemas.ts and runs in the main process.
 */
import type { z } from 'zod';
import type { ImportedBackground } from './backgrounds';
import type { BackupProgress, BackupSaved, RestorePreview } from './backups';
import type { CatalogEntrySummary } from './catalogs';
import type { CollectionDetails, CollectionName, CollectionSummary } from './collections';
import type { IpcInputSchemas } from './ipc-schemas';
import type { ItemDetails, ItemFilterValues, ItemSummary } from './items';
import type { ItemMedia, PickedImports } from './media';
import type { AppSettings, BackgroundChoice } from './settings';

export const IpcChannels = {
  getAppInfo: 'app:get-info',
  listProfiles: 'profiles:list',
  createProfile: 'profiles:create',
  renameProfile: 'profiles:rename',
  deleteProfile: 'profiles:delete',
  openSession: 'session:open',
  closeSession: 'session:close',
  getGlobalSettings: 'settings:get-global',
  getProfileSettings: 'settings:get-profile',
  setGlobalSetting: 'settings:set-global',
  setProfileSetting: 'settings:set-profile',
  applySettingToAllProfiles: 'settings:apply-to-all',
  setNativeTheme: 'window:set-native-theme',
  listItems: 'items:list',
  listItemFilterValues: 'items:list-filter-values',
  listTrash: 'items:list-trash',
  getItem: 'items:get',
  createItem: 'items:create',
  updateItem: 'items:update',
  moveItemToTrash: 'items:move-to-trash',
  moveItemsToTrash: 'items:move-many-to-trash',
  restoreItem: 'items:restore',
  deleteItemPermanently: 'items:delete-permanently',
  emptyTrash: 'items:empty-trash',
  listCatalog: 'catalogs:list',
  createCatalogEntry: 'catalogs:create',
  updateCatalogEntry: 'catalogs:update',
  deleteCatalogEntry: 'catalogs:delete',
  deleteUnusedCatalogEntries: 'catalogs:delete-unused',
  pickImages: 'media:pick-images',
  pickDocuments: 'media:pick-documents',
  openDocument: 'media:open-document',
  discardImports: 'media:discard-imports',
  listItemMedia: 'media:list',
  listCollections: 'collections:list',
  getCollection: 'collections:get',
  createCollection: 'collections:create',
  updateCollection: 'collections:update',
  deleteCollection: 'collections:delete',
  deleteCollections: 'collections:delete-many',
  listCollectionItems: 'collections:list-items',
  listCollectionMemberIds: 'collections:list-member-ids',
  listItemCollections: 'collections:list-for-item',
  changeCollectionMemberships: 'collections:change-memberships',
  listBackgrounds: 'backgrounds:list',
  pickBackgrounds: 'backgrounds:pick',
  importBackground: 'backgrounds:import',
  discardBackgroundImports: 'backgrounds:discard-imports',
  deleteBackground: 'backgrounds:delete',
  createBackup: 'backups:create',
  openBackupsFolder: 'backups:open-folder',
  restoreBackupAsNewProfile: 'backups:restore-as-new',
  previewBackupRestore: 'backups:preview-restore',
  restoreBackupOverProfile: 'backups:restore-over',
} as const;

/**
 * Messages the main process sends on its own, with no request from the UI (the opposite way
 * of the channels above). The UI listens to them through the preload.
 */
export const IpcEvents = {
  /** How far the backup or restore that is running has got (see `BackupProgress.stage`). */
  backupProgress: 'backups:progress',
} as const;

/** Every IPC call resolves to a result; expected errors carry a translatable code. */
export type IpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: IpcErrorPayload };

export interface IpcErrorPayload {
  readonly code: string;
  readonly message: string;
}

export interface AppInfo {
  name: string;
  version: string;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  lastOpenedAt: string | null;
  /** Its own background, shown on its card; null when it shows the global one. */
  ownBackground: BackgroundChoice | null;
}

export interface ProfileChange {
  profile: Profile;
  /** True when "(n)" was appended because the requested name was already taken. */
  renamed: boolean;
}

export interface SessionInfo {
  token: string;
  profile: Profile;
}

export type IpcInput<K extends keyof IpcInputSchemas> = z.infer<IpcInputSchemas[K]>;

export interface KeepToMyShelfApi {
  getAppInfo(): Promise<IpcResult<AppInfo>>;
  profiles: {
    list(): Promise<IpcResult<Profile[]>>;
    create(input: IpcInput<'createProfile'>): Promise<IpcResult<ProfileChange>>;
    rename(input: IpcInput<'renameProfile'>): Promise<IpcResult<ProfileChange>>;
    delete(input: IpcInput<'deleteProfile'>): Promise<IpcResult<void>>;
  };
  session: {
    open(input: IpcInput<'openSession'>): Promise<IpcResult<SessionInfo>>;
    close(input: IpcInput<'closeSession'>): Promise<IpcResult<void>>;
  };
  settings: {
    getGlobal(): Promise<IpcResult<AppSettings>>;
    getForProfile(input: IpcInput<'getProfileSettings'>): Promise<IpcResult<AppSettings>>;
    setGlobal(input: IpcInput<'setGlobalSetting'>): Promise<IpcResult<void>>;
    setForProfile(input: IpcInput<'setProfileSetting'>): Promise<IpcResult<void>>;
    applyToAllProfiles(input: IpcInput<'applySettingToAllProfiles'>): Promise<IpcResult<void>>;
  };
  window: {
    /** Aligns native parts of the window (e.g. the Windows title bar) with the UI theme. */
    setNativeTheme(input: IpcInput<'setNativeTheme'>): Promise<IpcResult<void>>;
  };
  items: {
    list(input: IpcInput<'listItems'>): Promise<IpcResult<ItemSummary[]>>;
    filterValues(input: IpcInput<'listItemFilterValues'>): Promise<IpcResult<ItemFilterValues>>;
    listTrash(input: IpcInput<'listTrash'>): Promise<IpcResult<ItemSummary[]>>;
    get(input: IpcInput<'getItem'>): Promise<IpcResult<ItemDetails>>;
    create(input: IpcInput<'createItem'>): Promise<IpcResult<ItemDetails>>;
    update(input: IpcInput<'updateItem'>): Promise<IpcResult<ItemDetails>>;
    moveToTrash(input: IpcInput<'moveItemToTrash'>): Promise<IpcResult<void>>;
    /**
     * All of them or none, in one transaction; resolves to how many were moved (those already
     * in the trash are not counted).
     */
    moveManyToTrash(input: IpcInput<'moveItemsToTrash'>): Promise<IpcResult<number>>;
    restore(input: IpcInput<'restoreItem'>): Promise<IpcResult<void>>;
    deletePermanently(input: IpcInput<'deleteItemPermanently'>): Promise<IpcResult<void>>;
    /** Resolves to the number of items deleted. */
    emptyTrash(input: IpcInput<'emptyTrash'>): Promise<IpcResult<number>>;
  };
  catalogs: {
    list(input: IpcInput<'listCatalog'>): Promise<IpcResult<CatalogEntrySummary[]>>;
    create(input: IpcInput<'createCatalogEntry'>): Promise<IpcResult<CatalogEntrySummary>>;
    update(input: IpcInput<'updateCatalogEntry'>): Promise<IpcResult<CatalogEntrySummary>>;
    delete(input: IpcInput<'deleteCatalogEntry'>): Promise<IpcResult<void>>;
    /** Resolves to the number of values deleted. */
    deleteUnused(input: IpcInput<'deleteUnusedCatalogEntries'>): Promise<IpcResult<number>>;
  };
  media: {
    /**
     * Opens the file dialog and prepares the chosen images; null if the dialog was cancelled.
     * The UI never handles file paths: it gets prepared imports and refers to them by id.
     */
    pickImages(input: IpcInput<'pickImages'>): Promise<IpcResult<PickedImports | null>>;
    /** Like `pickImages`, for PDF documents. */
    pickDocuments(input: IpcInput<'pickDocuments'>): Promise<IpcResult<PickedImports | null>>;
    /**
     * Opens one of the item's documents in the system's PDF viewer. A copy named after the
     * document is opened, so the stored file is never changed by the viewer.
     */
    openDocument(input: IpcInput<'openDocument'>): Promise<IpcResult<void>>;
    discardImports(input: IpcInput<'discardImports'>): Promise<IpcResult<void>>;
    list(input: IpcInput<'listItemMedia'>): Promise<IpcResult<ItemMedia>>;
  };
  collections: {
    list(input: IpcInput<'listCollections'>): Promise<IpcResult<CollectionSummary[]>>;
    get(input: IpcInput<'getCollection'>): Promise<IpcResult<CollectionDetails>>;
    create(input: IpcInput<'createCollection'>): Promise<IpcResult<CollectionDetails>>;
    update(input: IpcInput<'updateCollection'>): Promise<IpcResult<CollectionDetails>>;
    /** Deletes the collection for good; its items are never deleted. */
    delete(input: IpcInput<'deleteCollection'>): Promise<IpcResult<void>>;
    /** All of them or none, in one transaction; resolves to how many were deleted. */
    deleteMany(input: IpcInput<'deleteCollections'>): Promise<IpcResult<number>>;
    /** Its items without those in the trash, of one kind or all, searched and sorted. */
    listItems(input: IpcInput<'listCollectionItems'>): Promise<IpcResult<ItemSummary[]>>;
    /** The ids of its items without those in the trash, to mark them when choosing. */
    memberIds(input: IpcInput<'listCollectionMemberIds'>): Promise<IpcResult<number[]>>;
    /** The collections an item belongs to. */
    forItem(input: IpcInput<'listItemCollections'>): Promise<IpcResult<CollectionName[]>>;
    /**
     * Adds and removes items. Only the changes are sent: memberships of items in the trash,
     * which the UI does not show, are kept.
     */
    changeMemberships(input: IpcInput<'changeCollectionMemberships'>): Promise<IpcResult<void>>;
  };
  /** The gallery of imported backgrounds, shared by every profile; no profile needs to be open. */
  backgrounds: {
    list(): Promise<IpcResult<ImportedBackground[]>>;
    /**
     * Opens the file dialog and prepares the chosen images; null if the dialog was cancelled.
     * `token` is the open profile, whose optimized size applies; null uses the global one.
     */
    pick(input: IpcInput<'pickBackgrounds'>): Promise<IpcResult<PickedImports | null>>;
    /** Adds a prepared image to the gallery; the same image is never added twice. */
    import(input: IpcInput<'importBackground'>): Promise<IpcResult<ImportedBackground>>;
    discardImports(input: IpcInput<'discardBackgroundImports'>): Promise<IpcResult<void>>;
    /** Deletes it; every preference that used it goes back to no background. */
    delete(input: IpcInput<'deleteBackground'>): Promise<IpcResult<void>>;
  };
  backups: {
    /**
     * Asks where to save a backup of the open profile and writes it; null if the dialog was
     * cancelled. Progress arrives through `onProgress` meanwhile.
     */
    create(input: IpcInput<'createBackup'>): Promise<IpcResult<BackupSaved | null>>;
    /** Opens the folder of automatic backups in the file explorer. */
    openFolder(): Promise<IpcResult<void>>;
    /**
     * Asks for a backup and restores it as a new profile; null if the dialog was cancelled.
     * No profile needs to be open. Progress arrives through `onProgress` meanwhile.
     */
    restoreAsNew(
      input: IpcInput<'restoreBackupAsNewProfile'>,
    ): Promise<IpcResult<ProfileChange | null>>;
    /**
     * Asks for a backup to restore over the open profile and tells what it holds, so the user
     * can confirm; null if the dialog was cancelled. Nothing is restored yet.
     */
    previewRestore(
      input: IpcInput<'previewBackupRestore'>,
    ): Promise<IpcResult<RestorePreview | null>>;
    /**
     * Restores the backup previewed over the open profile, after saving an automatic backup of
     * its current state. The profile is opened again with a new token; the old one is stale.
     */
    restoreOver(input: IpcInput<'restoreBackupOverProfile'>): Promise<IpcResult<SessionInfo>>;
    /**
     * Calls `listener` while a backup is written (also the one made before deleting a
     * profile) or a backup is restored. Returns the function that stops listening.
     */
    onProgress(listener: (progress: BackupProgress) => void): () => void;
  };
}
