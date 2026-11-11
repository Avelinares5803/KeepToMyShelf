import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import sharp from 'sharp';
import { launchApp } from './launch-app';
import { scrollTop } from './scroll-area';
import { seedItems as seedInto, type SeedItem } from './seed-items';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const searchBox = () => page.getByRole('searchbox', { name: 'Buscar por título', exact: true });
const sortField = () => page.getByLabel('Ordenar por', { exact: true });
const shownTitles = () => page.locator('.item-card__title');

const seedItems = (items: readonly SeedItem[]) => seedInto(dataDir, items);

/** Leaves the library and returns, so it reads what was seeded. */
async function reopenGames(): Promise<void> {
  await button('Volver').click();
  await button('Videojuegos').click();
}

const search = (text: string) => searchBox().fill(text);

async function expectOrder(titles: string[]): Promise<void> {
  await expect(shownTitles()).toHaveText(titles);
}

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  ({ app, page } = await launchApp(dataDir));
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('searches by title, alternate title and untitled name, and counts the results', async () => {
  seedItems([
    { title: 'Pokémon Rojo' },
    { title: 'Chrono Trigger', alternateTitle: 'クロノ・トリガー' },
    { title: '100% Orange Juice' },
    { placeholder: 1 },
    { placeholder: 2 },
  ]);
  await reopenGames();
  await expect(heading('Videojuegos (5)')).toBeVisible();

  await search('POKEMON');
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expect(button('Pokémon Rojo')).toBeVisible();

  await search('トリガー');
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expect(button('Chrono Trigger')).toBeVisible();

  await search('100%');
  await expect(heading('Videojuegos (1)')).toBeVisible();

  await search('sin nombre');
  await expect(heading('Videojuegos (2)')).toBeVisible();
  await search('sin nombre 2');
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expect(button('Sin nombre 2')).toBeVisible();

  // The name of untitled items follows the language.
  await search('untitled');
  await expect(heading('Videojuegos (0)')).toBeVisible();
  await button('Ajustes').click();
  const settings = page.getByRole('dialog');
  await settings.getByLabel('Idioma', { exact: true }).selectOption('en');
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(heading('Video games (2)')).toBeVisible();
  await expect(button('Untitled 1')).toBeVisible();
});

test('tells when nothing is found, apart from an empty library', async () => {
  await expect(page.getByText('Todavía no hay nada aquí', { exact: false })).toBeVisible();
  await expect(button('Limpiar búsqueda')).toHaveCount(0);

  await search('zelda');
  await expect(page.getByText('No se ha encontrado nada.', { exact: true })).toBeVisible();
  await expect(page.getByText('Todavía no hay nada aquí', { exact: false })).toHaveCount(0);

  await button('Limpiar búsqueda').click();
  await expect(searchBox()).toHaveValue('');
  await expect(page.getByText('Todavía no hay nada aquí', { exact: false })).toBeVisible();
});

test('sorts by every field both ways, always with missing data last', async () => {
  seedItems([
    {
      title: 'Ábaco',
      rating: 2,
      createdAt: '2026-01-02T00:00:00.000Z',
      releaseDate: '1990',
      startedOn: '2005',
      finishedOn: '2006',
    },
    {
      title: 'zelda',
      rating: 9,
      createdAt: '2026-01-03T00:00:00.000Z',
      releaseDate: '2001-03',
      startedOn: '2001',
      finishedOn: '2020',
    },
    {
      title: 'Sin datos',
      createdAt: '2026-01-01T00:00:00.000Z',
      startedOn: 'unknown',
      finishedOn: 'unknown',
    },
    { placeholder: 1, createdAt: '2026-01-04T00:00:00.000Z' },
  ]);
  await reopenGames();

  await expectOrder(['Ábaco', 'Sin datos', 'zelda', 'Sin nombre 1']);
  await button('A-Z').click();
  await expectOrder(['zelda', 'Sin datos', 'Ábaco', 'Sin nombre 1']);

  await sortField().selectOption({ label: 'Fecha de adición' });
  await expectOrder(['Sin nombre 1', 'zelda', 'Ábaco', 'Sin datos']);
  await button('Más reciente primero').click();
  await expectOrder(['Sin datos', 'Ábaco', 'zelda', 'Sin nombre 1']);

  await sortField().selectOption({ label: 'Valoración' });
  await expectOrder(['zelda', 'Ábaco', 'Sin datos', 'Sin nombre 1']);
  await button('Mayor primero').click();
  await expectOrder(['Ábaco', 'zelda', 'Sin datos', 'Sin nombre 1']);

  await sortField().selectOption({ label: 'Fecha de lanzamiento' });
  await expectOrder(['zelda', 'Ábaco', 'Sin datos', 'Sin nombre 1']);
  await button('Más reciente primero').click();
  await expectOrder(['Ábaco', 'zelda', 'Sin datos', 'Sin nombre 1']);

  await sortField().selectOption({ label: 'Fecha de inicio' });
  await expectOrder(['Ábaco', 'zelda', 'Sin datos', 'Sin nombre 1']);
  await button('Más reciente primero').click();
  await expectOrder(['zelda', 'Ábaco', 'Sin datos', 'Sin nombre 1']);

  await sortField().selectOption({ label: 'Fecha de fin' });
  await expectOrder(['zelda', 'Ábaco', 'Sin datos', 'Sin nombre 1']);
  await button('Más reciente primero').click();
  await expectOrder(['Ábaco', 'zelda', 'Sin datos', 'Sin nombre 1']);
});

