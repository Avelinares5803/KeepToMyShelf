import { app, ipcMain, nativeTheme } from 'electron';
import { IpcChannels } from '../../shared/ipc';
import { ipcInputSchemas } from '../../shared/ipc-schemas';
import type { CatalogService } from '../application/catalog-service';
import type { CollectionService } from '../application/collection-service';
import type { ItemService } from '../application/item-service';
import type { MediaService } from '../application/media-service';
import type { ProfileService } from '../application/profile-service';
import type { SessionManager } from '../application/session-manager';
import type { SettingsService } from '../application/settings-service';
import { chooseDocumentFiles, chooseImageFiles } from '../file-dialogs';
import { createAsyncHandler, createHandler } from './create-handler';

export interface Services {
  readonly profiles: ProfileService;
  readonly sessions: SessionManager;
  readonly settings: SettingsService;
  readonly items: ItemService;
  readonly catalogs: CatalogService;
  readonly media: MediaService;
  readonly collections: CollectionService;
}

/** IPC handlers stay thin: validate input (createHandler) and delegate to a service. */
export function registerIpcHandlers({
  profiles,
  sessions,
  settings,
  items,
  catalogs,
  media,
  collections,
}: Services): void {
  const handlers: Record<keyof typeof IpcChannels, (input: unknown) => unknown> = {
    getAppInfo: createHandler(ipcInputSchemas.getAppInfo, () => ({
      name: app.getName(),
      version: app.getVersion(),
    })),
    listProfiles: createHandler(ipcInputSchemas.listProfiles, () => profiles.list()),
    createProfile: createHandler(ipcInputSchemas.createProfile, (input) => profiles.create(input)),
    renameProfile: createHandler(ipcInputSchemas.renameProfile, ({ profileId, name }) =>
      profiles.rename(profileId, name),
    ),
    deleteProfile: createHandler(ipcInputSchemas.deleteProfile, ({ profileId }) =>
      profiles.delete(profileId),
    ),
    openSession: createHandler(ipcInputSchemas.openSession, ({ profileId }) => {
      const { token } = sessions.open(profileId);
      return { token, profile: profiles.get(profileId) };
    }),
    closeSession: createHandler(ipcInputSchemas.closeSession, ({ token }) => sessions.close(token)),
    getGlobalSettings: createHandler(ipcInputSchemas.getGlobalSettings, () => settings.getGlobal()),
    getProfileSettings: createHandler(ipcInputSchemas.getProfileSettings, ({ token }) =>
      settings.getForProfile(sessions.require(token).profileId),
    ),
    setGlobalSetting: createHandler(ipcInputSchemas.setGlobalSetting, ({ setting }) =>
      settings.setGlobal(setting),
    ),
    setProfileSetting: createHandler(ipcInputSchemas.setProfileSetting, ({ token, setting }) =>
      settings.setForProfile(sessions.require(token).profileId, setting),
    ),
    applySettingToAllProfiles: createHandler(
      ipcInputSchemas.applySettingToAllProfiles,
      ({ setting }) => settings.applyToAllProfiles(setting),
    ),
    setNativeTheme: createHandler(ipcInputSchemas.setNativeTheme, ({ theme }) => {
      nativeTheme.themeSource = theme;
    }),
    listItems: createHandler(ipcInputSchemas.listItems, ({ token, kind, search, filter, sort }) =>
      items.list(token, kind, { search, filter, sort }),
    ),
    listItemFilterValues: createHandler(ipcInputSchemas.listItemFilterValues, ({ token, kind }) =>
      items.filterValues(token, kind),
    ),
    listTrash: createHandler(ipcInputSchemas.listTrash, ({ token, kind }) =>
      items.listTrash(token, kind),
    ),
    getItem: createHandler(ipcInputSchemas.getItem, ({ token, id }) => items.get(token, id)),
    createItem: createHandler(
      ipcInputSchemas.createItem,
      ({ token, kind, draft, cover, images, documents }) =>
        items.create(token, kind, draft, { cover, images, documents }),
    ),
    updateItem: createHandler(
      ipcInputSchemas.updateItem,
      ({ token, id, draft, cover, images, documents }) =>
        items.update(token, id, draft, { cover, images, documents }),
    ),
    moveItemToTrash: createHandler(ipcInputSchemas.moveItemToTrash, ({ token, id }) =>
      items.moveToTrash(token, id),
    ),
    moveItemsToTrash: createHandler(ipcInputSchemas.moveItemsToTrash, ({ token, ids }) =>
      items.moveManyToTrash(token, ids),
    ),
    restoreItem: createHandler(ipcInputSchemas.restoreItem, ({ token, id }) =>
      items.restore(token, id),
    ),
    deleteItemPermanently: createHandler(ipcInputSchemas.deleteItemPermanently, ({ token, id }) =>
      items.deletePermanently(token, id),
    ),
    emptyTrash: createHandler(ipcInputSchemas.emptyTrash, ({ token, kind }) =>
      items.emptyTrash(token, kind),
    ),
    listCatalog: createHandler(ipcInputSchemas.listCatalog, ({ token, catalog }) =>
      catalogs.list(token, catalog),
    ),
    createCatalogEntry: createHandler(
      ipcInputSchemas.createCatalogEntry,
      ({ token, catalog, entry }) => catalogs.create(token, catalog, entry),
    ),
    updateCatalogEntry: createHandler(ipcInputSchemas.updateCatalogEntry, ({ token, id, entry }) =>
      catalogs.update(token, id, entry),
    ),
    deleteCatalogEntry: createHandler(ipcInputSchemas.deleteCatalogEntry, ({ token, id }) =>
      catalogs.delete(token, id),
    ),
    deleteUnusedCatalogEntries: createHandler(
      ipcInputSchemas.deleteUnusedCatalogEntries,
      ({ token, catalog }) => catalogs.deleteUnused(token, catalog),
    ),
    pickImages: createAsyncHandler(
      ipcInputSchemas.pickImages,
      async ({ token, filterName, multiple }) => {
        // A stale session is reported before the dialog opens, not after the user chose.
        sessions.require(token);
        const paths = await chooseImageFiles(filterName, multiple);
        return paths === null ? null : media.prepareMany(token, paths, 'image');
      },
    ),
    pickDocuments: createAsyncHandler(
      ipcInputSchemas.pickDocuments,
      async ({ token, filterName }) => {
        sessions.require(token);
        const paths = await chooseDocumentFiles(filterName);
        return paths === null ? null : media.prepareMany(token, paths, 'document');
      },
    ),
    openDocument: createAsyncHandler(ipcInputSchemas.openDocument, ({ token, itemId, mediaId }) =>
      media.openDocument(token, itemId, mediaId),
    ),
    discardImports: createHandler(ipcInputSchemas.discardImports, ({ token, preparedIds }) =>
      media.discardImports(token, preparedIds),
    ),
    listItemMedia: createHandler(ipcInputSchemas.listItemMedia, ({ token, itemId }) =>
      media.list(token, itemId),
    ),
    listCollections: createHandler(ipcInputSchemas.listCollections, ({ token }) =>
      collections.list(token),
    ),
    getCollection: createHandler(ipcInputSchemas.getCollection, ({ token, id }) =>
      collections.get(token, id),
    ),
    createCollection: createHandler(ipcInputSchemas.createCollection, ({ token, name, cover }) =>
      collections.create(token, { name, cover }),
    ),
    updateCollection: createHandler(
      ipcInputSchemas.updateCollection,
      ({ token, id, name, cover }) => collections.update(token, id, { name, cover }),
    ),
    deleteCollection: createHandler(ipcInputSchemas.deleteCollection, ({ token, id }) =>
      collections.delete(token, id),
    ),
    deleteCollections: createHandler(ipcInputSchemas.deleteCollections, ({ token, ids }) =>
      collections.deleteMany(token, ids),
    ),
    listCollectionItems: createHandler(
      ipcInputSchemas.listCollectionItems,
      ({ token, id, kind, search, sort }) =>
        collections.listItems(token, id, { kind, search, sort }),
    ),
    listCollectionMemberIds: createHandler(
      ipcInputSchemas.listCollectionMemberIds,
      ({ token, id }) => collections.memberIds(token, id),
    ),
    listItemCollections: createHandler(ipcInputSchemas.listItemCollections, ({ token, itemId }) =>
      collections.forItem(token, itemId),
    ),
    changeCollectionMemberships: createHandler(
      ipcInputSchemas.changeCollectionMemberships,
      ({ token, add, remove }) => collections.changeMemberships(token, { add, remove }),
    ),
  };

  for (const [name, handler] of Object.entries(handlers)) {
    const channel = IpcChannels[name as keyof typeof IpcChannels];
    ipcMain.handle(channel, (_event, input: unknown) => handler(input));
  }
}
