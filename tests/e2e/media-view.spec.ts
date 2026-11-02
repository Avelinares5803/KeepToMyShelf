import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import sharp from 'sharp';
import { launchApp } from './launch-app';

let dataDir: string;
let filesDir: string;
let app: ElectronApplication | undefined;
let page: Page;
let fileCount = 0;

/** A PNG of the given size, written to the user's folder; returns its path. */
async function imageFile(width: number, height: number): Promise<string> {
  const path = join(filesDir, `imagen-${fileCount++}.png`);
  const background = { r: (fileCount * 40) % 256, g: 120, b: 200 };
  writeFileSync(
    path,
    await sharp({ create: { width, height, channels: 3, background } })
      .png()
      .toBuffer(),
  );
  return path;
}

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });

/** The system file dialog is replaced so it "chooses" the given files. */
async function chooseFiles(filePaths: string[]): Promise<void> {
  await app!.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as never;
  }, filePaths);
}

/** Adds a game with the given cover and gallery images (kept as originals, without asking). */
async function addGame(title: string, images: string[], cover?: string): Promise<void> {
  await button('Añadir').click();
  await page.getByLabel('Título', { exact: true }).fill(title);
  if (cover !== undefined) {
    await chooseFiles([cover]);
    await button('Añadir portada').click();
    await expect(page.getByRole('img', { name: 'Portada', exact: true })).toBeVisible();
  }
  if (images.length > 0) {
    await chooseFiles(images);
    await button('Añadir imágenes').click();
    await expect(page.getByRole('img', { name: /^Imagen \d+$/ })).toHaveCount(images.length);
  }
  await button('Guardar').click();
  await expect(heading(title)).toBeVisible();
}

/** Whether an <img> finished loading with real content. */
const loaded = (image: ReturnType<Page['locator']>) =>
  image.evaluate((element) => {
    const img = element as unknown as { complete: boolean; naturalWidth: number };
    return img.complete && img.naturalWidth > 0;
  });

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  filesDir = join(dataDir, 'archivos del usuario');
  mkdirSync(filesDir);
  ({ app, page } = await launchApp(dataDir));
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
  // Images are kept as originals without the import window, to keep these tests short.
  await button('Ajustes').click();
  await page.getByLabel('Al importar imágenes').selectOption({ label: 'Guardar el original' });
  await button('Cerrar').click();
  await button('Videojuegos').click();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('shows covers in the library and the trash, and only the title without one', async () => {
  await addGame('Con portada', [], await imageFile(300, 600));
  await button('Volver').click();
  // Gallery images alone give no cover.
  await addGame('Sin portada', [await imageFile(400, 300)]);
  await button('Volver').click();

  const withCover = button('Con portada');
  await expect(withCover.locator('img')).toHaveCount(1);
  await expect.poll(() => loaded(withCover.locator('img'))).toBe(true);
  await expect(button('Sin portada').locator('img')).toHaveCount(0);

  await withCover.click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.getByRole('button', { name: /^Papelera/ }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'Con portada' });
  await expect.poll(() => loaded(row.locator('img'))).toBe(true);
});

test('shows the cover and the images in the detail view, and opens them full screen', async () => {
  await addGame(
    'Chrono Trigger',
    [await imageFile(300, 600), await imageFile(800, 400), await imageFile(500, 500)],
    await imageFile(400, 600),
  );

  await expect(page.getByRole('img', { name: 'Portada de «Chrono Trigger»' })).toBeVisible();
  // The media section shows only the gallery, not the cover.
  const media = page.getByRole('region', { name: 'Multimedia' });
  await expect(media.getByRole('button', { name: /^Ver la imagen \d+ en grande$/ })).toHaveCount(3);
  await expect(media.getByRole('button', { name: /^Ver todas/ })).toHaveCount(0);

  // The cover opens alone, at full quality.
  await button('Ver la portada en grande').click();
  const cover = page.getByRole('dialog', { name: 'Imagen 1 de 1' });
  await expect(cover).toBeVisible();
  await expect(cover.getByRole('img')).toHaveAttribute('src', /^ktms-media:\/\/file\//);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // A gallery image opens the gallery, at full quality.
  await media.getByRole('button', { name: 'Ver la imagen 1 en grande' }).click();
  const viewer = (number: number) => page.getByRole('dialog', { name: `Imagen ${number} de 3` });
  await expect(viewer(1)).toBeVisible();
  await expect(viewer(1).getByRole('button', { name: 'Cerrar', exact: true })).toBeFocused();
  await expect(viewer(1).getByRole('img')).toHaveAttribute('src', /^ktms-media:\/\/file\//);
  await expect(viewer(1).getByRole('button', { name: 'Imagen anterior' })).toBeDisabled();

  await page.keyboard.press('ArrowRight');
  await expect(viewer(2)).toBeVisible();
  await expect.poll(() => loaded(viewer(2).getByRole('img'))).toBe(true);
  await viewer(2).getByRole('button', { name: 'Imagen siguiente' }).click();
  await expect(viewer(3)).toBeVisible();
  await expect(viewer(3).getByRole('button', { name: 'Imagen siguiente' })).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(viewer(2)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Any image of the strip opens the viewer at that image.
  await media.getByRole('button', { name: 'Ver la imagen 3 en grande' }).click();
  await expect(viewer(3)).toBeVisible();
  await viewer(3).getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('shows the first 10 images and all of them with "See all"', async () => {
  const images = [];
  for (let i = 0; i < 11; i++) images.push(await imageFile(200 + i * 10, 300));
  await addGame('Chrono Trigger', images);

  const media = page.getByRole('region', { name: 'Multimedia' });
  await expect(media.getByRole('button', { name: /^Ver la imagen \d+ en grande$/ })).toHaveCount(
    10,
  );
  await media.getByRole('button', { name: 'Ver todas (11)' }).click();

  const gallery = page.getByRole('dialog', { name: 'Imágenes de «Chrono Trigger» (11)' });
  await expect(gallery.getByRole('button', { name: /^Ver la imagen \d+ en grande$/ })).toHaveCount(
    11,
  );
  await gallery.getByRole('button', { name: 'Ver la imagen 11 en grande' }).click();
  await expect(page.getByRole('dialog', { name: 'Imagen 11 de 11' })).toBeVisible();

  // Closing the viewer goes back to all the images; closing again, to the detail view.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Imagen 11 de 11' })).toHaveCount(0);
  await expect(gallery).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('shows a discreet notice for an image whose file was deleted by hand', async () => {
  // The same image as cover and in the gallery: one file, missing in both places.
  const image = await imageFile(300, 600);
  await addGame('Chrono Trigger', [image], image);
  await button('Volver').click();
  await expect.poll(() => loaded(button('Chrono Trigger').locator('img'))).toBe(true);

  // The user deletes the stored files outside the app.
  const [profile] = readdirSync(join(dataDir, 'profiles'));
  rmSync(join(dataDir, 'profiles', profile!, 'media', 'files'), { recursive: true });

  await button('Chrono Trigger').click();
  await expect(page.getByText('Archivo no encontrado')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Ver la portada en grande' })).toHaveCount(0);

  // The library shows just the title. (While the app stays open, Chromium keeps showing the
  // covers it already displayed, so it is checked after starting the app again.)
  await app!.close();
  ({ app, page } = await launchApp(dataDir));
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await expect(button('Chrono Trigger')).toBeVisible();
  await expect(button('Chrono Trigger').locator('img')).toHaveCount(0);
});
