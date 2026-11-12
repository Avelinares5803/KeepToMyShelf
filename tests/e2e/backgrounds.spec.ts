import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import sharp from 'sharp';
import { launchApp } from './launch-app';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const button = (name: string) => page.getByRole('button', { name, exact: true });
const settings = () => page.getByRole('dialog', { name: 'Ajustes' });
const option = (name: string) => settings().getByRole('radio', { name, exact: true });
/** The picture of the background layer; absent when there is no background. */
const layer = () => page.locator('.app-background__image');

async function start(): Promise<void> {
  ({ app, page } = await launchApp(dataDir));
}

async function createProfile(name: string): Promise<void> {
  const firstProfile = page.getByRole('heading', { name: /primer perfil/ });
  if (await firstProfile.isVisible()) {
    await page.getByLabel('Nombre').fill(name);
    await button('Crear perfil').click();
  } else {
    await button('Nuevo perfil').click();
    await page.getByRole('dialog').getByLabel('Nombre').fill(name);
    await page.getByRole('dialog').getByRole('button', { name: 'Crear perfil' }).click();
  }
  await expect(button(`Abrir el perfil de ${name}`)).toBeVisible();
}

const openProfile = (name: string) => button(`Abrir el perfil de ${name}`).click();
const leaveProfile = () => button('Perfiles').click();
const openSettings = () => button('Ajustes').click();
const closeSettings = () => settings().getByRole('button', { name: 'Cerrar', exact: true }).click();

/** The system file dialog is replaced in the main process so it "chooses" this file. */
async function chooseFile(path: string): Promise<void> {
  await app!.evaluate(
    ({ dialog }, filePaths) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths })) as never;
    },
    [path],
  );
}

/** A PNG with smooth gradients, like a photo: its optimized copy is much smaller. */
async function photoFile(name: string): Promise<string> {
  const width = 1600;
  const height = 900;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 3;
      pixels[offset] = x % 256;
      pixels[offset + 1] = y % 256;
      pixels[offset + 2] = (x + y) % 256;
    }
  }
  const path = join(dataDir, name);
  writeFileSync(
    path,
    await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer(),
  );
  return path;
}

/** Files of the common gallery on disk. */
function storedBackgrounds(): string[] {
  const root = join(dataDir, 'backgrounds', 'files');
  if (!existsSync(root)) return [];
  return (readdirSync(root, { recursive: true }) as string[]).filter((path) =>
    statSync(join(root, path)).isFile(),
  );
}

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  await start();
  await button('Español').click();
  await createProfile('Ana');
  await createProfile('Bea');
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('chooses a background that comes with the app for one profile, and keeps it', async () => {
  // No background until one is chosen.
  await expect(layer()).toHaveCount(0);
  await openProfile('Ana');
  await openSettings();
  await expect(option('Sin fondo')).toBeChecked();

  await option('Océano').check();
  await expect(layer()).toHaveAttribute('src', /svg/);
  await closeSettings();

  // Only Ana's: Bea and the profile selection keep no background.
  await leaveProfile();
  await expect(layer()).toHaveCount(0);
  await openProfile('Bea');
  await expect(layer()).toHaveCount(0);

  // After restarting, Ana still has it.
  await app!.close();
  await start();
  await openProfile('Ana');
  await expect(layer()).toHaveCount(1);
  await openSettings();
  await expect(option('Océano')).toBeChecked();
});

test('applies a background to every profile, and to the profile selection', async () => {
  await openProfile('Ana');
  await openSettings();
  await option('Bosque').check();
  await settings().getByRole('button', { name: 'Aplicar este fondo a todos los perfiles' }).click();
  await expect(settings().getByRole('status')).toHaveText('Aplicado a todos los perfiles.');
  await closeSettings();

  await leaveProfile();
  await expect(layer()).toHaveCount(1);
  await openProfile('Bea');
  await openSettings();
  await expect(option('Bosque')).toBeChecked();
});

test('blur: the slider fades the settings while held and saves once released', async () => {
  await openProfile('Ana');
  await openSettings();
  await option('Aurora').check();
  const background = page.locator('.app-background');
  const slider = settings().getByLabel('Desenfoque', { exact: true });
  await expect(slider).toHaveValue('8');

  // Held with the mouse: the settings fade and the background shows the new blur at once.
  await slider.scrollIntoViewIfNeeded();
  const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(settings()).toHaveClass(/dialog--peeking/);
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2, { steps: 5 });
  await expect(slider).toHaveValue('40');
  await expect(background).toHaveAttribute('style', /--background-blur: 40px/);
  await page.mouse.up();
  await expect(settings()).not.toHaveClass(/dialog--peeking/);

  // With the keyboard too.
  await slider.focus();
  await page.keyboard.down('Home');
  await expect(settings()).toHaveClass(/dialog--peeking/);
  await page.keyboard.up('Home');
  await expect(settings()).not.toHaveClass(/dialog--peeking/);
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('1');
  await expect(background).toHaveAttribute('style', /--background-blur: 1px/);
  await closeSettings();

  // Saved: read again from the main process after leaving and opening the profile.
  await leaveProfile();
  await openProfile('Ana');
  await expect(background).toHaveAttribute('style', /--background-blur: 1px/);
});

