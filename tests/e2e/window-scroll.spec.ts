import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const button = (name: string) => page.getByRole('button', { name, exact: true });

/** How much taller than the window the page is; 0 when the window cannot scroll. */
const windowOverflow = () =>
  page.evaluate(() => {
    const { documentElement } = (
      globalThis as unknown as {
        document: { documentElement: { scrollHeight: number; clientHeight: number } };
      }
    ).document;
    return documentElement.scrollHeight - documentElement.clientHeight;
  });

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  ({ app, page } = await launchApp(dataDir));
  await button('Español').click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('only the area under the top bar scrolls, never the window, even in a long form', async () => {
  await button('Videojuegos').click();
  await button('Añadir').click();
  await expect(page.getByLabel('Título', { exact: true })).toBeVisible();

  // The form is much taller than the window: the area scrolls, the window does not.
  expect(await windowOverflow()).toBe(0);
  await page.getByLabel('Notas', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel('Notas', { exact: true })).toBeInViewport();
  await expect(button('Ajustes')).toBeInViewport();
});
