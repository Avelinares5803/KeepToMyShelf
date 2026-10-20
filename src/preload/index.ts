import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannels, type KeepToMyShelfApi } from '../shared/ipc';

// The only bridge between the UI and the main process: each method maps to one IPC channel.
const api: KeepToMyShelfApi = {
  getAppInfo: () => ipcRenderer.invoke(IpcChannels.getAppInfo),
};

contextBridge.exposeInMainWorld('api', api);
