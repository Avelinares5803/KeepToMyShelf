import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';
import { seedCollections, seedItems } from './seed-items';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const bar = () => page.getByRole('toolbar', { name: 'Selección', exact: true });
const barButton = (name: string) => bar().getByRole('button', { name, exact: true });
const confirmDialog = () => page.getByRole('dialog');
const shownTitles = () => page.locator('.item-grid .item-card__title');
/** In "Select" mode, each card is a checkbox named by what it shows. */
const card = (name: string) => page.getByRole('checkbox', { name, exact: true });
const goToModes = () =>
  page
    .getByRole('navigation', { name: 'Ruta de navegación' })
    .getByRole('button', { name: 'Ana', exact: true })
    .click();

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
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

test('moves the selected items to the trash, after asking', async () => {
  seedItems(dataDir, [{ title: 'Sonic' }, { title: 'Tails' }, { title: 'Knuckles' }]);
  await button('Videojuegos').click();
  await expect(heading('Videojuegos (3)')).toBeVisible();

  await button('Seleccionar').click();
  await expect(bar()).toContainText('0 elementos seleccionados');
  await expect(barButton('Enviar a la papelera')).toBeDisabled();
  // Clicking a card marks it instead of opening it.
  await card('Sonic').click();
  await card('Tails').press('Space');
  await expect(card('Sonic')).toBeChecked();
  await expect(card('Knuckles')).not.toBeChecked();
  await expect(bar()).toContainText('2 elementos seleccionados');
  await expect(heading('Videojuegos (3)')).toBeVisible();

  // Cancelling the confirmation changes nothing, and the focus starts on "Cancelar".
  await barButton('Enviar a la papelera').click();
  await expect(confirmDialog()).toContainText('¿Enviar 2 elementos a la papelera?');
  await expect(confirmDialog().getByRole('button', { name: 'Cancelar' })).toBeFocused();
  // Escape closes only the dialog: the mode and the marks stay.
  await page.keyboard.press('Escape');
  await expect(confirmDialog()).toBeHidden();
  await expect(bar()).toContainText('2 elementos seleccionados');

  await barButton('Enviar a la papelera').click();
  await confirmDialog().getByRole('button', { name: 'Enviar a la papelera', exact: true }).click();
  await expect(bar()).toBeHidden();
  await expect(shownTitles()).toHaveText(['Knuckles']);
  await expect(button('Papelera (2)')).toBeVisible();
  // Outside the mode, a card opens its item again.
  await button('Knuckles').click();
  await expect(heading('Knuckles')).toBeVisible();
});

test('"Select all" marks only the results shown, and searching empties the selection', async () => {
  seedItems(dataDir, [
    { title: 'Sonic', favorite: true },
    { title: 'Sonic 2' },
    { title: 'Tails', favorite: true },
  ]);
  await button('Videojuegos').click();
  await page.getByRole('searchbox', { name: 'Buscar por título', exact: true }).fill('sonic');
  await expect(shownTitles()).toHaveText(['Sonic', 'Sonic 2']);

  await button('Seleccionar').click();
  await barButton('Seleccionar todo').click();
  await expect(bar()).toContainText('2 elementos seleccionados');
  // Once everything is marked, the button clears the selection.
  await barButton('Quitar la selección').click();
  await expect(bar()).toContainText('0 elementos seleccionados');
  await barButton('Seleccionar todo').click();

  // New results empty the selection, but the mode stays.
  await page.getByRole('searchbox', { name: 'Buscar por título', exact: true }).fill('');
  await expect(shownTitles()).toHaveCount(3);
  await expect(bar()).toContainText('0 elementos seleccionados');

  // With a filter, only the items it shows are marked.
  await button('Filtros').click();
  await page
    .getByRole('region', { name: 'Filtros simples', exact: true })
    .getByRole('checkbox', { name: 'Favoritos', exact: true })
    .check();
  await expect(shownTitles()).toHaveText(['Sonic', 'Tails']);
  await barButton('Seleccionar todo').click();
  await barButton('Enviar a la papelera').click();
  await expect(confirmDialog()).toContainText('¿Enviar 2 elementos a la papelera?');
  await confirmDialog().getByRole('button', { name: 'Enviar a la papelera', exact: true }).click();
  await expect(button('Papelera (2)')).toBeVisible();

  await page
    .getByRole('region', { name: 'Filtros simples', exact: true })
    .getByRole('checkbox', { name: 'Favoritos', exact: true })
    .uncheck();
  await expect(shownTitles()).toHaveText(['Sonic 2']);
});

