import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import sharp from 'sharp';
import { launchApp } from './launch-app';
import { seedCollections, seedItems } from './seed-items';

let dataDir: string;
let filesDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const dialog = (name: string) => page.getByRole('dialog', { name, exact: true });
const breadcrumbs = () => page.getByRole('navigation', { name: 'Ruta de navegación' });
const shownTitles = () => page.locator('.item-card__title');
const shownKinds = () => page.locator('.item-card__meta');

async function coverFile(name: string): Promise<string> {
  const path = join(filesDir, name);
  writeFileSync(
    path,
    await sharp({ create: { width: 60, height: 90, channels: 3, background: '#3366aa' } })
      .png()
      .toBuffer(),
  );
  return path;
}

/** The system file dialog cannot be driven by Playwright: it "chooses" the given file. */
async function chooseFile(path: string): Promise<void> {
  await app!.evaluate(
    ({ dialog: electronDialog }, filePaths) => {
      electronDialog.showOpenDialog = (async () => ({ canceled: false, filePaths })) as never;
    },
    [path],
  );
}

/** Imports left half-way in the profile's media folder. */
function preparedImports(): string[] {
  const [profile] = readdirSync(join(dataDir, 'profiles'));
  const folder = join(dataDir, 'profiles', profile!, 'media', '.tmp');
  return existsSync(folder) ? readdirSync(folder) : [];
}

