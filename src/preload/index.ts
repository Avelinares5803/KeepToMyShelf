import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels, type KeepToMyShelfApi } from '../shared/ipc';

// The only bridge between the UI and the main process: each method maps to one IPC channel.
// The main process validates every input; this file only forwards calls.
// The cast lets one helper serve every method: the main process builds each response
// from the typed contract in shared/ipc.ts.
const invoke =
  (channel: string) =>
  (input?: unknown): Promise<never> =>
    ipcRenderer.invoke(channel, input) as Promise<never>;

const api: KeepToMyShelfApi = {
  getAppInfo: invoke(IpcChannels.getAppInfo),
  profiles: {
    list: invoke(IpcChannels.listProfiles),
    create: invoke(IpcChannels.createProfile),
    rename: invoke(IpcChannels.renameProfile),
    delete: invoke(IpcChannels.deleteProfile),
  },
  session: {
    open: invoke(IpcChannels.openSession),
    close: invoke(IpcChannels.closeSession),
  },
  settings: {
    getGlobal: invoke(IpcChannels.getGlobalSettings),
    getForProfile: invoke(IpcChannels.getProfileSettings),
    setGlobal: invoke(IpcChannels.setGlobalSetting),
    setForProfile: invoke(IpcChannels.setProfileSetting),
    applyToAllProfiles: invoke(IpcChannels.applySettingToAllProfiles),
  },
  window: {
    setNativeTheme: invoke(IpcChannels.setNativeTheme),
  },
  items: {
    list: invoke(IpcChannels.listItems),
    listTrash: invoke(IpcChannels.listTrash),
    get: invoke(IpcChannels.getItem),
    create: invoke(IpcChannels.createItem),
    update: invoke(IpcChannels.updateItem),
    moveToTrash: invoke(IpcChannels.moveItemToTrash),
    restore: invoke(IpcChannels.restoreItem),
    deletePermanently: invoke(IpcChannels.deleteItemPermanently),
    emptyTrash: invoke(IpcChannels.emptyTrash),
  },
  catalogs: {
    list: invoke(IpcChannels.listCatalog),
    create: invoke(IpcChannels.createCatalogEntry),
    update: invoke(IpcChannels.updateCatalogEntry),
    delete: invoke(IpcChannels.deleteCatalogEntry),
    deleteUnused: invoke(IpcChannels.deleteUnusedCatalogEntries),
  },
};

contextBridge.exposeInMainWorld('api', api);
