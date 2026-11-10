import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, Menu, protocol, shell } from 'electron';
import { DEFAULT_MEDIA_LIMITS } from '../core/media/import-rules';
import {
  BACKGROUND_SETTING_DEFAULTS,
  MEDIA_SETTING_DEFAULTS,
  type AppSettings,
} from '../shared/settings';
import { BackgroundService } from './application/background-service';
import { CatalogService } from './application/catalog-service';
import { CollectionService } from './application/collection-service';
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
    ...MEDIA_SETTING_DEFAULTS,
    ...BACKGROUND_SETTING_DEFAULTS,
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
    onClose: (session) => media.onSessionClosing(session),
  });
  const profiles = new ProfileService({ appDb, paths, sessions, settings, now, newId: randomUUID });

  const media = new MediaService({
    sessions,
    paths,
    now,
    limitsFor: (profileId) => {
      const preferences = settings.getForProfile(profileId);
      return {
        ...DEFAULT_MEDIA_LIMITS,
        optimizedMaxSide: preferences.optimizedMaxSide,
        maxDocumentBytes: preferences.maxDocumentMegabytes * 1024 * 1024,
      };
    },
    // Copies of the documents opened in the system viewer go to the system's temporary
    // folder; tests keep them inside their own data folder.
    openedDocumentsDir: userDataOverride
      ? join(userDataOverride, 'opened-documents')
      : join(app.getPath('temp'), 'KeepToMyShelf', 'opened-documents'),
    // shell.openPath asks Windows to open the file with its default program, like a double
    // click in the File Explorer.
    openWithSystem: (path) => shell.openPath(path),
  });
  // Copies left from the last run that a viewer kept open.
  media.clearOpenedDocuments();
  const items = new ItemService({ sessions, now, newId: randomUUID, media });
  const catalogs = new CatalogService({ sessions });
  const collections = new CollectionService({ sessions, now, newId: randomUUID, media });
  const backgrounds = new BackgroundService({
    appDb,
    dir: paths.backgroundsDir,
    sessions,
    settings,
    now,
  });
  // Imports left half-way by the last run, and files no background uses.
  backgrounds.onStartup();

  profiles.removeDeletedProfileFolders();
  registerIpcHandlers({
    profiles,
    sessions,
    settings,
    items,
    catalogs,
    media,
    collections,
    backgrounds,
  });
  // Every ktms-media:// request the UI makes (e.g. an <img src>) is answered here.
  protocol.handle(MEDIA_SCHEME, createMediaProtocolHandler(media, backgrounds));

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