test('Escape and "Cancelar" leave the mode without changing anything', async () => {
  seedItems(dataDir, [{ title: 'Sonic' }]);
  await button('Videojuegos').click();

  await button('Seleccionar').click();
  await card('Sonic').click();
  await page.keyboard.press('Escape');
  await expect(bar()).toBeHidden();
  await expect(button('Sonic')).toBeVisible();

  await button('Seleccionar').click();
  // The marks of the previous time are gone.
  await expect(card('Sonic')).not.toBeChecked();
  await card('Sonic').click();
  await barButton('Cancelar').click();
  await expect(bar()).toBeHidden();
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expect(button('Papelera (0)')).toBeVisible();
});

test('deletes the selected collections, never their items', async () => {
  seedItems(dataDir, [{ title: 'Sonic' }]);
  seedCollections(dataDir, [
    { name: 'Favoritos', items: ['Sonic'] },
    { name: 'Pendientes' },
    { name: 'Retro' },
  ]);
  await button('Colecciones').click();
  await expect(heading('Colecciones (3)')).toBeVisible();

  await button('Seleccionar').click();
  await card('Favoritos 1 elemento').click();
  await card('Pendientes 0 elementos').click();
  await expect(bar()).toContainText('2 colecciones seleccionadas');
  await barButton('Eliminar').click();
  await expect(confirmDialog()).toContainText(
    '¿Eliminar 2 colecciones? Sus elementos no se eliminan.',
  );
  await confirmDialog().getByRole('button', { name: 'Eliminar', exact: true }).click();

  await expect(heading('Colecciones (1)')).toBeVisible();
  await expect(button('Retro 0 elementos')).toBeVisible();
  await goToModes();
  await button('Videojuegos').click();
  await expect(shownTitles()).toHaveText(['Sonic']);
});

test('creating a collection while selecting leaves the mode', async () => {
  seedCollections(dataDir, [{ name: 'Favoritos' }]);
  await button('Colecciones').click();
  await button('Seleccionar').click();
  await card('Favoritos 0 elementos').click();

  // Escape in the creation window closes only the window: the mode and the marks stay.
  await button('Nueva colección').click();
  const form = page.getByRole('dialog', { name: 'Nueva colección', exact: true });
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(bar()).toContainText('1 colección seleccionada');

  // The new collection opens at once, without the bar.
  await button('Nueva colección').click();
  await form.getByLabel('Nombre', { exact: true }).fill('Retro');
  await form.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(heading('Retro (0)')).toBeVisible();
  await expect(bar()).toBeHidden();

  // Back in the list, nothing is selected and a card opens its collection again.
  await page
    .getByRole('navigation', { name: 'Ruta de navegación' })
    .getByRole('button', { name: 'Colecciones', exact: true })
    .click();
  await expect(heading('Colecciones (2)')).toBeVisible();
  await expect(bar()).toBeHidden();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await button('Favoritos 0 elementos').click();
  await expect(heading('Favoritos (0)')).toBeVisible();
});

test('removes the selected items from a collection; they stay in the library', async () => {
  seedItems(dataDir, [{ title: 'Sonic' }, { title: 'Tails' }, { title: 'Alien', kind: 'movie' }]);
  seedCollections(dataDir, [{ name: 'Favoritos', items: ['Sonic', 'Tails', 'Alien'] }]);
  await button('Colecciones').click();
  await button('Favoritos 3 elementos').click();
  await expect(heading('Favoritos (3)')).toBeVisible();

  await button('Seleccionar').click();
  // With every kind shown, each card also tells its kind.
  await card('Alien Película').click();
  await card('Sonic Videojuego').click();
  await barButton('Quitar de la colección').click();
  await expect(confirmDialog()).toContainText(
    '¿Quitar 2 elementos de «Favoritos»? Seguirán en la biblioteca.',
  );
  await confirmDialog()
    .getByRole('button', { name: 'Quitar de la colección', exact: true })
    .click();

  await expect(heading('Favoritos (1)')).toBeVisible();
  await expect(shownTitles()).toHaveText(['Tails']);
  await goToModes();
  await button('Videojuegos').click();
  await expect(shownTitles()).toHaveText(['Sonic', 'Tails']);
  await expect(button('Papelera (0)')).toBeVisible();
});
