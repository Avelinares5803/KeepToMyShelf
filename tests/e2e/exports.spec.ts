import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { LibraryExportFile } from '../../src/shared/exports';
import { parseCsv } from '../support/csv';
import { launchApp } from './launch-app';
import { seedItems } from './seed-items';

let dataDir: string;
/** Where the user "saves" exports: outside the app's data folder, like Documents. */
let outDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const button = (name: string) => page.getByRole('button', { name, exact: true });
const section = (name = 'Exportar') => page.getByRole('region', { name, exact: true });
const exportButton = () => section().getByRole('button', { name: 'Exportar…', exact: true });
const content = () => section().getByLabel('Qué exportar', { exact: true });
const separator = () => section().getByLabel('Separador', { exact: true });

/** The system "Save as" dialog is replaced so it "chooses" this path (or is cancelled). */
async function chooseSavePath(path: string | null): Promise<void> {
  await app!.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const options = args.at(-1) as { defaultPath?: string };
      (globalThis as { suggestedPath?: string }).suggestedPath = options.defaultPath;
      return filePath === null ? { canceled: true, filePath: '' } : { canceled: false, filePath };
    }) as never;
  }, path);
}

const suggestedPath = () =>
  app!.evaluate(() => (globalThis as { suggestedPath?: string }).suggestedPath);

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  outDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-exportar-ñ-'));
  ({ app, page } = await launchApp(dataDir));
  await button('Español').click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
  await expect(page.getByRole('heading', { name: '¿Qué quieres consultar?' })).toBeVisible();
  seedItems(dataDir, [
    { title: 'Okami', rating: 9 },
    { title: 'Ico', status: 'completed' },
    { title: 'Alien', kind: 'movie' },
  ]);
  await button('Ajustes').click();
});

test.afterEach(async () => {
  await app?.close();
  for (const dir of [dataDir, outDir]) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('exports the whole library to JSON', async () => {
  await expect(section()).toContainText('sin las imágenes, los documentos ni los ajustes');
  await expect(section()).toContainText('también lo que hay en la papelera');
  await expect(separator()).toHaveCount(0);

  // Cancelling the dialog saves nothing and says nothing.
  await chooseSavePath(null);
  await exportButton().click();
  await expect.poll(suggestedPath).toMatch(/[\\/]KeepToMyShelf - Ana - Biblioteca - .+\.json$/);
  await expect(exportButton()).toBeEnabled();
  await expect(section().getByRole('status')).toHaveCount(0);
  expect(readdirSync(outDir)).toEqual([]);

  const destination = join(outDir, 'Todo.json');
  await chooseSavePath(destination);
  await exportButton().click();
  await expect(section().getByRole('status')).toHaveText('Exportado: «Todo.json» (3 elementos).');
  const file = JSON.parse(readFileSync(destination, 'utf8')) as LibraryExportFile;
  expect(file).toMatchObject({ format: 'keeptomyshelf-library', profile: { name: 'Ana' } });
  expect(file.items.map(({ title }) => title)).toEqual(['Ico', 'Okami', 'Alien']);
  expect(readdirSync(outDir)).toEqual(['Todo.json']);
});

test('exports one kind to CSV, with the separator chosen', async () => {
  await content().selectOption('game');
  await expect(section()).toContainText('No incluye la papelera');
  await expect(separator()).toHaveValue(';');
  const spanish = join(outDir, 'juegos.csv');
  await chooseSavePath(spanish);
  await exportButton().click();
  await expect(section().getByRole('status')).toHaveText('Exportado: «juegos.csv» (2 elementos).');
  expect(await suggestedPath()).toMatch(/[\\/]KeepToMyShelf - Ana - Videojuegos - .+\.csv$/);
  const rows = parseCsv(readFileSync(spanish, 'utf8').slice(1), ';');
  const rating = rows[0]!.indexOf('Valoración');
  expect(rows.map((row) => [row[0], row[rating]])).toEqual([
    ['Título', 'Valoración'],
    ['Ico', ''],
    ['Okami', '4,5'],
  ]);

  await separator().selectOption(',');
  await content().selectOption('movie');
  await expect(separator()).toHaveValue(',');
  const movies = join(outDir, 'pelis.csv');
  await chooseSavePath(movies);
  await exportButton().click();
  await expect(section().getByRole('status')).toHaveText('Exportado: «pelis.csv» (1 elemento).');
  expect(parseCsv(readFileSync(movies, 'utf8').slice(1), ',')[1]![0]).toBe('Alien');
});

test('follows the language of the app', async () => {
  await page.getByRole('dialog').getByLabel('Idioma', { exact: true }).selectOption('en');
  const english = section('Export');
  await english.getByLabel('What to export', { exact: true }).selectOption('game');
  await expect(english.getByLabel('Separator', { exact: true })).toHaveValue(',');
  const destination = join(outDir, 'games.csv');
  await chooseSavePath(destination);
  await english.getByRole('button', { name: 'Export…', exact: true }).click();
  await expect(english.getByRole('status')).toHaveText('Exported: “games.csv” (2 items).');
  expect(parseCsv(readFileSync(destination, 'utf8').slice(1), ',')[0]![0]).toBe('Title');
});

test('says when the file cannot be written', async () => {
  const taken = join(outDir, 'ocupado');
  mkdirSync(join(taken, 'dentro'), { recursive: true });
  await chooseSavePath(taken);
  await exportButton().click();
  await expect(section().getByRole('alert')).toContainText('No se ha podido exportar.');
  await expect(exportButton()).toBeEnabled();
  expect(readdirSync(outDir)).toEqual(['ocupado']);
});

test('is not offered without an open profile', async () => {
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await button('Volver').click();
  await expect(button('Abrir el perfil de Ana')).toBeVisible();
  await button('Ajustes').click();
  await expect(page.getByRole('dialog', { name: 'Ajustes' })).toBeVisible();
  await expect(section()).toHaveCount(0);
});