test('dimming: each theme has its own, changed with its slider like the blur', async () => {
  await openProfile('Ana');
  await openSettings();
  await option('Atardecer').check();
  const background = page.locator('.app-background');
  const theme = settings().getByLabel('Tema', { exact: true });

  // Dark theme: its slider, its default value, and the veil follows it.
  await theme.selectOption('dark');
  const dark = settings().getByLabel('Atenuación (tema oscuro)', { exact: true });
  await expect(dark).toHaveValue('62');
  await expect(background).toHaveAttribute('style', /--background-dim: 62%/);
  await dark.focus();
  await page.keyboard.down('ArrowLeft');
  await expect(settings()).toHaveClass(/dialog--peeking/);
  await page.keyboard.up('ArrowLeft');
  await expect(settings()).not.toHaveClass(/dialog--peeking/);
  await expect(dark).toHaveValue('61');
  await expect(background).toHaveAttribute('style', /--background-dim: 61%/);

  // Light theme: another slider, with its own value, untouched by the dark one.
  await theme.selectOption('light');
  const light = settings().getByLabel('Atenuación (tema claro)', { exact: true });
  await expect(light).toHaveValue('40');
  await expect(background).toHaveAttribute('style', /--background-dim: 40%/);
  await light.focus();
  await page.keyboard.press('Home');
  await expect(light).toHaveValue('0');
  await closeSettings();

  // Both saved: read again after leaving and opening the profile.
  await leaveProfile();
  await openProfile('Ana');
  await expect(background).toHaveAttribute('style', /--background-dim: 0%/);
  await openSettings();
  await settings().getByLabel('Tema', { exact: true }).selectOption('dark');
  await expect(background).toHaveAttribute('style', /--background-dim: 61%/);
});

test('each profile card shows its background; a new profile starts with the global one', async () => {
  const card = (name: string) => button(`Abrir el perfil de ${name}`).locator('img');
  // Ana and Bea were created with "Sin fondo" chosen: it is their own background.
  await expect(card('Ana')).toHaveCount(0);

  await openSettings();
  await option('Océano').check();
  await closeSettings();
  await expect(card('Ana')).toHaveCount(0);

  // Creating a profile starts with the global background...
  const create = page.getByRole('dialog', { name: 'Nuevo perfil' });
  const createProfileWith = async (name: string, background?: string) => {
    await button('Nuevo perfil').click();
    await expect(create.getByRole('radio', { name: 'Océano', exact: true })).toBeChecked();
    if (background) await create.getByRole('radio', { name: background, exact: true }).check();
    await create.getByLabel('Nombre').fill(name);
    await create.getByRole('button', { name: 'Crear perfil' }).click();
    await expect(button(`Abrir el perfil de ${name}`)).toBeVisible();
  };
  await createProfileWith('Carla');
  await expect(card('Carla')).toHaveAttribute('src', /svg/);
  // ...and another one can be chosen.
  await createProfileWith('Dana', 'Bosque');
  await expect(card('Dana')).toHaveAttribute('src', /svg/);
  expect(await card('Dana').getAttribute('src')).not.toBe(await card('Carla').getAttribute('src'));

  // What was chosen is the profile's own: changing the global one changes neither.
  await openSettings();
  await option('Sin fondo').check();
  await closeSettings();
  await expect(card('Carla')).toHaveCount(1);
  await expect(card('Dana')).toHaveCount(1);
  await openProfile('Dana');
  await expect(layer()).toHaveCount(1);
  await openSettings();
  await expect(option('Bosque')).toBeChecked();
});

test('imports a background while creating a profile, which gets it', async () => {
  await chooseFile(await photoFile('montaña.png'));
  await button('Nuevo perfil').click();
  const create = page.getByRole('dialog', { name: 'Nuevo perfil' });
  await create.getByRole('button', { name: 'Importar…', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Añadir «montaña.png»' })
    .getByRole('button', { name: 'Añadir', exact: true })
    .click();

  await expect(create.getByRole('radio', { name: 'Fondo importado 1', exact: true })).toBeChecked();
  await create.getByLabel('Nombre').fill('Carla');
  await create.getByRole('button', { name: 'Crear perfil' }).click();

  // Its card shows the thumbnail, never the full picture.
  await expect(button('Abrir el perfil de Carla').locator('img')).toHaveAttribute(
    'src',
    /^ktms-media:\/\/background\/[0-9a-f]{64}\/320$/,
  );
  // The others keep no background.
  await expect(button('Abrir el perfil de Ana').locator('img')).toHaveCount(0);
});

test('imports a background to the shared gallery; deleting it sends its users to none', async () => {
  await openProfile('Ana');
  await openSettings();
  await chooseFile(await photoFile('playa.png'));
  await settings().getByRole('button', { name: 'Importar…', exact: true }).click();
  const importDialog = page.getByRole('dialog', { name: 'Añadir «playa.png»' });
  await importDialog.getByRole('button', { name: 'Añadir', exact: true }).click();

  // The new background is chosen at once.
  await expect(option('Fondo importado 1')).toBeChecked();
  await expect(layer()).toHaveAttribute('src', /^ktms-media:\/\/background\/[0-9a-f]{64}$/);
  expect(storedBackgrounds()).toHaveLength(1);
  await closeSettings();

  // Bea sees it in the gallery, without it being hers until she chooses it.
  await leaveProfile();
  await openProfile('Bea');
  await openSettings();
  await expect(option('Sin fondo')).toBeChecked();
  await option('Fondo importado 1').check();
  await expect(layer()).toHaveCount(1);

  // Deleting asks first, with the focus on "Cancelar", and says who uses it.
  await settings().getByRole('button', { name: 'Eliminar el fondo importado 1' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Eliminar el fondo importado 1?' });
  await expect(confirm).toContainText('Lo usan 2 perfiles, que volverán a «Sin fondo».');
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Eliminar', exact: true }).click();

  await expect(option('Fondo importado 1')).toHaveCount(0);
  await expect(option('Sin fondo')).toBeChecked();
  await expect(layer()).toHaveCount(0);
  expect(storedBackgrounds()).toEqual([]);
  await closeSettings();

  await leaveProfile();
  await openProfile('Ana');
  await expect(layer()).toHaveCount(0);
});
