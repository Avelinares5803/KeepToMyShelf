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
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import sharp from 'sharp';
import { launchApp } from './launch-app';

let dataDir: string;
let filesDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

async function file(name: string, bytes: Buffer | Promise<Buffer>): Promise<string> {
  const path = join(filesDir, name);
  writeFileSync(path, await bytes);
  return path;
}

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 40 } } })
    .png()
    .toBuffer();

// The few browser APIs the page code below uses: the tests are typed for Node only.
interface PageDataTransfer {
  items: { add(file: File): void };
  dropEffect: string;
}
interface PageFileInput {
  type: string;
  multiple: boolean;
  hidden: boolean;
  files: Iterable<File> | null;
  remove(): void;
}
interface PageGlobals {
  document: {
    createElement(tag: 'input'): PageFileInput;
    body: { append(element: PageFileInput): void };
  };
  DataTransfer: new () => PageDataTransfer;
  DragEvent: new (
    type: string,
    init: { bubbles: boolean; cancelable: boolean; dataTransfer: PageDataTransfer },
  ) => { defaultPrevented: boolean; dataTransfer: PageDataTransfer | null };
}

/**
 * Drops files from the disk on `target`, as the file explorer would. Playwright cannot drag
 * from outside the window, so the files are loaded into a temporary file input first: the
 * `File` objects it holds are backed by those files on disk, so Electron knows their paths,
 * like those of a real drop. They are then dropped with the drag events a real drop fires.
 */
async function dropFiles(target: Locator, paths: string[]): Promise<void> {
  const input = await page.evaluateHandle(() => {
    const { document } = globalThis as unknown as PageGlobals;
    const element = document.createElement('input');
    element.type = 'file';
    element.multiple = true;
    element.hidden = true;
    document.body.append(element);
    return element;
  });
  await input.asElement()!.setInputFiles(paths);
  const dataTransfer = await page.evaluateHandle((element) => {
    const transfer = new (globalThis as unknown as PageGlobals).DataTransfer();
    for (const dropped of element.files ?? []) transfer.items.add(dropped);
    element.remove();
    return transfer;
  }, input);
  await dispatchDrop(target, dataTransfer);
}

/** Drops files made by the page itself, with nothing on disk behind them. */
async function dropPageFiles(target: Locator, names: string[]): Promise<void> {
  const dataTransfer = await page.evaluateHandle((fileNames) => {
    const transfer = new (globalThis as unknown as PageGlobals).DataTransfer();
    for (const name of fileNames) transfer.items.add(new File(['x'], name, { type: 'image/png' }));
    return transfer;
  }, names);
  await dispatchDrop(target, dataTransfer);
}

async function dispatchDrop(target: Locator, dataTransfer: unknown): Promise<void> {
  for (const type of ['dragenter', 'dragover', 'drop']) {
    await target.dispatchEvent(type, { dataTransfer });
  }
}

/** Leaves the editor without saving, so the window can close at the end of the test. */
async function discardAndLeave(): Promise<void> {
  await button('Volver').click();
  await page
    .getByRole('dialog', { name: 'Cambios sin guardar' })
    .getByRole('button', { name: 'Descartar cambios' })
    .click();
  await expect(page.getByRole('heading', { name: 'Videojuegos (0)' })).toBeVisible();
}

/** Files stored in the profile's media folder ('files' or '.tmp'), at any depth. */
function stored(folder: 'files' | '.tmp'): string[] {
  const [profile] = readdirSync(join(dataDir, 'profiles'));
  const root = join(dataDir, 'profiles', profile!, 'media', folder);
  if (!existsSync(root)) return [];
  return (readdirSync(root, { recursive: true }) as string[]).filter((path) =>
    statSync(join(root, path)).isFile(),
  );
}

const button = (name: string) => page.getByRole('button', { name, exact: true });
const importDialog = (fileName: string) =>
  page.getByRole('dialog', { name: `Añadir «${fileName}»` });
const addInDialog = (fileName: string) =>
  importDialog(fileName).getByRole('button', { name: 'Añadir', exact: true }).click();

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