test('calls the release date a premiere date in movies and series', async () => {
  await expect(sortField().locator('option', { hasText: 'Fecha de lanzamiento' })).toHaveCount(1);

  await button('Volver').click();
  await button('Películas').click();
  await expect(sortField().locator('option', { hasText: 'Fecha de estreno' })).toHaveCount(1);
  await expect(sortField().locator('option', { hasText: 'Fecha de lanzamiento' })).toHaveCount(0);
});

test('keeps the search and the sort per mode until the profile is closed', async () => {
  seedItems([
    { title: 'Zelda', rating: 9 },
    { title: 'Zork', rating: 3 },
    { title: 'Metroid' },
    { title: 'Zodiac', kind: 'movie' },
    { title: 'Alien', kind: 'movie' },
  ]);
  await reopenGames();

  await search('z');
  await sortField().selectOption({ label: 'Valoración' });
  await expectOrder(['Zelda', 'Zork']);

  // Opening an item and coming back.
  await button('Zork').click();
  await expect(heading('Zork')).toBeVisible();
  await button('Volver').click();
  await expect(searchBox()).toHaveValue('z');
  await expect(sortField()).toHaveValue('rating');
  await expectOrder(['Zelda', 'Zork']);

  // Each mode has its own.
  await button('Volver').click();
  await button('Películas').click();
  await expect(searchBox()).toHaveValue('');
  await expect(sortField()).toHaveValue('title');
  await expectOrder(['Alien', 'Zodiac']);

  await button('Volver').click();
  await button('Videojuegos').click();
  await expect(searchBox()).toHaveValue('z');
  await expectOrder(['Zelda', 'Zork']);

  // Closing the profile forgets it all.
  await button('Volver').click();
  await button('Volver').click();
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await expect(searchBox()).toHaveValue('');
  await expect(sortField()).toHaveValue('title');
  await expectOrder(['Metroid', 'Zelda', 'Zork']);
});

test('returns to the same place, and to the top with new results', async () => {
  // Tall covers on the first rows: the page must keep its height before they load.
  const filesDir = join(dataDir, 'archivos del usuario');
  mkdirSync(filesDir);
  await button('Ajustes').click();
  await page.getByLabel('Al importar imágenes').selectOption({ label: 'Guardar el original' });
  await button('Cerrar').click();
  for (let index = 0; index < 6; index += 1) {
    const path = join(filesDir, `portada-${index}.png`);
    const background = { r: index * 40, g: 120, b: 200 };
    writeFileSync(
      path,
      await sharp({ create: { width: 300, height: 900, channels: 3, background } })
        .png()
        .toBuffer(),
    );
    await button('Añadir').click();
    await page.getByLabel('Título', { exact: true }).fill(`A con portada ${index}`);
    await app!.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [chosen] })) as never;
    }, path);
    await button('Añadir portada').click();
    await expect(page.getByRole('img', { name: 'Portada', exact: true })).toBeVisible();
    await button('Guardar').click();
    await expect(heading(`A con portada ${index}`)).toBeVisible();
    await button('Volver').click();
  }
  seedItems(
    Array.from({ length: 80 }, (_, index) => ({
      title: `Juego ${String(index).padStart(2, '0')}`,
    })),
  );
  await reopenGames();
  await expect(heading('Videojuegos (86)')).toBeVisible();

  const scrollY = () => scrollTop(page);
  // Far down, the covers above are no longer drawn: the page only knows their height.
  const last = button('Juego 79');
  await page.locator('.item-card').last().scrollIntoViewIfNeeded();
  await page.mouse.move(400, 400);
  for (let tries = 0; tries < 20 && (await last.count()) === 0; tries += 1) {
    await page.mouse.wheel(0, 1500);
    await page.waitForTimeout(100);
  }
  await last.scrollIntoViewIfNeeded();
  expect(await scrollY()).toBeGreaterThan(500);

  await last.click();
  await expect(heading('Juego 79')).toBeVisible();
  await button('Volver').click();
  await expect(heading('Videojuegos (86)')).toBeVisible();
  await expect(last).toBeInViewport();

  await sortField().selectOption({ label: 'Fecha de adición' });
  await expect.poll(scrollY).toBe(0);
});
