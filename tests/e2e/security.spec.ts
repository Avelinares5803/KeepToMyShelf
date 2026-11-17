import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';

test.describe('security', () => {
  let dataDir: string;
  let app: ElectronApplication | undefined;
  let page: Page;

  test.beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-seguridad-'));
    ({ app, page } = await launchApp(dataDir));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test.afterEach(async () => {
    await app?.close();
    app = undefined;
    rmSync(dataDir, { recursive: true, force: true });
  });

  // The page's code is passed as text: the tests are type-checked without the browser's types.

  test('refuses every web permission', async () => {
    const answers = await page.evaluate(`(async () => ({
      notifications: await Notification.requestPermission(),
      geolocation: (await navigator.permissions.query({ name: 'geolocation' })).state,
      camera: (await navigator.permissions.query({ name: 'camera' })).state,
    }))()`);
    expect(answers).toEqual({ notifications: 'denied', geolocation: 'denied', camera: 'denied' });
  });

  test('does not run code added to the page', async () => {
    const result = await page.evaluate(`new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = 'window.injected = true';
      document.body.append(script);
      const image = document.createElement('img');
      image.setAttribute('onerror', 'window.injected = true');
      image.src = 'not-an-image';
      document.body.append(image);
      setTimeout(() => resolve(window.injected ?? 'not run'), 300);
    })`);
    expect(result).toBe('not run');
  });

  test('ignores a <base> that would send relative links elsewhere', async () => {
    const baseUri = await page.evaluate(`(() => {
      const base = document.createElement('base');
      base.href = 'https://example.com/';
      document.head.prepend(base);
      return document.baseURI;
    })()`);
    expect(baseUri).not.toContain('example.com');
  });

  test('opens no window, inside or outside the app', async () => {
    const current = app as ElectronApplication;
    // Records what would open in the user's browser instead of opening it.
    await current.evaluate(({ shell }) => {
      const opened: string[] = [];
      (globalThis as { opened?: string[] }).opened = opened;
      shell.openExternal = async (url: string) => {
        opened.push(url);
      };
    });

    const result = await page.evaluate(`window.open('https://example.com/') === null`);
    expect(result).toBe(true);
    await page.waitForTimeout(300);
    expect(
      await current.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
    ).toBe(1);
    expect(await current.evaluate(() => (globalThis as { opened?: string[] }).opened)).toEqual([]);
  });
});
