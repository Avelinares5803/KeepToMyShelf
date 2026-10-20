import { app, BrowserWindow, ipcMain } from 'electron';
import { IpcChannels, type AppInfo } from '../shared/ipc';
import { createMainWindow } from './window';

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannels.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
  }));
}

// Only one instance may run at a time: two processes writing the same database could corrupt it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });

  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(() => {
    registerIpcHandlers();
    createMainWindow();
  });
}
