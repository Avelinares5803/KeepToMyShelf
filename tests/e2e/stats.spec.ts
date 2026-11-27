import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';
import { seedItems, type SeedEntry } from './seed-items';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const section = (name: string) => page.getByRole('region', { name, exact: true });
/** The rows of the bars of a section, as read aloud ("Terminados: 2 (50 %)"). */
const bars = (name: string) => section(name).getByRole('listitem');
/** The number of a figure of a section, by its exact label. */
const figure = (sectionName: string, label: string) =>
  section(sectionName)
    .locator('.stat-tile')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd');

const genre = (name: string): SeedEntry => ({ role: 'genre', catalog: 'game_genre', name });
const screenGenre = (name: string): SeedEntry => ({ role: 'genre', catalog: 'screen_genre', name });
const owned = (name: string): SeedEntry => ({ role: 'owned_on', catalog: 'platform', name });

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

test('says there is nothing to count in an empty library', async () => {
  await button('Estadísticas').click();
  await expect(heading('Estadísticas')).toBeVisible();
  await expect(
    page.getByText('Todavía no hay nada que contar. Las estadísticas no cuentan la papelera.'),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toContainText(
    'Estadísticas',
  );
});

test('sums up the library, by kind, without the trash', async () => {
  seedItems(dataDir, [
    {
      title: 'Zelda',
      status: 'completed',
      finishedOn: '2021-03-14',
      rating: 10,
      minutesPlayed: 90,
      favorite: true,
      physical: true,
      digital: true,
      entries: [genre('Aventura uno'), owned('Consola uno')],
    },
    {
      title: 'Metroid',
      status: 'completed',
      finishedOn: 'unknown',
      rating: 7,
      minutesPlayed: 30,
      entries: [genre('Aventura uno'), genre('Acción uno'), owned('Consola uno')],
    },
    { title: 'Tetris', status: 'abandoned', finishedOn: '2022' },
    {
      kind: 'movie',
      title: 'Alien',
      status: 'completed',
      finishedOn: '2021',
      replay: true,
      entries: [screenGenre('Terror uno')],
    },
  ]);

  await button('Estadísticas').click();
  await expect(page.getByLabel('Mostrar')).toHaveValue('all');
  await expect(figure('Resumen', 'Total')).toHaveText('4');
  await expect(figure('Resumen', 'Videojuegos')).toHaveText('3');
  await expect(figure('Resumen', 'Películas')).toHaveText('1');
  await expect(figure('Resumen', 'Rejugados o revisionados')).toHaveText('1');
  await expect(figure('Resumen', 'Físico')).toHaveText('1');
  await expect(bars('Estados')).toHaveText([
    'Por empezar: 0 (0 %)',
    'En curso: 0 (0 %)',
    'Terminados: 3 (75 %)',
    'Abandonados: 1 (25 %)',
    'Sin estado: 0 (0 %)',
  ]);
  await expect(section('Valoraciones')).toContainText('Media: 4,3 de 5 estrellas');
  await expect(bars('Valoraciones').first()).toHaveText('5 estrellas: 1 (25 %)');
  await expect(bars('Valoraciones').last()).toHaveText('Sin valorar: 2 (50 %)');
  await expect(figure('Horas jugadas', 'Tiempo total')).toHaveText('02:00');
  await expect(figure('Horas jugadas', 'Media por juego')).toHaveText('01:00');
  await expect(bars('Terminados por año')).toHaveText(['2021: 2']);
  await expect(section('Terminados por año')).toContainText('Terminados sin fecha de fin: 1');
  await expect(bars('Géneros de videojuegos')).toHaveText(['Aventura uno: 2', 'Acción uno: 1']);
  await expect(bars('Géneros de películas y series')).toHaveText(['Terror uno: 1']);
  await expect(bars('Mis plataformas')).toHaveText(['Consola uno: 2']);

  // One kind: its own wording, and only its sections.
  await page.getByLabel('Mostrar').selectOption('movie');
  await expect(figure('Resumen', 'Total')).toHaveText('1');
  await expect(figure('Resumen', 'Revisionadas')).toHaveText('1');
  await expect(bars('Estados').nth(2)).toHaveText('Terminada: 1 (100 %)');
  await expect(bars('Géneros')).toHaveText(['Terror uno: 1']);
  await expect(section('Horas jugadas')).toHaveCount(0);
  await expect(section('Mis plataformas')).toHaveCount(0);

  // An item sent to the trash is no longer counted.
  await button('Volver').click();
  await button('Videojuegos').click();
  await button('Metroid').click();
  await button('Eliminar').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(heading('Videojuegos (2)')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Ruta de navegación' })
    .getByRole('button', { name: 'Ana', exact: true })
    .click();
  await button('Estadísticas').click();
  await expect(figure('Resumen', 'Total')).toHaveText('3');
  await expect(bars('Géneros de videojuegos')).toHaveText(['Aventura uno: 1']);
  await expect(bars('Mis plataformas')).toHaveText(['Consola uno: 1']);
  await expect(figure('Horas jugadas', 'Tiempo total')).toHaveText('01:30');
  await expect(section('Terminados por año')).not.toContainText('sin fecha');
});

test('shows the ten most used genres, and all of them on request', async () => {
  seedItems(
    dataDir,
    Array.from({ length: 12 }, (_, index) => ({
      title: `Juego ${index + 1}`,
      entries: [genre(`Género ${String(index + 1).padStart(2, '0')}`)],
    })),
  );

  await button('Estadísticas').click();
  await page.getByLabel('Mostrar').selectOption('game');
  await expect(bars('Géneros')).toHaveCount(10);
  await expect(bars('Géneros').first()).toHaveText('Género 01: 1');
  await button('Ver todos (12)').click();
  await expect(bars('Géneros')).toHaveCount(12);
  await expect(button('Ver menos')).toHaveAttribute('aria-expanded', 'true');
  await button('Ver menos').click();
  await expect(bars('Géneros')).toHaveCount(10);
});
