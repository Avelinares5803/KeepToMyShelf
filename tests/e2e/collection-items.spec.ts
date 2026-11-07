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
const dialog = (name: string) => page.getByRole('dialog', { name, exact: true });
const breadcrumbs = () => page.getByRole('navigation', { name: 'Ruta de navegación' });
const shownTitles = () => page.locator('.item-grid .item-card__title');
const card = (title: string) =>
  page.locator('.item-grid').getByRole('button', { name: new RegExp(`^${title}`) });

/** On the mode screen, the profile is the current crumb: plain text, not a button. */
async function goToModes(): Promise<void> {
  const crumb = breadcrumbs().getByRole('button', { name: 'Ana', exact: true });
  if ((await crumb.count()) > 0) await crumb.click();
  await expect(heading('¿Qué quieres consultar?')).toBeVisible();
}

async function openCollection(cardName: string): Promise<void> {
  await goToModes();
  await button('Colecciones').click();
  await button(cardName).click();
}

async function openItem(library: string, title: string): Promise<void> {
  await goToModes();
  await button(library).click();
  await card(title).click();
  await expect(heading(title)).toBeVisible();
}

async function trash(library: string, title: string): Promise<void> {
  await openItem(library, title);
  await button('Eliminar').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
}

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

test('adds items of several kinds to a collection and removes them, only when saving', async () => {
  seedItems(dataDir, [
    { title: 'Sonic', kind: 'game' },
    { title: 'Tails', kind: 'game' },
    { title: 'Alien', kind: 'movie' },
  ]);
  seedCollections(dataDir, [{ name: 'Favoritos' }]);
  await openCollection('Favoritos 0 elementos');

  await button('Añadir elementos').click();
  const window = dialog('Elementos de «Favoritos»');
  const kind = window.getByLabel('Tipo', { exact: true });
  // Every kind is shown in the collection: the window starts with video games.
  await expect(kind).toHaveValue('game');
  await window.getByRole('checkbox', { name: 'Sonic', exact: true }).check();
  await expect(window.getByRole('status')).toHaveText('1 añadido');
  await kind.selectOption({ label: 'Películas' });
  await window.getByRole('checkbox', { name: 'Alien', exact: true }).check();
  await expect(window.getByRole('status')).toHaveText('2 añadidos');
  // Marks are kept while switching kinds.
  await kind.selectOption({ label: 'Videojuegos' });
  await expect(window.getByRole('checkbox', { name: 'Sonic', exact: true })).toBeChecked();

  await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByText('Esta colección está vacía.', { exact: true })).toBeVisible();

  await button('Añadir elementos').click();
  await window.getByRole('checkbox', { name: 'Sonic', exact: true }).check();
  await kind.selectOption({ label: 'Películas' });
  await window.getByRole('checkbox', { name: 'Alien', exact: true }).check();
  await window.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(heading('Favoritos (2)')).toBeVisible();
  await expect(shownTitles()).toHaveText(['Alien', 'Sonic']);

  // The window starts with the kind being looked at, and removes what is unmarked.
  await page.getByLabel('Mostrar', { exact: true }).selectOption({ label: 'Películas' });
  await button('Añadir o quitar elementos').click();
  await expect(kind).toHaveValue('movie');
  await window.getByRole('checkbox', { name: 'Alien', exact: true }).uncheck();
  await expect(window.getByRole('status')).toHaveText('1 quitado');
  await window.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('No se ha encontrado nada.', { exact: true })).toBeVisible();
  await button('Mostrar todo').click();
  await expect(shownTitles()).toHaveText(['Sonic']);
});

