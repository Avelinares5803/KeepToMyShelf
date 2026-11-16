import { join } from 'node:path';
import { app, BrowserWindow, screen, shell } from 'electron';
import { IpcEvents } from '../shared/ipc';
import {
  isOnScreen,
  loadWindowState,
  sameRectangle,
  saveWindowState,
  type Rectangle,
} from './infrastructure/window-state';

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

export interface MainWindowOptions {
  /** Where the window's size, position, maximized and full screen state are kept between runs. */
  readonly stateFile: string;
}

export function createMainWindow({ stateFile }: MainWindowOptions): BrowserWindow {
  const saved = loadWindowState(stateFile);
  // A position on a monitor that is no longer there is dropped: the window opens centered.
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  const savedBounds = saved && isOnScreen(saved.bounds, workAreas) ? saved.bounds : null;

  const window = new BrowserWindow({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
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

  // With display scaling other than 100 %, Electron rounds sizes: the window shows a pixel or
  // two taller than asked. Saving that back would make it grow a little on every run, so an
  // untouched window saves the bounds it was given, not those it got.
  if (savedBounds) window.setBounds(savedBounds);
  const appliedBounds = window.getBounds();

  // What is saved at exit. The bounds are those of the window when it is neither maximized nor
  // full screen, so that leaving either state next time goes back to them; they are only taken
  // while the window is in that normal state.
  let normalBounds: Rectangle = appliedBounds;
  let maximized = saved?.maximized ?? false;
  const rememberBounds = () => {
    if (!window.isMaximized() && !window.isMinimized() && !window.isFullScreen()) {
      normalBounds = window.getBounds();
    }
  };
  window.on('resize', rememberBounds);
  window.on('move', rememberBounds);
  // Full screen is saved apart: entering it from a maximized window must not forget that the
  // window goes back to maximized when leaving it.
  window.on('maximize', () => {
    if (!window.isFullScreen()) maximized = true;
  });
  window.on('unmaximize', () => {
    if (!window.isFullScreen()) maximized = false;
  });
  window.on('close', () => {
    try {
      saveWindowState(stateFile, {
        bounds:
          savedBounds && sameRectangle(normalBounds, appliedBounds) ? savedBounds : normalBounds,
        maximized,
        fullScreen: window.isFullScreen(),
      });
    } catch (error) {
      // Not worth stopping the app from closing: next time the window opens at its default size.
      console.error('Could not save the window state', error);
    }
  });

  // The UI shows a button to enter or leave full screen; it follows F11 too.
  const sendFullScreen = (fullScreen: boolean) =>
    window.webContents.send(IpcEvents.fullScreenChanged, fullScreen);
  window.on('enter-full-screen', () => sendFullScreen(true));
  window.on('leave-full-screen', () => sendFullScreen(false));

  // Show the window only once its content is ready, avoiding a blank flash; it opens straight
  // in the state it was left in.
  window.once('ready-to-show', () => {
    if (maximized) window.maximize();
    if (saved?.fullScreen) window.setFullScreen(true);
    window.show();
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.isAutoRepeat) return;
    // F11 enters and leaves full screen, as in web browsers and the Windows File Explorer.
    if (input.key === 'F11') {
      event.preventDefault();
      window.setFullScreen(!window.isFullScreen());
    }
    // Without the default menu there is no DevTools shortcut: F12 opens them during development.
    if (input.key === 'F12' && !app.isPackaged) window.webContents.toggleDevTools();
  });

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
