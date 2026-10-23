import { join } from 'node:path';
import { app, BrowserWindow, shell } from 'electron';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'KeepToMyShelf',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // The UI never gets direct access to Node.js; it talks to main only through the preload API.
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });

  // Show the window only once its content is ready, avoiding a blank flash.
  window.once('ready-to-show', () => window.show());

  // Without the default menu there is no DevTools shortcut: F12 opens them during development.
  if (!app.isPackaged) {
    window.webContents.on('before-input-event', (_event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') window.webContents.toggleDevTools();
    });
  }

  // External links open in the user's browser, never inside the app.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // The app is a single page: block any navigation away from it.
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}
