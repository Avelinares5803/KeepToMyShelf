import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import type { BackupProgress, ScheduledBackupFailure } from '../shared/backups';
import { IpcChannels, IpcEvents, type KeepToMyShelfApi } from '../shared/ipc';

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
    getFullScreen: invoke(IpcChannels.getFullScreen),
    setFullScreen: invoke(IpcChannels.setFullScreen),
    onFullScreenChange: (listener) => {
      const forward = (_event: IpcRendererEvent, fullScreen: boolean) => listener(fullScreen);
      ipcRenderer.on(IpcEvents.fullScreenChanged, forward);
      return () => {
        ipcRenderer.removeListener(IpcEvents.fullScreenChanged, forward);
      };
    },
  },
  items: {
    list: invoke(IpcChannels.listItems),
    filterValues: invoke(IpcChannels.listItemFilterValues),
    listTrash: invoke(IpcChannels.listTrash),
    get: invoke(IpcChannels.getItem),
    create: invoke(IpcChannels.createItem),
    update: invoke(IpcChannels.updateItem),
    moveToTrash: invoke(IpcChannels.moveItemToTrash),
    moveManyToTrash: invoke(IpcChannels.moveItemsToTrash),
    restore: invoke(IpcChannels.restoreItem),
    deletePermanently: invoke(IpcChannels.deleteItemPermanently),
    emptyTrash: invoke(IpcChannels.emptyTrash),
  },
  catalogs: {
    list: invoke(IpcChannels.listCatalog),
    create: invoke(IpcChannels.createCatalogEntry),
    update: invoke(IpcChannels.updateCatalogEntry),
    delete: invoke(IpcChannels.deleteCatalogEntry),
    merge: invoke(IpcChannels.mergeCatalogEntries),
    deleteUnused: invoke(IpcChannels.deleteUnusedCatalogEntries),
    previewCopy: invoke(IpcChannels.previewCatalogCopy),
    copy: invoke(IpcChannels.copyCatalogs),
  },
  media: {
    pickImages: invoke(IpcChannels.pickImages),
    pickDocuments: invoke(IpcChannels.pickDocuments),
    // The UI never sees a path: it hands over the File objects of a drop, and only here are
    // they turned into paths on disk. A File made by the page itself has none (''), and
    // getPathForFile throws for anything that is not a File.
    prepareDropped: ({ token, expected, files }) =>
      ipcRenderer.invoke(IpcChannels.prepareDroppedFiles, {
        token,
        expected,
        files: files.map((file) => ({ name: file.name, path: webUtils.getPathForFile(file) })),
      }) as Promise<never>,
    openDocument: invoke(IpcChannels.openDocument),
    discardImports: invoke(IpcChannels.discardImports),
    list: invoke(IpcChannels.listItemMedia),
  },
  collections: {
    list: invoke(IpcChannels.listCollections),
    get: invoke(IpcChannels.getCollection),
    create: invoke(IpcChannels.createCollection),
    update: invoke(IpcChannels.updateCollection),
    delete: invoke(IpcChannels.deleteCollection),
    deleteMany: invoke(IpcChannels.deleteCollections),
    listItems: invoke(IpcChannels.listCollectionItems),
    memberIds: invoke(IpcChannels.listCollectionMemberIds),
    forItem: invoke(IpcChannels.listItemCollections),
    changeMemberships: invoke(IpcChannels.changeCollectionMemberships),
  },
  backgrounds: {
    list: invoke(IpcChannels.listBackgrounds),
    pick: invoke(IpcChannels.pickBackgrounds),
    import: invoke(IpcChannels.importBackground),
    discardImports: invoke(IpcChannels.discardBackgroundImports),
    delete: invoke(IpcChannels.deleteBackground),
  },
  backups: {
    create: invoke(IpcChannels.createBackup),
    openFolder: invoke(IpcChannels.openBackupsFolder),
    getScheduled: invoke(IpcChannels.getScheduledBackups),
    openScheduledFolder: invoke(IpcChannels.openScheduledBackupsFolder),
    restoreAsNew: invoke(IpcChannels.restoreBackupAsNewProfile),
    previewRestore: invoke(IpcChannels.previewBackupRestore),
    restoreOver: invoke(IpcChannels.restoreBackupOverProfile),
    // The UI gets a plain callback, never ipcRenderer itself; the function returned removes it.
    onProgress: (listener) => {
      const forward = (_event: IpcRendererEvent, progress: BackupProgress) => listener(progress);
      ipcRenderer.on(IpcEvents.backupProgress, forward);
      return () => {
        ipcRenderer.removeListener(IpcEvents.backupProgress, forward);
      };
    },
    onScheduledFailure: (listener) => {
      const forward = (_event: IpcRendererEvent, failure: ScheduledBackupFailure) =>
        listener(failure);
      ipcRenderer.on(IpcEvents.scheduledBackupFailed, forward);
      return () => {
        ipcRenderer.removeListener(IpcEvents.scheduledBackupFailed, forward);
      };
    },
  },
  exports: {
    save: invoke(IpcChannels.saveExport),
  },
  imports: {
    preview: invoke(IpcChannels.previewLibraryImport),
    previewCsv: invoke(IpcChannels.previewCsvImport),
    chooseCsvRows: invoke(IpcChannels.chooseCsvImportRows),
    confirm: invoke(IpcChannels.importLibrary),
  },
  stats: {
    get: invoke(IpcChannels.getLibraryStats),
  },
};

contextBridge.exposeInMainWorld('api', api);
