import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';
import { seedItems, type SeedEntry, type SeedItem } from './seed-items';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const box = (name: string) => page.getByRole('checkbox', { name, exact: true });
const panel = () => page.getByRole('region', { name: 'Filtros simples', exact: true });
const section = (name: string) => panel().locator('summary', { hasText: name });
const titles = () => page.locator('.item-card__title');

const genre = (name: string): SeedEntry => ({ role: 'genre', catalog: 'game_genre', name });
const tag = (name: string): SeedEntry => ({ role: 'tag', catalog: 'tag', name });
const owned = (name: string, aliases?: string[]): SeedEntry => ({
  role: 'owned_on',
  catalog: 'platform',
  name,
  ...(aliases && { aliases }),
});
const released = (name: string): SeedEntry => ({ role: 'released_on', catalog: 'platform', name });

/** Opens the games library with the given items, and its filters. */
async function openFilters(items: readonly SeedItem[]): Promise<void> {
  seedItems(dataDir, items);
  await button('Videojuegos').click();
  await expect(heading(`Videojuegos (${items.length})`)).toBeVisible();
  await button('Filtros').click();
  await expect(panel()).toBeVisible();
}

const expectTitles = (expected: string[]) => expect(titles()).toHaveText(expected);

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  ({ app, page } = await launchApp(dataDir));
  await button('Español').click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
  await expect(button('Videojuegos')).toBeVisible();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('applies the examples of the specification', async () => {
  await openFilters([
    { title: 'RPG en PC', entries: [genre('RPG uno'), owned('PC uno')] },
    { title: 'RPG sin PC', entries: [genre('RPG uno')] },
    { title: 'Acción', entries: [genre('Acción uno')], status: 'completed' },
    {
      title: 'Romhack terminado',
      entries: [tag('Romhack')],
      status: 'completed',
    },
    { title: 'Romhack a medias', entries: [tag('Romhack')], status: 'in_progress' },
  ]);

  // Género = RPG AND Plataforma = PC
  await section('Géneros').click();
  await section('Mis plataformas').click();
  await box('RPG uno').check();
  await box('PC uno').check();
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expectTitles(['RPG en PC']);
  await expect(button('Filtros (2)')).toBeVisible();
  await button('Quitar filtros').first().click();
  await expect(heading('Videojuegos (5)')).toBeVisible();

  // Género = RPG OR Género = Acción
  await box('RPG uno').check();
  await box('Acción uno').check();
  await expectTitles(['Acción', 'RPG en PC', 'RPG sin PC']);
  await button('Quitar filtros').first().click();

  // Estado = Terminado AND Etiqueta = Romhack
  await section('Estado').click();
  await section('Etiquetas').click();
  await box('Terminado').check();
  await box('Romhack').check();
  await expectTitles(['Romhack terminado']);
});

