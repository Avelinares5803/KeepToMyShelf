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
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import sharp from 'sharp';
import { launchApp } from './launch-app';

let dataDir: string;
let filesDir: string;
let app: ElectronApplication | undefined;
let page: Page;

/**
 * A PNG with smooth colour gradients, like a photo or a scan: its optimized WebP copy is
 * much smaller, so the import window never asks whether to make it anyway.
 */
async function photoPng(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      pixels[offset] = x % 256;
      pixels[offset + 1] = y % 256;
      pixels[offset + 2] = (x + y) % 256;
    }
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

async function imageFile(name: string, bytes: Buffer | Promise<Buffer>): Promise<string> {
  const path = join(filesDir, name);
  writeFileSync(path, await bytes);
  return path;
}

/**
 * The system file dialog cannot be driven by Playwright: the main process's dialog is
 * replaced so it "chooses" the given files.
 */
async function chooseFiles(paths: string[]): Promise<void> {
  await app!.evaluate(({ dialog }, filePaths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths })) as never;
  }, paths);
}

/** Files stored in the profile's media folder ('files' or 'originals'), at any depth. */
function stored(folder: 'files' | 'originals' | '.tmp'): string[] {
  const [profile] = readdirSync(join(dataDir, 'profiles'));
  const root = join(dataDir, 'profiles', profile!, 'media', folder);
  if (!existsSync(root)) return [];
  return (readdirSync(root, { recursive: true }) as string[]).filter((path) =>
    statSync(join(root, path)).isFile(),
  );
}

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const importDialog = (fileName: string) =>
  page.getByRole('dialog', { name: `Añadir «${fileName}»` });

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

test('adds, orders and saves gallery images with the item, without making a cover', async () => {
  await chooseFiles([
    await imageFile('portada.png', photoPng(2400, 1200)),
    await imageFile('trasera.png', photoPng(600, 900)),
  ]);
  await button('Añadir imágenes').click();

  // One window per image, showing what each choice takes.
  const first = importDialog('portada.png');
  await expect(first).toContainText('Original:');
  await expect(first).toContainText('Copia optimizada:');
  await expect(first).toContainText('2000 × 1000 px');
  await first.getByRole('radio', { name: 'Guardar el original', exact: true }).check();
  await first.getByLabel('Usar esta elección para la otra imagen').check();
  await first.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(importDialog('trasera.png')).toHaveCount(0);

  const images = page.getByRole('img', { name: /^Imagen \d$/ });
  await expect(images).toHaveCount(2);
  // The gallery never makes a cover by itself.
  await expect(button('Añadir portada')).toBeVisible();
  // Nothing is stored until the item is saved.
  expect(stored('files')).toEqual([]);

  // Proportions of the images as loaded, in order: they tell which image is where.
  const proportions = () =>
    images.evaluateAll((all) =>
      all.map((element) => {
        const { naturalWidth, naturalHeight } = element as unknown as {
          naturalWidth: number;
          naturalHeight: number;
        };
        return naturalHeight === 0 ? null : Math.round((naturalWidth / naturalHeight) * 100) / 100;
      }),
    );
  await expect.poll(proportions).toEqual([2, 0.67]);

  await button('Mover después la imagen 1').click();
  await expect.poll(proportions).toEqual([0.67, 2]);
  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();
  expect(stored('files')).toHaveLength(2);
  expect(stored('.tmp')).toEqual([]);
  await expect(page.getByRole('img', { name: 'Portada de «Chrono Trigger»' })).toHaveCount(0);

  // The saved order is kept, and there is still no cover.
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(images).toHaveCount(2);
  await expect.poll(proportions).toEqual([0.67, 2]);
  await expect(button('Añadir portada')).toBeVisible();
});

test('sets the cover apart from the gallery, also from a gallery image', async () => {
  // The cover is chosen in its own slot, above "Identificación".
  const sections = await page.locator('.form-section__title').allTextContents();
  expect(sections.slice(0, 2)).toEqual(['Portada', 'Identificación']);

  await chooseFiles([await imageFile('caja.png', photoPng(600, 900))]);
  await button('Añadir portada').click();
  await importDialog('caja.png').getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Portada', exact: true })).toBeVisible();
  await expect(button('Añadir portada')).toHaveCount(0);

  // Gallery images do not touch it.
  await chooseFiles([
    await imageFile('captura.png', photoPng(800, 400)),
    await imageFile('trasera.png', photoPng(500, 500)),
  ]);
  await button('Añadir imágenes').click();
  const first = importDialog('captura.png');
  await first.getByRole('radio', { name: 'Guardar el original', exact: true }).check();
  await first.getByLabel('Usar esta elección para la otra imagen').check();
  await first.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByRole('img', { name: /^Imagen \d$/ })).toHaveCount(2);
  await expect(page.locator('.image-list .badge--accent')).toHaveCount(0);

  // "Use as cover" copies a gallery image to the cover; it stays in the gallery, marked.
  await button('Usar la imagen 2 como portada').click();
  await expect(page.getByRole('img', { name: /^Imagen \d$/ })).toHaveCount(2);
  await expect(page.locator('.image-list .badge--accent')).toHaveText(['Portada']);
  await expect(button('Usar la imagen 2 como portada')).toHaveCount(0);

  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();
  // The cover and the gallery image are one file; the first cover was discarded.
  expect(stored('files')).toHaveLength(2);
  expect(stored('.tmp')).toEqual([]);
  await expect(page.getByRole('img', { name: 'Portada de «Chrono Trigger»' })).toBeVisible();

  // Removing the cover leaves the gallery as it was.
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await button('Quitar portada').click();
  await expect(button('Añadir portada')).toBeVisible();
  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Portada de «Chrono Trigger»' })).toHaveCount(0);
  expect(stored('files')).toHaveLength(2);
});

