import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';
import { scrollAreaTo, scrollTop } from './scroll-area';
import { seedCollections, seedItems, type SeedEntry, type SeedItem } from './seed-items';

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

test('filters by no status, an exact rating and the end year', async () => {
  await openFilters([
    { title: 'Terminado', status: 'completed', rating: 6, finishedOn: '2024-03-14' },
    { title: 'Terminado antes', status: 'completed', rating: 8, finishedOn: '2021' },
    { title: 'Sin estado', rating: 6, finishedOn: 'unknown' },
    { title: 'Nada' },
  ]);

  // "No status" is one more option of the status.
  await section('Estado').click();
  await box('Sin estado').check();
  await expectTitles(['Nada', 'Sin estado']);
  await box('Terminado').check();
  await expect(button('Filtros (2)')).toBeVisible();
  await expectTitles(['Nada', 'Sin estado', 'Terminado', 'Terminado antes']);
  await button('Quitar filtros').first().click();

  // The same "at least" and "at most" give an exact rating.
  await section('Valoración').click();
  const atLeast = page.getByLabel('Al menos', { exact: true });
  const atMost = page.getByLabel('Como mucho', { exact: true });
  await atMost.selectOption('6');
  await expectTitles(['Sin estado', 'Terminado']);
  await atLeast.selectOption('6');
  await expect(button('Filtros (2)')).toBeVisible();
  await expectTitles(['Sin estado', 'Terminado']);
  await box('Sin valorar').check();
  await expectTitles(['Nada', 'Sin estado', 'Terminado']);
  await box('Sin valorar').uncheck();

  // "At least" above "at most" finds nothing, and says why.
  const warning = page.getByText('«Al menos» es mayor que «Como mucho».', { exact: true });
  await expect(warning).toHaveCount(0);
  await atLeast.selectOption('8');
  await expect(warning).toBeVisible();
  await expect(atLeast).toHaveAttribute('aria-invalid', 'true');
  await expect(atMost).toHaveAttribute('aria-invalid', 'true');
  await expect(heading('Videojuegos (0)')).toBeVisible();
  await button('Quitar filtros').first().click();
  await expect(warning).toHaveCount(0);

  // The year of the end date; an unknown one has no year.
  const number = (name: string) => panel().getByRole('spinbutton', { name, exact: true });
  await section('Año de fin').click();
  await expect(number('Año de fin, desde')).toHaveAttribute('placeholder', '2021');
  await expect(number('Año de fin, hasta')).toHaveAttribute('placeholder', '2024');
  await number('Año de fin, desde').fill('2022');
  await expectTitles(['Terminado']);
});

test('filters by collection, and unmarks a collection that is deleted', async () => {
  const goToModes = () =>
    page
      .getByRole('navigation', { name: 'Ruta de navegación' })
      .getByRole('button', { name: 'Ana', exact: true })
      .click();
  seedItems(dataDir, [
    { title: 'Mejor' },
    { title: 'En las dos' },
    { title: 'Suelto' },
    { title: 'Película', kind: 'movie' },
  ]);
  seedCollections(dataDir, [
    { name: 'Mejores', items: ['Mejor', 'En las dos', 'Película'] },
    { name: 'Pendientes', items: ['En las dos'] },
    { name: 'Cine', items: ['Película'] },
    { name: 'Vacía' },
  ]);
  await button('Videojuegos').click();
  await expect(heading('Videojuegos (3)')).toBeVisible();
  await button('Filtros').click();

  // Only the collections with games are offered.
  await section('Colecciones').click();
  await expect(box('Mejores')).toBeVisible();
  await expect(box('Pendientes')).toBeVisible();
  await expect(box('Cine')).toHaveCount(0);
  await expect(box('Vacía')).toHaveCount(0);

  await box('Mejores').check();
  await expectTitles(['En las dos', 'Mejor']);
  await box('Pendientes').check();
  await expectTitles(['En las dos', 'Mejor']);
  await box('Mejores').uncheck();
  await expectTitles(['En las dos']);
  await expect(button('Filtros (1)')).toBeVisible();

  await goToModes();
  await button('Colecciones').click();
  await button('Pendientes 1 elemento').click();
  await button('Eliminar colección').click();
  await page
    .getByRole('dialog', { name: 'Eliminar colección', exact: true })
    .getByRole('button', { name: 'Eliminar colección', exact: true })
    .click();
  await expect(heading('Colecciones (3)')).toBeVisible();

  await goToModes();
  await button('Videojuegos').click();
  await expect(heading('Videojuegos (3)')).toBeVisible();
  await expect(button('Filtros')).toBeVisible();
});

test('filters by numbers from and to, with the range of the library as a hint', async () => {
  await openFilters([
    { title: 'Clásico', releaseDate: '1994-05', minutesPlayed: 600 },
    { title: 'Moderno', releaseDate: '2019', minutesPlayed: 630 },
    { title: 'Sin datos' },
  ]);
  const number = (name: string) => panel().getByRole('spinbutton', { name, exact: true });

  await section('Año de lanzamiento').click();
  const yearFrom = number('Año de lanzamiento, desde');
  await expect(yearFrom).toHaveAttribute('placeholder', '1994');
  await expect(number('Año de lanzamiento, hasta')).toHaveAttribute('placeholder', '2019');
  await yearFrom.fill('2000');
  await expectTitles(['Moderno']);
  await expect(button('Filtros (1)')).toBeVisible();
  await number('Año de lanzamiento, hasta').fill('2018');
  await expect(heading('Videojuegos (0)')).toBeVisible();
  await expect(button('Filtros (2)')).toBeVisible();

  // A number the field cannot have does not apply, and is marked.
  await number('Año de lanzamiento, hasta').fill('');
  await yearFrom.fill('0');
  await expect(yearFrom).toHaveAttribute('aria-invalid', 'true');
  await expectTitles(['Clásico', 'Moderno', 'Sin datos']);
  // Like a half-filled advanced row, it counts for nothing, so there is nothing to remove.
  await expect(button('Filtros')).toBeVisible();
  await expect(button('Quitar filtros').first()).toBeDisabled();
  await yearFrom.fill('');

  // Whole hours: 10:30 is not "to 10", but it is "to 11".
  await section('Horas jugadas').click();
  await expect(number('Horas jugadas, hasta')).toHaveAttribute('placeholder', '11');
  await number('Horas jugadas, hasta').fill('10');
  await expectTitles(['Clásico']);
  await number('Horas jugadas, hasta').fill('11');
  await expectTitles(['Clásico', 'Moderno']);
});

test('offers each kind its numbers, only when some item has them', async () => {
  seedItems(dataDir, [
    { title: 'Larga', kind: 'series', seasons: 7 },
    { title: 'Corta', kind: 'series', seasons: 1 },
    { title: 'Juego' },
  ]);
  await button('Series').click();
  await button('Filtros').click();
  await expect(section('Año de estreno')).toHaveCount(0);
  await expect(section('Horas jugadas')).toHaveCount(0);
  await section('Temporadas').click();
  await panel().getByRole('spinbutton', { name: 'Temporadas, desde', exact: true }).fill('2');
  await expectTitles(['Larga']);

  await button('Volver').click();
  await button('Videojuegos').click();
  await button('Filtros').click();
  await expect(section('Año de lanzamiento')).toHaveCount(0);
  await expect(section('Temporadas')).toHaveCount(0);
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
  const scrollY = () => scrollTop(page);
  await scrollAreaTo(page, 120);
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
