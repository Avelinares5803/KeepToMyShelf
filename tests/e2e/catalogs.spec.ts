import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  ({ app, page } = await launchApp(dataDir));
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  await page.getByLabel('Nombre').fill('Ana');
  await page.getByRole('button', { name: 'Crear perfil' }).click();
  await page.getByRole('button', { name: 'Abrir el perfil de Ana' }).click();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const button = (name: string) => page.getByRole('button', { name, exact: true });
const catalogList = () => page.getByRole('navigation', { name: 'Catálogos' });
const rows = () => page.locator('.catalog-list > li');
const dialog = () => page.getByRole('dialog');
const nameField = () => dialog().getByLabel('Nombre', { exact: true });
const firstAlias = () => dialog().getByLabel('Otro nombre 1', { exact: true });

test('lists, searches, adds, edits and deletes catalog values', async () => {
  await button('Catálogos').click();
  await expect(page.getByRole('heading', { name: 'Catálogos', exact: true })).toBeVisible();

  // Default values, found also by their other names.
  await expect(catalogList().getByRole('button', { name: 'Plataformas' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  const search = page.getByRole('searchbox', { name: 'Buscar en Plataformas' });
  await search.fill('genesis');
  await expect(rows()).toHaveCount(2); // Mega Drive and 32X ("Genesis 32X")
  await search.fill('sega genesis');
  await expect(rows()).toHaveCount(1);
  await expect(rows().first()).toContainText('Mega Drive');
  await expect(rows().first()).toContainText('También: Sega Genesis, Sega Mega Drive');
  await search.fill('zzz');
  await expect(page.getByText('Ningún valor coincide con la búsqueda.')).toBeVisible();

  // Genres limited to one kind show it.
  await catalogList().getByRole('button', { name: 'Géneros de películas y series' }).click();
  await expect(rows().filter({ hasText: 'Sitcom' })).toContainText('Solo series');

  // Add a value with other names.
  await catalogList().getByRole('button', { name: 'Empresas' }).click();
  await expect(page.getByRole('heading', { name: 'Empresas (0)' })).toBeVisible();
  await expect(page.getByText('Este catálogo está vacío.', { exact: false })).toBeVisible();
  await button('Añadir').click();
  await expect(dialog().getByRole('heading', { name: 'Añadir a Empresas' })).toBeVisible();
  await nameField().fill('Nintendo');
  await dialog().getByRole('button', { name: 'Añadir otro nombre' }).click();
  await firstAlias().fill('Nintendo Co., Ltd.');
  await dialog().getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog()).toBeHidden();
  await expect(rows()).toHaveCount(1);
  await expect(rows().first()).toContainText('Nintendo');
  await expect(rows().first()).toContainText('También: Nintendo Co., Ltd.');
  await expect(rows().first()).toContainText('Sin usar');

  // Exactly the same name is rejected; a different case is a different value.
  await button('Añadir').click();
  await nameField().fill('Nintendo');
  await dialog().getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog().getByRole('alert')).toHaveText('Ya existe un valor con ese nombre exacto.');
  await nameField().fill('NINTENDO');
  await dialog().getByRole('button', { name: 'Guardar' }).click();
  await expect(rows()).toHaveCount(2);

  // Rename.
  await button('Editar «Nintendo»').click();
  await expect(firstAlias()).toHaveValue('Nintendo Co., Ltd.');
  await nameField().fill('Nintendo EPD');
  await dialog().getByRole('button', { name: 'Guardar' }).click();
  await expect(rows().filter({ hasText: 'Nintendo EPD' })).toHaveCount(1);

  // Delete one value.
  await button('Eliminar «NINTENDO»').click();
  await expect(dialog()).toContainText('¿Seguro que quieres eliminar «NINTENDO»?');
  await dialog().getByRole('button', { name: 'Eliminar' }).click();
  await expect(rows()).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Empresas (1)' })).toBeVisible();

  // Delete every unused value of a catalog.
  await catalogList().getByRole('button', { name: 'Regiones' }).click();
  await button('Eliminar valores sin uso').click();
  await expect(dialog()).toContainText(/Se eliminarán \d+ valores de «Regiones»/);
  await dialog().getByRole('button', { name: 'Eliminar valores sin uso' }).click();
  await expect(page.getByRole('heading', { name: 'Regiones (0)' })).toBeVisible();
  await expect(button('Eliminar valores sin uso')).toBeDisabled();
});

test('opened from a library, starts with that kind', async () => {
  await button('Películas').click();
  await button('Catálogos').click();

  await expect(
    catalogList().getByRole('button', { name: 'Géneros de películas y series' }),
  ).toHaveAttribute('aria-current', 'true');

  // Shared catalogs show only the values used by movies; unused ones appear in "Todos".
  await catalogList().getByRole('button', { name: 'Personas' }).click();
  const show = page.getByLabel('Mostrar');
  await expect(show).toHaveValue('movie');
  await expect(button('Eliminar valores sin uso')).toBeHidden();
  await show.selectOption({ label: 'Todos' });
  await button('Añadir').click();
  await nameField().fill('Ana de Armas');
  await dialog().getByRole('button', { name: 'Guardar' }).click();
  await expect(rows()).toHaveCount(1);
  await show.selectOption({ label: 'Películas' });
  await expect(rows()).toHaveCount(0);
  await expect(
    page.getByText('Ningún elemento de «Películas» usa todavía valores de este catálogo.'),
  ).toBeVisible();

  await button('Volver').click();
  await expect(page.getByRole('heading', { name: 'Películas (0)' })).toBeVisible();
});
