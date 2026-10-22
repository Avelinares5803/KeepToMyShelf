import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { app, BrowserWindow, dialog } from 'electron';
import type { AppSettings } from '../shared/settings';
import { ProfileService } from './application/profile-service';
import { SessionManager } from './application/session-manager';
import { SettingsService } from './application/settings-service';
import { openAppDatabase } from './infrastructure/db/app-database';
import { createDataPaths } from './infrastructure/paths';
import { registerIpcHandlers } from './ipc/register-handlers';
import { createMainWindow } from './window';

function startApp(): void {
  const paths = createDataPaths(app.getPath('userData'));
  mkdirSync(paths.profilesDir, { recursive: true });
  const appDb = openAppDatabase(paths.appDatabase);

  const defaults: AppSettings = {
    language: app.getLocale().startsWith('es') ? 'es' : 'en',
    theme: 'system',
  };
  const now = () => new Date();
  const settings = new SettingsService(appDb, defaults);
  const sessions = new SessionManager({ appDb, paths, now, newId: randomUUID });
  const profiles = new ProfileService({ appDb, paths, sessions, settings, now, newId: randomUUID });

  profiles.removeDeletedProfileFolders();
  registerIpcHandlers({ profiles, sessions, settings });

  // Close databases cleanly so the WAL is checkpointed into the main file.
  app.on('will-quit', () => {
    sessions.closeCurrent();
    appDb.close();
  });

  createMainWindow();
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
    try {
      startApp();
    } catch (error) {
      // Without its databases the app cannot work: tell the user instead of showing a blank window.
      console.error('Startup failed', error);
      dialog.showErrorBox(
        'KeepToMyShelf',
        `No se pudo iniciar la aplicación / The app could not start.\n\n${String(error)}`,
      );
      app.exit(1);
    }
  });
}
