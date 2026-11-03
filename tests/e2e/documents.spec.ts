import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';

let dataDir: string;
let filesDir: string;
let app: ElectronApplication | undefined;
let page: Page;

/** A small PDF in the user's folder; `text` makes each one a different file. */
function pdfFile(name: string, text = name): string {
  const path = join(filesDir, name);
  writeFileSync(path, `%PDF-1.7\n% ${text}\n%%EOF\n`);
  return path;
}

/** The system file dialog is replaced so it "chooses" the given files. */
async function chooseFiles(filePaths: string[]): Promise<void> {
  await app!.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as never;
  }, filePaths);
}

/**
 * The system viewer cannot be driven either: shell.openPath is replaced so it records the
 * files it is asked to open, and answers `failure` ('' means it opened them).
 */
async function replaceViewer(failure = ''): Promise<void> {
  await app!.evaluate(({ shell }, answer) => {
    const opened: string[] = [];
    (globalThis as { openedFiles?: string[] }).openedFiles = opened;
    shell.openPath = async (path: string) => {
      opened.push(path);
      return answer;
    };
  }, failure);
}

const openedFiles = () =>
  app!.evaluate(() => (globalThis as { openedFiles?: string[] }).openedFiles ?? []);

function stored(folder: 'files' | '.tmp'): string[] {
  const [profile] = readdirSync(join(dataDir, 'profiles'));
  const root = join(dataDir, 'profiles', profile!, 'media', folder);
  if (!existsSync(root)) return [];
  return (readdirSync(root, { recursive: true }) as string[]).filter((path) =>
    statSync(join(root, path)).isFile(),
  );
}

/**
 * Leaves the editor discarding its changes. Otherwise closing the app would ask about them,
 * as it should, and the test could not close it.
 */
async function leaveWithoutSaving(): Promise<void> {
  await button('Volver').click();
  await page
    .getByRole('dialog', { name: 'Cambios sin guardar' })
    .getByRole('button', { name: 'Descartar cambios' })
    .click();
  await expect(heading('Videojuegos (0)')).toBeVisible();
}

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const nameField = (number: number) =>
  page.getByRole('textbox', { name: `Nombre del documento ${number}`, exact: true });

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  filesDir = join(dataDir, 'archivos del usuario');
  mkdirSync(filesDir);
  ({ app, page } = await launchApp(dataDir));
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await button('Añadir').click();
  await page.getByLabel('Título', { exact: true }).fill('Chrono Trigger');
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('adds, names, orders and saves documents, and opens them in the system viewer', async () => {
  await chooseFiles([pdfFile('Manual de Zelda.pdf'), pdfFile('SLUS-01234_mapa_v2.pdf')]);
  await button('Añadir documentos').click();

  // Each one is named after its file, without ".pdf".
  await expect(nameField(1)).toHaveValue('Manual de Zelda');
  await expect(nameField(2)).toHaveValue('SLUS-01234_mapa_v2');
  expect(stored('files')).toEqual([]);

  await nameField(2).fill('Mapa del mundo');
  await button('Subir el documento 2').click();
  await expect(nameField(1)).toHaveValue('Mapa del mundo');
  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();
  expect(stored('files')).toHaveLength(2);
  expect(stored('.tmp')).toEqual([]);

  // In the detail view, in their order, each opens a copy named after it.
  const media = page.getByRole('region', { name: 'Multimedia' });
  await expect(media.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible();
  await expect(media.getByRole('heading', { name: 'Imágenes', exact: true })).toHaveCount(0);
  const links = media.getByRole('button', { name: /^Abrir «/ });
  await expect(links).toHaveText(['Mapa del mundo', 'Manual de Zelda']);

  await replaceViewer();
  await button('Abrir «Manual de Zelda»').click();
  await expect.poll(openedFiles).toHaveLength(1);
  const [opened] = await openedFiles();
  expect(basename(opened!)).toBe('Manual de Zelda.pdf');
  expect(opened!.startsWith(join(dataDir, 'opened-documents'))).toBe(true);
  expect(existsSync(opened!)).toBe(true);
});

test('blocks saving a document without a name', async () => {
  await chooseFiles([pdfFile('Manual.pdf')]);
  await button('Añadir documentos').click();
  await nameField(1).fill('   ');
  await button('Guardar').click();

  await expect(page.getByRole('alert')).toHaveText('El nombre del documento no puede estar vacío.');
  await expect(nameField(1)).toHaveAttribute('aria-invalid', 'true');
  expect(stored('files')).toEqual([]);

  await nameField(1).fill('Manual');
  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();
});

test('refuses other files in the documents dialog, and PDFs in the images dialog', async () => {
  const image = join(filesDir, 'foto.png');
  writeFileSync(image, Buffer.from('89504e470d0a1a0a', 'hex'));
  await chooseFiles([image, pdfFile('Manual.pdf')]);
  await button('Añadir documentos').click();
  const block = (name: string) => page.getByRole('group', { name, exact: true });
  await expect(block('Documentos').getByRole('alert')).toHaveText(
    'No se ha podido añadir «foto.png»: Ese archivo no es un documento PDF.',
  );
  await expect(nameField(1)).toHaveValue('Manual');

  await chooseFiles([pdfFile('Guía.pdf')]);
  await button('Añadir imágenes').click();
  await expect(block('Imágenes').getByRole('alert')).toHaveText(
    'No se ha podido añadir «Guía.pdf»: Ese archivo no es una imagen.',
  );
  await expect(page.getByRole('img', { name: /^Imagen \d$/ })).toHaveCount(0);
  await leaveWithoutSaving();
});

test('keeps nothing when the edit is cancelled with new documents', async () => {
  await chooseFiles([pdfFile('Manual.pdf')]);
  await button('Añadir documentos').click();
  await expect(nameField(1)).toBeVisible();

  await leaveWithoutSaving();
  await expect.poll(() => stored('.tmp')).toEqual([]);
  expect(stored('files')).toEqual([]);
});

test('tells when the system cannot open a document', async () => {
  await chooseFiles([pdfFile('Manual.pdf')]);
  await button('Añadir documentos').click();
  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();

  await replaceViewer('No application is associated with the specified file');
  await button('Abrir «Manual»').click();
  await expect(page.getByRole('alert')).toContainText(
    'No se ha podido abrir el documento con el programa del sistema.',
  );
});

test('sets the PDF size limit in Settings', async () => {
  await button('Ajustes').click();
  const settings = page.getByRole('dialog', { name: 'Ajustes' });
  const limit = settings.getByLabel('Tamaño máximo de los PDF', { exact: true });
  await expect(limit).toHaveValue('200');
  await limit.selectOption({ label: '50 MB' });
  await settings.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await button('Ajustes').click();
  await expect(limit).toHaveValue('50');
  await settings.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await leaveWithoutSaving();
});
