import { app, ipcMain, nativeTheme } from 'electron';
import { IpcChannels } from '../../shared/ipc';
import { ipcInputSchemas } from '../../shared/ipc-schemas';
import type { CatalogService } from '../application/catalog-service';
import type { ItemService } from '../application/item-service';
import type { ProfileService } from '../application/profile-service';
import type { SessionManager } from '../application/session-manager';
import type { SettingsService } from '../application/settings-service';
import { createHandler } from './create-handler';

export interface Services {
  readonly profiles: ProfileService;
  readonly sessions: SessionManager;
  readonly settings: SettingsService;
  readonly items: ItemService;
  readonly catalogs: CatalogService;
}

/** IPC handlers stay thin: validate input (createHandler) and delegate to a service. */
export function registerIpcHandlers({
  profiles,
  sessions,
  settings,
  items,
  catalogs,
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
    listItems: createHandler(ipcInputSchemas.listItems, ({ token, kind }) =>
      items.list(token, kind),
    ),
    listTrash: createHandler(ipcInputSchemas.listTrash, ({ token, kind }) =>
      items.listTrash(token, kind),
    ),
    getItem: createHandler(ipcInputSchemas.getItem, ({ token, id }) => items.get(token, id)),
    createItem: createHandler(ipcInputSchemas.createItem, ({ token, kind, draft }) =>
      items.create(token, kind, draft),
    ),
    updateItem: createHandler(ipcInputSchemas.updateItem, ({ token, id, draft }) =>
      items.update(token, id, draft),
    ),
    moveItemToTrash: createHandler(ipcInputSchemas.moveItemToTrash, ({ token, id }) =>
      items.moveToTrash(token, id),
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
  };

  for (const [name, handler] of Object.entries(handlers)) {
    const channel = IpcChannels[name as keyof typeof IpcChannels];
    ipcMain.handle(channel, (_event, input: unknown) => handler(input));
  }
}