test('drops a cover, but only a single image', async () => {
  const cover = button('Añadir portada');
  await expect(page.getByText('o arrástrala aquí', { exact: true })).toBeVisible();

  await dropFiles(cover, [
    await file('caja.png', png(60, 90)),
    await file('otra.png', png(90, 60)),
  ]);
  await expect(page.getByRole('alert')).toHaveText('Suelta una sola imagen como portada.');
  await expect(importDialog('caja.png')).toHaveCount(0);
  expect(stored('.tmp')).toEqual([]);

  await dropFiles(cover, [join(filesDir, 'caja.png')]);
  await addInDialog('caja.png');
  await expect(page.getByRole('img', { name: 'Portada', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await button('Guardar').click();
  await expect(page.getByRole('heading', { name: 'Chrono Trigger', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Portada de «Chrono Trigger»' })).toBeVisible();
  expect(stored('files')).not.toEqual([]);
});

test('drops images in the gallery and refuses what is not an image', async () => {
  const gallery = page.getByRole('group', { name: 'Imágenes', exact: true });
  await expect(gallery.getByText('o arrástralas aquí', { exact: true })).toBeVisible();

  await dropFiles(button('Añadir imágenes'), [
    await file('trasera.png', png(90, 60)),
    await file('Manual.pdf', PDF_BYTES),
  ]);
  await addInDialog('trasera.png');

  await expect(gallery.getByRole('img', { name: /^Imagen \d$/ })).toHaveCount(1);
  await expect(gallery.getByRole('alert')).toHaveText(
    'No se ha podido añadir «Manual.pdf»: Ese archivo no es una imagen.',
  );
  // The gallery never makes a cover by itself.
  await expect(button('Añadir portada')).toBeVisible();
  await discardAndLeave();
});

test('drops PDF documents and refuses what is not one', async () => {
  const documents = page.getByRole('group', { name: 'Documentos', exact: true });
  await expect(documents.getByText('o arrástralos aquí', { exact: true })).toBeVisible();

  await dropFiles(button('Añadir documentos'), [
    await file('Manual de instrucciones.pdf', PDF_BYTES),
    await file('caja.png', png(60, 90)),
  ]);

  await expect(page.getByLabel('Nombre del documento 1', { exact: true })).toHaveValue(
    'Manual de instrucciones',
  );
  await expect(documents.getByRole('alert')).toHaveText(
    'No se ha podido añadir «caja.png»: Ese archivo no es un documento PDF.',
  );
  // Images dropped on the documents never reach the gallery.
  await expect(page.getByRole('img', { name: /^Imagen \d$/ })).toHaveCount(0);

  await button('Guardar').click();
  await expect(page.getByRole('heading', { name: 'Chrono Trigger', exact: true })).toBeVisible();
  expect(stored('files')).toHaveLength(1);
});

test('refuses files that are not on the disk, such as images from a web browser', async () => {
  const gallery = page.getByRole('group', { name: 'Imágenes', exact: true });

  await dropPageFiles(button('Añadir imágenes'), ['desde-la-web.png']);
  await expect(gallery.getByRole('alert')).toHaveText(
    'No se ha podido añadir «desde-la-web.png»: Ese archivo no está guardado en el equipo. ' +
      'Si viene de un navegador, guárdalo antes y suéltalo desde la carpeta.',
  );

  // A link or a piece of text dragged from a browser carries no file at all.
  await dropPageFiles(button('Añadir imágenes'), []);
  await expect(gallery.getByRole('alert')).toHaveText(
    'Solo se pueden soltar archivos guardados en el equipo. ' +
      'Si la imagen viene de un navegador, guárdala antes y suéltala desde la carpeta.',
  );
  expect(stored('.tmp')).toEqual([]);
  await discardAndLeave();
});

test('does nothing when files are dropped outside the zones', async () => {
  const title = page.getByLabel('Título', { exact: true });
  await dropFiles(title, [await file('caja.png', png(60, 90))]);

  await expect(importDialog('caja.png')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(title).toHaveValue('Chrono Trigger');
  expect(stored('.tmp')).toEqual([]);

  // Outside a zone the drop is refused before it happens: the pointer shows "not allowed".
  const refused = await title.evaluate((element) => {
    const { DragEvent, DataTransfer } = globalThis as unknown as PageGlobals;
    const event = new DragEvent('dragover', {
      bubbles: true,
      cancelable: true,
      dataTransfer: new DataTransfer(),
    });
    (element as unknown as { dispatchEvent(event: unknown): void }).dispatchEvent(event);
    return { prevented: event.defaultPrevented, effect: event.dataTransfer?.dropEffect };
  });
  expect(refused).toEqual({ prevented: true, effect: 'none' });
  await discardAndLeave();
});
