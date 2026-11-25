import { mkdirSync, mkdtempSync, readdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const button = (name: string) => page.getByRole('button', { name, exact: true });
const settings = () => page.getByRole('dialog', { name: 'Ajustes', exact: true });
const schedule = () => settings().getByLabel('Copias programadas', { exact: true });
const closeSettings = () => settings().getByRole('button', { name: 'Cerrar', exact: true }).click();

const profileId = () =>
  readdirSync(join(dataDir, 'profiles')).find((name) => !name.startsWith('.'))!;
const scheduledDir = () => join(dataDir, 'backups', 'scheduled', profileId());
const saved = () => (existsSync(scheduledDir()) ? readdirSync(scheduledDir()) : []);

/**
 * A scheduled backup from long ago, so one is due when the profile is opened. It is not a real
 * one, so it never counts as holding the same.
 */
function leaveOldBackup(): string {
  const name = '2020-01-01 10-00-00 - Ana - scheduled.zip';
  mkdirSync(scheduledDir(), { recursive: true });
  writeFileSync(join(scheduledDir(), name), 'x');
  return name;
}

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  ({ app, page } = await launchApp(dataDir));
  await button('Español').click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await expect(button('Abrir el perfil de Ana')).toBeVisible();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('saves a due backup in the background when the profile is opened', async () => {
  const old = leaveOldBackup();

  await button('Abrir el perfil de Ana').click();

  await expect
    .poll(() => saved().filter((name) => name !== old))
    .toEqual([expect.stringMatching(/ - Ana - scheduled\.zip$/)]);
  // It ran unseen.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await button('Ajustes').click();
  await expect(
    settings().getByText(/^Última copia programada: \d{2}\/\d{2}\/20\d{2}, /),
  ).toBeVisible();
  await expect(settings().getByText('01/01/2020', { exact: false })).toHaveCount(0);
  await closeSettings();

  // Deleting the profile, as the confirmation says, deletes them too.
  const dir = scheduledDir();
  await button('Perfiles').click();
  await button('Eliminar el perfil de Ana').click();
  const confirm = page.getByRole('dialog', { name: 'Eliminar perfil', exact: true });
  await expect(confirm).toContainText('Sus copias programadas también se eliminarán.');
  await confirm.getByRole('button', { name: 'Eliminar perfil', exact: true }).click();
  await expect(page.getByRole('heading', { name: /primer perfil/ })).toBeVisible();
  expect(existsSync(dir)).toBe(false);
});

test('each profile chooses how often, every week to begin with', async () => {
  await button('Abrir el perfil de Ana').click();
  await button('Ajustes').click();
  await expect(schedule()).toHaveValue('weekly');
  await expect(
    settings().getByText('Este perfil aún no tiene copias programadas.', { exact: true }),
  ).toBeVisible();
  await schedule().selectOption('Nunca');
  await closeSettings();

  // It is kept after closing the app, and nothing is saved although the last one is old.
  await app!.close();
  const old = leaveOldBackup();
  ({ app, page } = await launchApp(dataDir));
  await button('Abrir el perfil de Ana').click();
  await button('Ajustes').click();
  await expect(schedule()).toHaveValue('never');
  await page.waitForTimeout(2500);
  expect(saved()).toEqual([old]);

  // The folder of this profile's scheduled backups opens in the file explorer.
  await app.evaluate(({ shell }) => {
    shell.openPath = async (path: string) => {
      (globalThis as { openedFolder?: string }).openedFolder = path;
      return '';
    };
  });
  await settings()
    .getByRole('button', { name: 'Abrir la carpeta de copias programadas', exact: true })
    .click();
  await expect
    .poll(() => app!.evaluate(() => (globalThis as { openedFolder?: string }).openedFolder))
    .toBe(scheduledDir());

  // Applied to every profile, it is also what a new one starts with.
  await settings()
    .getByRole('button', {
      name: 'Aplicar esta frecuencia de las copias programadas a todos los perfiles',
      exact: true,
    })
    .click();
  await expect(settings().getByRole('status')).toHaveText('Aplicado a todos los perfiles.');
});

test('says that a backup failed, without getting in the way', async () => {
  // A profile old enough for its first backup, and a file where its folder would go.
  await app!.close();
  const appDb = new Database(join(dataDir, 'app.db'));
  appDb.prepare("UPDATE profile SET created_at = '2020-01-01T10:00:00.000Z'").run();
  appDb.close();
  const blocker = join(dataDir, 'backups', 'scheduled');
  mkdirSync(join(dataDir, 'backups'), { recursive: true });
  writeFileSync(blocker, 'x');
  ({ app, page } = await launchApp(dataDir));
  await button('Abrir el perfil de Ana').click();

  const alert = page.getByRole('alert');
  await expect(alert).toContainText(
    'No se ha podido guardar la copia programada del perfil «Ana».',
  );
  // The app can be used meanwhile, and the notice is dismissed.
  await button('Videojuegos').click();
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Cerrar aviso', exact: true }).click();
  await expect(alert).toHaveCount(0);
});