test('tells the two kinds of platform apart, with their new names', async () => {
  await openFilters([
    { title: 'Lo tengo', entries: [owned('PC uno')] },
    { title: 'Salió', entries: [released('PC uno')] },
  ]);
  await section('Mis plataformas').click();
  await panel()
    .locator('details', { hasText: 'Mis plataformas' })
    .getByRole('checkbox', { name: 'PC uno' })
    .check();
  await expectTitles(['Lo tengo']);
  await button('Quitar filtros').first().click();

  await section('Plataformas de lanzamiento').click();
  await panel()
    .locator('details', { hasText: 'Plataformas de lanzamiento' })
    .getByRole('checkbox', { name: 'PC uno' })
    .check();
  await expectTitles(['Salió']);

  // The same names in the form and the detail view, in both languages.
  await button('Salió').click();
  await expect(page.getByText('Plataformas de lanzamiento', { exact: true })).toBeVisible();
  await button('Ajustes').click();
  const settings = page.getByRole('dialog');
  await settings.getByLabel('Idioma', { exact: true }).selectOption('en');
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Release platforms', { exact: true })).toBeVisible();
  await button('Edit').click();
  await expect(page.getByLabel('My platforms', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Release platforms', { exact: true })).toBeVisible();
});

test('filters by each kind of control', async () => {
  await openFilters([
    { title: 'Favorito', favorite: true, rating: 9 },
    { title: 'Rejugado', replay: true, rating: 4 },
    { title: 'Físico', physical: true },
    { title: 'Digital', digital: true },
    { title: 'Ambos', physical: true, digital: true },
  ]);

  await box('Favoritos').check();
  await expectTitles(['Favorito']);
  await box('Favoritos').uncheck();
  await box('Rejugados').check();
  await expectTitles(['Rejugado']);
  await box('Rejugados').uncheck();

  // A digital item is in "digital"; "both" is in each one.
  await section('Formato').click();
  await box('Físico').check();
  await expectTitles(['Ambos', 'Físico']);
  await box('Digital').check();
  await expectTitles(['Ambos', 'Digital', 'Físico']);
  await button('Quitar filtros').first().click();

  // "At least" and "not rated" are alternatives of one attribute.
  await section('Valoración').click();
  await page.getByLabel('Al menos', { exact: true }).selectOption('8');
  await expectTitles(['Favorito']);
  await box('Sin valorar').check();
  await expectTitles(['Ambos', 'Digital', 'Favorito', 'Físico']);
  await page.getByLabel('Al menos', { exact: true }).selectOption('');
  await expectTitles(['Ambos', 'Digital', 'Físico']);
});

test('calls the replay filter by the name of the kind', async () => {
  seedItems(dataDir, [{ title: 'Película', kind: 'movie', entries: [tag('Óscar')] }]);
  await button('Películas').click();
  await button('Filtros').click();
  await expect(box('Revisionadas')).toBeVisible();
  await expect(box('Rejugados')).toHaveCount(0);
  // A movie has no platforms, whatever the catalog holds.
  await expect(section('Mis plataformas')).toHaveCount(0);
  await expect(section('Etiquetas')).toHaveCount(1);
});

test('offers only what the library uses, without the trash', async () => {
  seedItems(dataDir, [
    { title: 'Película', kind: 'movie', entries: [tag('Solo en películas')] },
    { title: 'Juego', entries: [tag('En juegos')] },
  ]);
  await button('Videojuegos').click();
  await button('Filtros').click();
  await section('Etiquetas').click();
  await expect(box('En juegos')).toBeVisible();
  await expect(box('Solo en películas')).toHaveCount(0);

  // An attribute without values does not appear.
  await expect(section('Reparto')).toHaveCount(0);
  await expect(section('Géneros')).toHaveCount(0);
  await expect(section('Estado')).toHaveCount(1);

  await button('Juego').click();
  await button('Eliminar').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(section('Etiquetas')).toHaveCount(0);
});

test('searches long lists, also by other names, and keeps marks in sight', async () => {
  const many = Array.from({ length: 150 }, (_, index) => ({
    title: `Juego ${index}`,
    entries: [owned(`Plataforma ${String(index).padStart(3, '0')}`)],
  }));
  await openFilters([
    ...many,
    { title: 'El de Sega', entries: [owned('Mega Drive uno', ['Genesis uno'])] },
  ]);
  await section('Mis plataformas').click();

  const listed = panel().locator('.simple-filters__values').getByRole('checkbox');
  await expect(listed).toHaveCount(100);
  await expect(panel().getByText('Se muestran 100 de 151', { exact: false })).toBeVisible();

  const find = panel().getByRole('searchbox', { name: 'Buscar en Mis plataformas', exact: true });
  await box('Plataforma 000').check();
  await find.fill('GÉNESIS');
  // The value found by its other name, and what was already marked.
  await expect(listed).toHaveCount(2);
  await box('Mega Drive uno (Genesis uno)').check();
  await expect(heading('Videojuegos (2)')).toBeVisible();

  await find.fill('no existe');
  await expect(listed).toHaveCount(2);
  await find.fill('');
  await expect(panel().getByText('Se muestran 100 de 151', { exact: false })).toBeVisible();
});

test('combines with the search, and offers a way out when nothing is found', async () => {
  await openFilters([
    { title: 'Zelda', favorite: true },
    { title: 'Metroid', favorite: true },
    { title: 'Zork' },
  ]);
  await box('Favoritos').check();
  await page.getByRole('searchbox', { name: 'Buscar por título', exact: true }).fill('z');
  await expectTitles(['Zelda']);

  await page.getByRole('searchbox', { name: 'Buscar por título', exact: true }).fill('zork');
  await expect(heading('Videojuegos (0)')).toBeVisible();
  const noResults = page.locator('.library__no-results');
  await expect(noResults.getByText('No se ha encontrado nada.', { exact: true })).toBeVisible();

  await noResults.getByRole('button', { name: 'Quitar filtros', exact: true }).click();
  await expectTitles(['Zork']);
  await expect(button('Filtros')).toBeVisible();
  await expect(box('Favoritos')).not.toBeChecked();
});

test('keeps the marks per mode until the profile is closed', async () => {
  await openFilters([{ title: 'Zelda', favorite: true }, { title: 'Metroid' }]);
  seedItems(dataDir, [
    { title: 'Alien', kind: 'movie', favorite: true },
    { title: 'Zodiac', kind: 'movie' },
  ]);
  await box('Favoritos').check();
  await expectTitles(['Zelda']);

  // Coming back from an item, with the panel as it was.
  await page.locator('.item-card').first().click();
  await expect(heading('Zelda')).toBeVisible();
  await button('Volver').click();
  await expect(box('Favoritos')).toBeChecked();
  await expect(button('Filtros (1)')).toBeVisible();
  await expectTitles(['Zelda']);

  // Each mode has its own.
  await button('Volver').click();
  await button('Películas').click();
  await expectTitles(['Alien', 'Zodiac']);
  await expect(button('Filtros')).toBeVisible();

  await button('Volver').click();
  await button('Videojuegos').click();
  await expectTitles(['Zelda']);

  // Closing the profile forgets it.
  await button('Volver').click();
  await button('Volver').click();
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await expect(button('Filtros')).toBeVisible();
  await expectTitles(['Metroid', 'Zelda']);
});

test('unmarks a value deleted from its catalog, instead of finding nothing', async () => {
  await openFilters([
    { title: 'Con etiqueta', entries: [tag('Romhack')] },
    { title: 'Sin etiqueta' },
  ]);
  await section('Etiquetas').click();
  await box('Romhack').check();
  await expectTitles(['Con etiqueta']);

  await button('Catálogos').click();
  await page
    .getByRole('navigation', { name: 'Catálogos' })
    .getByRole('button', { name: 'Etiquetas' })
    .click();
  await button('Eliminar «Romhack»').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await button('Volver').click();
  await expect(button('Filtros')).toBeVisible();
  await expect(heading('Videojuegos (2)')).toBeVisible();
  await expectTitles(['Con etiqueta', 'Sin etiqueta']);
  await expect(section('Etiquetas')).toHaveCount(0);
});

test('goes back to the top when the filters change', async () => {
  await openFilters(
    Array.from({ length: 300 }, (_, index) => ({
      title: `Juego ${index}`,
      favorite: index % 2 === 0,
    })),
  );
  const scrollY = () => page.evaluate(() => (globalThis as unknown as { scrollY: number }).scrollY);
  await page.evaluate(() => {
    (globalThis as unknown as { scrollTo(x: number, y: number): void }).scrollTo(0, 120);
  });
  await expect.poll(scrollY).toBe(120);

  await box('Favoritos').check();
  await expect(heading('Videojuegos (150)')).toBeVisible();
  await expect.poll(scrollY).toBe(0);
});

test('moves the grid with the panel, staying steady in a narrow window', async () => {
  await app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setSize(1024, 720);
  });
  await openFilters(Array.from({ length: 200 }, (_, index) => ({ title: `Juego ${index}` })));

  const firstCard = page.locator('.item-card').first();
  const top = () =>
    firstCard.evaluate(
      (card) =>
        (card as unknown as { getBoundingClientRect(): { top: number } }).getBoundingClientRect()
          .top,
    );
  const withPanel = await top();
  await button('Filtros').click();
  await expect(panel()).toHaveCount(0);
  await expect.poll(top).toBeLessThan(withPanel);
  // A card that moves is not clickable: it has to settle, so this also proves it does.
  await button('Filtros').click();
  await expect.poll(top).toBe(withPanel);
  await firstCard.click();
  await expect(heading('Juego 0')).toBeVisible();
});