async function openCollections(): Promise<void> {
  await breadcrumbs().getByRole('button', { name: 'Ana', exact: true }).click();
  await button('Colecciones').click();
}

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  filesDir = join(dataDir, 'archivos del usuario');
  mkdirSync(filesDir);
  ({ app, page } = await launchApp(dataDir));
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('creates a collection with a cover, refusing a repeated name', async () => {
  await button('Colecciones').click();
  await expect(heading('Colecciones (0)')).toBeVisible();
  await expect(page.getByText('Todavía no hay colecciones.', { exact: false })).toBeVisible();

  await button('Nueva colección').click();
  const form = dialog('Nueva colección');
  await form.getByLabel('Nombre', { exact: true }).fill('Favoritos');
  await chooseFile(await coverFile('portada.png'));
  await form.getByRole('button', { name: 'Añadir portada', exact: true }).click();
  const importWindow = dialog('Añadir «portada.png»');
  await importWindow.getByRole('button', { name: 'Añadir', exact: true }).click();
  // The import window closes on its own; the collection's window stays open.
  await expect(importWindow).toHaveCount(0);
  await expect(form.getByRole('img', { name: 'Portada', exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();

  // A new collection opens at once.
  await expect(heading('Favoritos (0)')).toBeVisible();
  await expect(page.getByText('Esta colección está vacía.', { exact: true })).toBeVisible();
  await expect(breadcrumbs()).toContainText('Colecciones');
  await expect(breadcrumbs()).toContainText('Favoritos');

  await button('Volver').click();
  await expect(heading('Colecciones (1)')).toBeVisible();
  const card = button('Favoritos 0 elementos');
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toBeVisible();

  await button('Nueva colección').click();
  await dialog('Nueva colección').getByLabel('Nombre', { exact: true }).fill('FAVORITOS');
  await dialog('Nueva colección').getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(dialog('Nueva colección').getByRole('alert')).toHaveText(
    'Ya existe una colección con ese nombre.',
  );
  await dialog('Nueva colección').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(heading('Colecciones (1)')).toBeVisible();
});

test('Escape closes only the import window, and a cancelled cover leaves nothing behind', async () => {
  await button('Colecciones').click();
  await button('Nueva colección').click();
  const form = dialog('Nueva colección');
  await chooseFile(await coverFile('portada.png'));
  await form.getByRole('button', { name: 'Añadir portada', exact: true }).click();
  await expect(dialog('Añadir «portada.png»')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog('Añadir «portada.png»')).toHaveCount(0);
  await expect(form).toBeVisible();

  // A cover chosen and then dropped by cancelling the collection is not kept anywhere.
  await form.getByRole('button', { name: 'Añadir portada', exact: true }).click();
  await dialog('Añadir «portada.png»').getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(form.getByRole('img', { name: 'Portada', exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(heading('Colecciones (0)')).toBeVisible();
  await expect.poll(preparedImports).toEqual([]);
});

test('shows the items of every kind, by kind, searched and sorted, and opens them', async () => {
  seedItems(dataDir, [
    { title: 'Sonic', kind: 'game', releaseDate: '1991' },
    { title: 'Alien', kind: 'movie', releaseDate: '1979' },
    { title: 'Dark', kind: 'series', releaseDate: '2017' },
    { title: 'Fuera', kind: 'game' },
  ]);
  seedCollections(dataDir, [{ name: 'Favoritos', items: ['Sonic', 'Alien', 'Dark'] }]);
  await button('Colecciones').click();
  await button('Favoritos 3 elementos').click();

  await expect(heading('Favoritos (3)')).toBeVisible();
  await expect(shownTitles()).toHaveText(['Alien', 'Dark', 'Sonic']);
  await expect(shownKinds()).toHaveText(['Película', 'Serie', 'Videojuego']);

  const sort = page.getByLabel('Ordenar por', { exact: true });
  await sort.selectOption({ label: 'Fecha de lanzamiento o estreno' });
  await expect(shownTitles()).toHaveText(['Dark', 'Sonic', 'Alien']);

  const show = page.getByLabel('Mostrar', { exact: true });
  await show.selectOption({ label: 'Películas' });
  await expect(heading('Favoritos (1)')).toBeVisible();
  await expect(shownTitles()).toHaveText(['Alien']);
  // Only one kind is shown: its cards need no label.
  await expect(shownKinds()).toHaveCount(0);
  await expect(sort.locator('option:checked')).toHaveText('Fecha de estreno');

  await show.selectOption({ label: 'Todo' });
  await page.getByRole('searchbox', { name: 'Buscar por título', exact: true }).fill('SÓ');
  await expect(shownTitles()).toHaveText(['Sonic']);

  // An item opens its detail view, and "Back" returns to the collection as it was left.
  await page
    .locator('.item-grid')
    .getByRole('button', { name: /^Sonic/ })
    .click();
  await expect(heading('Sonic')).toBeVisible();
  await expect(breadcrumbs()).toContainText('Favoritos');
  await button('Volver').click();
  await expect(heading('Favoritos (1)')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Buscar por título', exact: true })).toHaveValue(
    'SÓ',
  );
});

test('hides an item in the trash and shows it again when restored', async () => {
  seedItems(dataDir, [{ title: 'Sonic' }, { title: 'Tails' }]);
  seedCollections(dataDir, [{ name: 'Favoritos', items: ['Sonic', 'Tails'] }]);
  await button('Colecciones').click();
  await button('Favoritos 2 elementos').click();

  await page
    .locator('.item-grid')
    .getByRole('button', { name: /^Sonic/ })
    .click();
  await button('Eliminar').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(heading('Favoritos (1)')).toBeVisible();
  await expect(shownTitles()).toHaveText(['Tails']);
  await button('Volver').click();
  await expect(button('Favoritos 1 elemento')).toBeVisible();

  await breadcrumbs().getByRole('button', { name: 'Ana', exact: true }).click();
  await button('Videojuegos').click();
  await button('Papelera (1)').click();
  await button('Restaurar «Sonic»').click();
  await openCollections();
  await button('Favoritos 2 elementos').click();
  await expect(shownTitles()).toHaveText(['Sonic', 'Tails']);
});

test('renames a collection, changes its cover and deletes it without deleting its items', async () => {
  seedItems(dataDir, [{ title: 'Sonic' }]);
  seedCollections(dataDir, [{ name: 'Favoritos', items: ['Sonic'] }]);
  await button('Colecciones').click();
  await button('Favoritos 1 elemento').click();

  await button('Editar colección').click();
  const edit = dialog('Editar «Favoritos»');
  await edit.getByLabel('Nombre', { exact: true }).fill('Favoritas');
  await chooseFile(await coverFile('portada.png'));
  await edit.getByRole('button', { name: 'Añadir portada', exact: true }).click();
  await dialog('Añadir «portada.png»').getByRole('button', { name: 'Añadir', exact: true }).click();
  await edit.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(heading('Favoritas (1)')).toBeVisible();
  await expect(breadcrumbs()).toContainText('Favoritas');

  await button('Editar colección').click();
  const again = dialog('Editar «Favoritas»');
  await again.getByRole('button', { name: 'Quitar portada', exact: true }).click();
  await again.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await button('Volver').click();
  await expect(button('Favoritas 1 elemento').locator('img')).toHaveCount(0);

  await button('Favoritas 1 elemento').click();
  await button('Eliminar colección').click();
  const confirm = dialog('Eliminar colección');
  await expect(confirm).toContainText(
    '¿Seguro que quieres eliminar la colección «Favoritas»? Sus elementos no se eliminan.',
  );
  await expect(confirm.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await confirm.getByRole('button', { name: 'Eliminar colección', exact: true }).click();

  await expect(heading('Colecciones (0)')).toBeVisible();
  await breadcrumbs().getByRole('button', { name: 'Ana', exact: true }).click();
  await button('Videojuegos').click();
  await expect(heading('Videojuegos (1)')).toBeVisible();
});
