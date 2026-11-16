import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';

interface Shown {
  maximized: boolean;
  fullScreen: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

const shown = (app: ElectronApplication): Promise<Shown> =>
  app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) throw new Error('No window');
    return {
      maximized: window.isMaximized(),
      fullScreen: window.isFullScreen(),
      bounds: window.getBounds(),
    };
  });

/**
 * Like a real key press, it goes through the main process (before-input-event), which handles
 * F11; Playwright's page.keyboard would reach the page directly and skip it.
 */
const pressF11 = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents;
    contents?.sendInputEvent({ type: 'keyDown', keyCode: 'F11' });
    contents?.sendInputEvent({ type: 'keyUp', keyCode: 'F11' });
  });

/**
 * With display scaling other than 100 %, Electron shows a window a pixel or two off the size
 * it was given.
 */
const expectCloseTo = (actual: Shown['bounds'], expected: Shown['bounds']) => {
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThanOrEqual(3);
  }
};

const enterButton = (page: Page) => page.getByRole('button', { name: 'Full screen', exact: true });
const leaveButton = (page: Page) =>
  page.getByRole('button', { name: 'Exit full screen', exact: true });

test.describe('window state', () => {
  let dataDir: string;
  let app: ElectronApplication | undefined;
  let page: Page;

  const open = async () => {
    ({ app, page } = await launchApp(dataDir));
    // The window is shown once its content is ready, already in the state it was left in.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    return app;
  };

  const reopen = async () => {
    await app?.close();
    return open();
  };

  test.beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ventana-ñá-'));
  });

  test.afterEach(async () => {
    await app?.close();
    app = undefined;
    rmSync(dataDir, { recursive: true, force: true });
  });

  test('opens at the default size the first time', async () => {
    const current = await open();
    expect(await shown(current)).toMatchObject({
      maximized: false,
      fullScreen: false,
      bounds: { width: 1280, height: 800 },
    });
  });

  test('opens with the size and position it was left with, without growing', async () => {
    let current = await open();
    await current.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setBounds({ x: 140, y: 90, width: 1100, height: 700 }),
    );
    const left = (await shown(current)).bounds;

    current = await reopen();
    const reopened = (await shown(current)).bounds;
    expectCloseTo(reopened, left);
    // Opening it again without touching it shows exactly the same window.
    current = await reopen();
    expect((await shown(current)).bounds).toEqual(reopened);
    current = await reopen();
    expect((await shown(current)).bounds).toEqual(reopened);
  });

  test('opens maximized if it was left maximized, and restores to its previous size', async () => {
    let current = await open();
    await current.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setBounds({ x: 160, y: 100, width: 1000, height: 650 }),
    );
    const normal = (await shown(current)).bounds;
    await current.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
    await expect.poll(async () => (await shown(current)).maximized).toBe(true);

    current = await reopen();
    expect((await shown(current)).maximized).toBe(true);
    await current.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.unmaximize());
    await expect.poll(async () => (await shown(current)).maximized).toBe(false);
    expectCloseTo((await shown(current)).bounds, normal);
  });

  test('enters and leaves full screen with the button and with F11, and remembers it', async () => {
    let current = await open();
    await enterButton(page).click();
    await expect(leaveButton(page)).toBeVisible();
    expect((await shown(current)).fullScreen).toBe(true);

    current = await reopen();
    expect((await shown(current)).fullScreen).toBe(true);
    await expect(leaveButton(page)).toBeVisible();

    await pressF11(current);
    await expect(enterButton(page)).toBeVisible();
    expect((await shown(current)).fullScreen).toBe(false);

    await pressF11(current);
    await expect(leaveButton(page)).toBeVisible();
    await leaveButton(page).click();
    await expect(enterButton(page)).toBeVisible();

    current = await reopen();
    expect((await shown(current)).fullScreen).toBe(false);
  });

  test('goes back to maximized when leaving full screen after reopening', async () => {
    let current = await open();
    await current.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.maximize());
    await expect.poll(async () => (await shown(current)).maximized).toBe(true);
    await enterButton(page).click();
    await expect(leaveButton(page)).toBeVisible();

    current = await reopen();
    await leaveButton(page).click();
    await expect(enterButton(page)).toBeVisible();
    await expect.poll(async () => (await shown(current)).maximized).toBe(true);
  });

  test('opens at the default size when the saved position is off every screen', async () => {
    // Left on a monitor that has been unplugged.
    writeFileSync(
      join(dataDir, 'window-state.json'),
      JSON.stringify({
        bounds: { x: -6000, y: 200, width: 1100, height: 700 },
        maximized: false,
        fullScreen: false,
      }),
    );
    const current = await open();
    expect((await shown(current)).bounds).toMatchObject({ width: 1280, height: 800 });
    expect((await shown(current)).bounds.x).toBeGreaterThanOrEqual(0);
  });
});