test('keeps nothing when the edit is cancelled, and asks before leaving with new images', async () => {
  await chooseFiles([await imageFile('portada.png', photoPng(800, 400))]);
  await button('Añadir imágenes').click();
  await importDialog('portada.png').getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Imagen 1', exact: true })).toBeVisible();
  await chooseFiles([await imageFile('caja.png', photoPng(400, 600))]);
  await button('Añadir portada').click();
  await importDialog('caja.png').getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Portada', exact: true })).toBeVisible();

  await button('Volver').click();
  const unsaved = page.getByRole('dialog', { name: 'Cambios sin guardar' });
  await expect(unsaved).toBeVisible();
  await unsaved.getByRole('button', { name: 'Descartar cambios' }).click();

  await expect(heading('Videojuegos (0)')).toBeVisible();
  await expect.poll(() => stored('.tmp')).toEqual([]);
  expect(stored('files')).toEqual([]);
});

test('remembers the choice until it is changed back in Settings', async () => {
  await chooseFiles([await imageFile('uno.png', photoPng(800, 400))]);
  await button('Añadir imágenes').click();
  const dialog = importDialog('uno.png');
  await dialog.getByRole('radio', { name: 'Usar solo la copia optimizada', exact: true }).check();
  await expect(dialog.getByText('Puedes cambiar esta elección en Ajustes.')).toHaveCount(0);
  await dialog.getByLabel('Recordar mi elección').check();
  await expect(dialog.getByText('Puedes cambiar esta elección en Ajustes.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();

  // The next image is added without asking.
  await chooseFiles([await imageFile('dos.png', photoPng(700, 400))]);
  await button('Añadir imágenes').click();
  await expect(page.getByRole('img', { name: 'Imagen 2', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Ajustes', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Ajustes' });
  const option = settings.getByLabel('Al importar imágenes');
  await expect(option).toHaveValue('optimized_only');
  await option.selectOption({ label: 'Preguntar siempre' });
  await settings.getByRole('button', { name: 'Cerrar', exact: true }).click();

  await chooseFiles([await imageFile('tres.png', photoPng(600, 400))]);
  await button('Añadir imágenes').click();
  await cancelImportAndLeave('tres.png');
});

/** Cancels the open import window (the image is not added) and leaves the editor unsaved. */
async function cancelImportAndLeave(fileName: string): Promise<void> {
  await importDialog(fileName).getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await button('Volver').click();
  await page
    .getByRole('dialog', { name: 'Cambios sin guardar' })
    .getByRole('button', { name: 'Descartar cambios' })
    .click();
  await expect(heading('Videojuegos (0)')).toBeVisible();
}

test('asks before making an optimized copy that would not be smaller', async () => {
  // Already a tiny WebP: the high-quality copy would take more space.
  const tiny = await sharp(await photoPng(300, 300))
    .webp({ quality: 1 })
    .toBuffer();
  await chooseFiles([await imageFile('comprimida.webp', Promise.resolve(tiny))]);
  await button('Añadir imágenes').click();

  const dialog = importDialog('comprimida.webp');
  await dialog.getByRole('radio', { name: 'Usar solo la copia optimizada', exact: true }).check();
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();

  const question = page.getByRole('dialog', { name: 'La imagen no se puede optimizar más' });
  await expect(question.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await question.getByRole('button', { name: 'No, usar la original', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Imagen 1', exact: true })).toBeVisible();

  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();
  expect(stored('files')).toEqual([expect.stringMatching(/\.webp$/)]);
  expect(stored('originals')).toEqual([]);
});

test('reports files that cannot be added, and adds the rest', async () => {
  await chooseFiles([
    await imageFile('falsa.png', Promise.resolve(Buffer.from('No soy una imagen'))),
    await imageFile('buena.png', photoPng(400, 400)),
  ]);
  await button('Añadir imágenes').click();

  await expect(page.getByRole('alert')).toContainText(
    'No se ha podido añadir «falsa.png»: Ese tipo de archivo no se admite.',
  );
  await cancelImportAndLeave('buena.png');
  await expect.poll(() => stored('.tmp')).toEqual([]);
});

test('replaces an optimized image by its original', async () => {
  await chooseFiles([await imageFile('portada.png', photoPng(2400, 1200))]);
  await button('Añadir imágenes').click();
  const dialog = importDialog('portada.png');
  await dialog
    .getByRole('radio', { name: 'Usar una copia optimizada y guardar el original aparte' })
    .check();
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();
  expect(stored('files')).toEqual([expect.stringMatching(/\.webp$/)]);
  expect(stored('originals')).toEqual([expect.stringMatching(/\.png$/)]);

  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await button('Usar el original de la imagen 1').click();
  await expect(page.getByText('Se usará el original')).toBeVisible();
  await button('Guardar').click();
  await expect(heading('Chrono Trigger')).toBeVisible();

  expect(stored('files')).toEqual([expect.stringMatching(/\.png$/)]);
  expect(stored('originals')).toEqual([]);
});