test('lists at most 100 items, narrowed down by searching', async () => {
  seedItems(
    dataDir,
    Array.from({ length: 120 }, (_, index) => ({
      title: `Juego ${String(index + 1).padStart(3, '0')}`,
    })),
  );
  seedCollections(dataDir, [{ name: 'Favoritos' }]);
  await openCollection('Favoritos 0 elementos');
  await button('Añadir elementos').click();
  const window = dialog('Elementos de «Favoritos»');

  await expect(window.getByRole('checkbox')).toHaveCount(100);
  await expect(window).toContainText('Se muestran 100 de 120. Escribe para acotar.');

  await window.getByRole('searchbox', { name: 'Buscar por título', exact: true }).fill('juego 11');
  await expect(window.getByRole('checkbox')).toHaveCount(10);
  await window.getByRole('checkbox', { name: 'Juego 115', exact: true }).check();
  await window.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(heading('Favoritos (1)')).toBeVisible();
  await expect(shownTitles()).toHaveText(['Juego 115']);
});

test('chooses the collections of an item from its detail view, and creates new ones', async () => {
  seedItems(dataDir, [{ title: 'Sonic' }]);
  seedCollections(dataDir, [{ name: 'Favoritos' }, { name: 'Pendientes', items: ['Sonic'] }]);
  await openItem('Videojuegos', 'Sonic');
  const row = page.locator('.details__row').filter({ hasText: 'Colecciones' });
  await expect(row.getByRole('listitem')).toHaveText(['Pendientes']);

  await button('Elegir colecciones').click();
  const window = dialog('Colecciones de «Sonic»');
  await expect(window.getByRole('checkbox', { name: 'Pendientes', exact: true })).toBeChecked();
  await expect(window.getByRole('checkbox', { name: 'Favoritos', exact: true })).not.toBeChecked();
  const newName = window.getByRole('textbox', { name: 'Nueva colección', exact: true });
  await newName.fill('PENDIENTES');
  await window.getByRole('button', { name: 'Crear', exact: true }).click();
  await expect(window.getByRole('alert')).toHaveText('Ya existe una colección con ese nombre.');
  await newName.fill('Retro');
  await newName.press('Enter');
  await expect(window.getByRole('checkbox', { name: 'Retro nueva', exact: true })).toBeChecked();

  // Cancelling creates nothing.
  await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await button('Elegir colecciones').click();
  await expect(window.getByRole('checkbox')).toHaveCount(2);

  await newName.fill('Retro');
  await window.getByRole('button', { name: 'Crear', exact: true }).click();
  await window.getByRole('checkbox', { name: 'Favoritos', exact: true }).check();
  await window.getByRole('checkbox', { name: 'Pendientes', exact: true }).uncheck();
  await window.getByRole('button', { name: 'Guardar', exact: true }).click();
  // The commas between names are drawn by the styles, not part of the text.
  await expect(row.getByRole('listitem')).toHaveText(['Favoritos', 'Retro']);

  // Each name opens its collection, and "Back" returns to the item.
  await row.getByRole('button', { name: 'Retro', exact: true }).click();
  await expect(heading('Retro (1)')).toBeVisible();
  await expect(shownTitles()).toHaveText(['Sonic']);
  await expect(breadcrumbs()).toContainText('Sonic');
  await button('Volver').click();
  await expect(heading('Sonic')).toBeVisible();

  await goToModes();
  await button('Colecciones').click();
  await expect(button('Pendientes 0 elementos')).toBeVisible();
  await expect(button('Retro 1 elemento')).toBeVisible();
});

test('keeps the membership of an item in the trash when others change', async () => {
  seedItems(dataDir, [{ title: 'Sonic' }, { title: 'Tails' }]);
  seedCollections(dataDir, [{ name: 'Favoritos', items: ['Sonic', 'Tails'] }]);
  await trash('Videojuegos', 'Sonic');

  await openCollection('Favoritos 1 elemento');
  await button('Añadir o quitar elementos').click();
  const window = dialog('Elementos de «Favoritos»');
  // An item in the trash is not offered.
  await expect(window.getByRole('checkbox')).toHaveCount(1);
  await window.getByRole('checkbox', { name: 'Tails', exact: true }).uncheck();
  await window.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Esta colección está vacía.', { exact: true })).toBeVisible();

  await goToModes();
  await button('Videojuegos').click();
  await button('Papelera (1)').click();
  await button('Restaurar «Sonic»').click();
  await openCollection('Favoritos 1 elemento');
  await expect(shownTitles()).toHaveText(['Sonic']);
});
