import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { app, BrowserWindow, dialog, Menu, protocol } from 'electron';
import type { AppSettings } from '../shared/settings';
import { CatalogService } from './application/catalog-service';
import { ItemService } from './application/item-service';
import { MediaService } from './application/media-service';
import { ProfileService } from './application/profile-service';
import { SessionManager } from './application/session-manager';
import { SettingsService } from './application/settings-service';
import { openAppDatabase } from './infrastructure/db/app-database';
import { createDataPaths } from './infrastructure/paths';
import { registerIpcHandlers } from './ipc/register-handlers';
import { createMediaProtocolHandler, MEDIA_SCHEME } from './media-protocol';
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
  const sessions = new SessionManager({
    appDb,
    paths,
    now,
    newId: randomUUID,
    languageOf: (profileId) => settings.getForProfile(profileId).language,
    onOpen: (session) => media.onSessionOpened(session),
  });
  const profiles = new ProfileService({ appDb, paths, sessions, settings, now, newId: randomUUID });

  const media = new MediaService({ sessions, paths, now });
  const items = new ItemService({ sessions, now, newId: randomUUID, media });
  const catalogs = new CatalogService({ sessions });

  profiles.removeDeletedProfileFolders();
  registerIpcHandlers({ profiles, sessions, settings, items, catalogs });
  // Every ktms-media:// request the UI makes (e.g. an <img src>) is answered here.
  protocol.handle(MEDIA_SCHEME, createMediaProtocolHandler(media));

  // The app has its own top bar; the default Electron menu (File, Edit, View...) is removed.
  // Editing shortcuts (copy, paste, undo...) keep working in text fields on Windows and Linux.
  Menu.setApplicationMenu(null);

  // Close databases cleanly so the WAL is checkpointed into the main file.
  app.on('will-quit', () => {
    sessions.closeCurrent();
    appDb.close();
  });

  createMainWindow();
}

// Automated tests point the app at a temporary data folder so real user data is never touched.
const userDataOverride = process.env['KTMS_USER_DATA_DIR'];
if (userDataOverride) {
  app.setPath('userData', userDataOverride);
}

// Custom schemes must be declared before the app is ready. "standard" makes URLs parse like
// https:// ones; "secure" lets a page use them without mixed-content warnings.
protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true } },
]);

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
