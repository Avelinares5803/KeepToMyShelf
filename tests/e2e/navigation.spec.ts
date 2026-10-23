import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';

const expectTheme = (page: Page, theme: string) =>
  expect(page.locator('html')).toHaveAttribute('data-theme', theme);

async function createProfile(page: Page, name: string): Promise<void> {
  const firstProfileHeading = page.getByRole('heading', {
    name: 'Crea tu primer perfil para empezar',
  });
  if (await firstProfileHeading.isVisible()) {
    await page.getByLabel('Nombre').fill(name);
    await page.getByRole('button', { name: 'Crear perfil' }).click();
    return;
  }
  await page.getByRole('button', { name: 'Nuevo perfil' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByRole('button', { name: 'Crear perfil' }).click();
}

test.describe('app shell', () => {
  let dataDir: string;
  let app: ElectronApplication | undefined;
  let page: Page;

  test.beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
    ({ app, page } = await launchApp(dataDir));
    await page.getByRole('button', { name: 'Español', exact: true }).click();
  });

  test.afterEach(async () => {
    await app?.close();
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  test('has no default Electron menu, and editing shortcuts still work', async () => {
    const hasMenu = await app!.evaluate(({ Menu }) => Menu.getApplicationMenu() !== null);
    expect(hasMenu).toBe(false);

    const name = page.getByLabel('Nombre');
    await name.fill('Videoteca');
    await name.press('Control+A');
    await name.press('Control+X');
    await expect(name).toHaveValue('');
    await name.press('Control+V');
    await name.press('Control+V');
    await expect(name).toHaveValue('VideotecaVideoteca');
    await name.press('Control+Z');
    await expect(name).toHaveValue('Videoteca');
  });

  test('navigates between profiles, modes and libraries', async () => {
    await createProfile(page, 'Ana');
    const breadcrumbs = page.getByRole('navigation', { name: 'Ruta de navegación' });
    const modesHeading = page.getByRole('heading', { name: '¿Qué quieres consultar?' });

    await page.getByRole('button', { name: 'Abrir el perfil de Ana' }).click();
    await expect(modesHeading).toBeVisible();
    await expect(breadcrumbs).toHaveText(/Perfiles.*Ana/);

    // Mode → library, and back with the Back button.
    await page.getByRole('button', { name: 'Videojuegos' }).click();
    await expect(page.getByRole('heading', { name: 'Videojuegos' })).toBeVisible();
    await expect(breadcrumbs).toHaveText(/Perfiles.*Ana.*Videojuegos/);
    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(modesHeading).toBeVisible();

    // Mode → library, and back with the breadcrumb of the profile.
    await page.getByRole('button', { name: 'Series' }).click();
    await expect(page.getByRole('heading', { name: 'Series' })).toBeVisible();
    await breadcrumbs.getByRole('button', { name: 'Ana' }).click();
    await expect(modesHeading).toBeVisible();

    // Back on the first screen of a profile returns to the profile selection.
    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(
      page.getByRole('heading', { name: '¿Quién va a usar KeepToMyShelf?' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Volver' })).toHaveCount(0);

    // The breadcrumb "Perfiles" also returns to the profile selection.
    await page.getByRole('button', { name: 'Abrir el perfil de Ana' }).click();
    await page.getByRole('button', { name: 'Películas' }).click();
    await breadcrumbs.getByRole('button', { name: 'Perfiles' }).click();
    await expect(
      page.getByRole('heading', { name: '¿Quién va a usar KeepToMyShelf?' }),
    ).toBeVisible();
  });

  test('keeps each profile’s theme and can apply it to all profiles', async () => {
    await createProfile(page, 'Ana');
    await createProfile(page, 'Bea');
    await expectTheme(page, 'system');

    // Ana: system → light → dark with the top bar button.
    await page.getByRole('button', { name: 'Abrir el perfil de Ana' }).click();
    const themeButton = page.getByRole('button', { name: /^Tema:/ });
    await themeButton.click();
    await expectTheme(page, 'light');
    await themeButton.click();
    await expectTheme(page, 'dark');

    // Outside the profile the global theme applies; Bea has no theme of her own.
    await page.getByRole('button', { name: 'Perfiles', exact: true }).click();
    await expectTheme(page, 'system');
    await page.getByRole('button', { name: 'Abrir el perfil de Bea' }).click();
    await expectTheme(page, 'system');

    // Ana keeps hers.
    await page.getByRole('button', { name: 'Perfiles', exact: true }).click();
    await page.getByRole('button', { name: 'Abrir el perfil de Ana' }).click();
    await expectTheme(page, 'dark');

    // Apply Ana's theme to all profiles from the settings dialog.
    await page.getByRole('button', { name: 'Ajustes' }).click();
    const settings = page.getByRole('dialog');
    await expect(settings).toContainText('«Ana»');
    await settings.getByRole('button', { name: 'Aplicar este tema a todos los perfiles' }).click();
    await expect(settings.getByRole('status')).toHaveText('Aplicado a todos los perfiles.');
    await settings.getByRole('button', { name: 'Cerrar' }).click();

    await page.getByRole('button', { name: 'Perfiles', exact: true }).click();
    await expectTheme(page, 'dark');
    await page.getByRole('button', { name: 'Abrir el perfil de Bea' }).click();
    await expectTheme(page, 'dark');
  });

  test('changes the language from the settings dialog', async () => {
    await page.getByRole('button', { name: 'Ajustes' }).click();
    const settings = page.getByRole('dialog');
    await settings.getByLabel('Idioma', { exact: true }).selectOption('en');

    await expect(settings.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await settings.getByRole('button', { name: 'Close' }).click();
    await expect(
      page.getByRole('heading', { name: 'Create your first profile to get started' }),
    ).toBeVisible();
  });
});
