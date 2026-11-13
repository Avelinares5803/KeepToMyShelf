import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { BackupManifest } from '../../src/shared/backups';
import { readZip } from '../support/zip';
import { launchApp } from './launch-app';

let dataDir: string;
/** Where the user "saves" backups: outside the app's data folder, like Documents. */
let outDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const button = (name: string) => page.getByRole('button', { name, exact: true });
const settings = () => page.getByRole('dialog', { name: 'Ajustes' });

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

/**
 * The system "Save as" dialog cannot be driven: it is replaced in the main process so it
 * "chooses" this path (or is cancelled, with null). It records the name it suggested.
 */
async function chooseSavePath(path: string | null): Promise<void> {
  await app!.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const options = args.at(-1) as { defaultPath?: string };
      (globalThis as { suggestedPath?: string }).suggestedPath = options.defaultPath;
      return filePath === null ? { canceled: true, filePath: '' } : { canceled: false, filePath };
    }) as never;
  }, path);
}

/** The file explorer cannot be checked either: shell.openPath records what it is asked. */
async function recordOpenedFolders(): Promise<void> {
  await app!.evaluate(({ shell }) => {
    const opened: string[] = [];
    (globalThis as { openedFolders?: string[] }).openedFolders = opened;
    shell.openPath = async (path: string) => {
      opened.push(path);
      return '';
    };
  });
}

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  outDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-copias-ñ-'));
  ({ app, page } = await launchApp(dataDir));
  await button('Español').click();
  await createProfile('Ana');
});

test.afterEach(async () => {
  await app?.close();
  for (const dir of [dataDir, outDir]) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('saves a backup of the open profile where the user chooses', async () => {
  // Outside a profile there is nothing to back up.
  await button('Ajustes').click();
  await expect(settings().getByRole('heading', { name: 'Copias de seguridad' })).toHaveCount(0);
  await settings().getByRole('button', { name: 'Cerrar', exact: true }).click();

  await button('Abrir el perfil de Ana').click();
  await button('Ajustes').click();
  const section = settings().getByRole('region', { name: 'Copias de seguridad' });

  // Cancelling the dialog saves nothing and says nothing.
  await chooseSavePath(null);
  await section.getByRole('button', { name: 'Crear copia de seguridad…' }).click();
  await expect(section.getByRole('button', { name: 'Crear copia de seguridad…' })).toBeEnabled();
  await expect(section.getByRole('status')).toHaveCount(0);
  expect(readdirSync(outDir)).toEqual([]);

  const destination = join(outDir, 'Copia de Ana.zip');
  await chooseSavePath(destination);
  await section.getByRole('button', { name: 'Crear copia de seguridad…' }).click();
  await expect(section.getByRole('status')).toHaveText('Copia guardada: «Copia de Ana.zip».');

  // The dialog suggested a name in the Documents folder, after the profile and the time.
  const suggested = await app!.evaluate(
    () => (globalThis as { suggestedPath?: string }).suggestedPath,
  );
  expect(suggested).toMatch(/[\\/]KeepToMyShelf - Ana - \d{4}-\d{2}-\d{2} \d{2}-\d{2}\.zip$/);

  const entries = await readZip(destination);
  expect([...entries.keys()].sort()).toEqual(['library.db', 'manifest.json']);
  const manifest = JSON.parse(
    entries.get('manifest.json')!.bytes.toString('utf8'),
  ) as BackupManifest;
  expect(manifest).toMatchObject({ reason: 'manual', profile: { name: 'Ana' } });
  // Nothing is left next to it.
  expect(readdirSync(outDir)).toEqual(['Copia de Ana.zip']);
});

test('opens the folder of automatic backups', async () => {
  await recordOpenedFolders();
  await button('Abrir el perfil de Ana').click();
  await button('Ajustes').click();

  await settings().getByRole('button', { name: 'Abrir la carpeta de copias automáticas' }).click();

  await expect
    .poll(() => app!.evaluate(() => (globalThis as { openedFolders?: string[] }).openedFolders))
    .toEqual([join(dataDir, 'backups')]);
});

test('saves a backup of a profile before deleting it', async () => {
  await createProfile('Bea');

  await button('Eliminar el perfil de Bea').click();
  const confirm = page.getByRole('dialog', { name: 'Eliminar perfil' });
  await expect(confirm).toContainText(
    'Antes se guardará una copia de seguridad en la carpeta de copias automáticas.',
  );
  await confirm.getByRole('button', { name: 'Eliminar perfil' }).click();

  await expect(button('Abrir el perfil de Bea')).toHaveCount(0);
  const backupsDir = join(dataDir, 'backups');
  expect(existsSync(backupsDir)).toBe(true);
  const saved = readdirSync(backupsDir);
  expect(saved).toEqual([expect.stringMatching(/ - Bea - before-delete\.zip$/)]);
  const manifest = JSON.parse(
    (await readZip(join(backupsDir, saved[0]!))).get('manifest.json')!.bytes.toString('utf8'),
  ) as BackupManifest;
  expect(manifest).toMatchObject({ reason: 'before-delete', profile: { name: 'Bea' } });
});
