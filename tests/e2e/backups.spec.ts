import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { BackupManifest } from '../../src/shared/backups';
import { readZip, writeTestZip } from '../support/zip';
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

/** The system "Open" dialog is replaced too, so it "chooses" this file (or is cancelled). */
async function chooseOpenPath(path: string | null): Promise<void> {
  await app!.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = (async () =>
      filePath === null
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [filePath] }) as never;
  }, path);
}

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const itemCard = (title: string) =>
  page.locator('.item-grid').getByRole('button', { name: new RegExp(`^${title}`) });

/** Adds a game from its library, and comes back to the library. */
async function addGame(title: string): Promise<void> {
  await button('Añadir').click();
  await page.getByLabel('Título', { exact: true }).fill(title);
  await button('Guardar').click();
  await expect(heading(title)).toBeVisible();
  await button('Volver').click();
}

/** Saves a backup of the open profile, from the settings dialog, at `destination`. */
async function saveBackup(destination: string): Promise<void> {
  await button('Ajustes').click();
  await chooseSavePath(destination);
  const section = settings().getByRole('region', { name: 'Copias de seguridad' });
  await section.getByRole('button', { name: 'Crear copia de seguridad…' }).click();
  await expect(section.getByRole('status')).toContainText('Copia guardada');
  await settings().getByRole('button', { name: 'Cerrar', exact: true }).click();
}

/** The profiles' folders, without the ones a restore is using. */
function profileFolders(): string[] {
  return readdirSync(join(dataDir, 'profiles')).filter((name) => !name.startsWith('.'));
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

test('restores a backup as a new profile from the profile selection', async () => {
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await addGame('Zelda');
  const backup = join(outDir, 'Copia de Ana.zip');
  await saveBackup(backup);
  await button('Perfiles').click();

  // Cancelling the dialog restores nothing and says nothing.
  await chooseOpenPath(null);
  await button('Restaurar copia de seguridad…').click();
  await expect(button('Restaurar copia de seguridad…')).toBeEnabled();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(profileFolders()).toHaveLength(1);

  // The name is taken, so it gets "(1)".
  await chooseOpenPath(backup);
  await button('Restaurar copia de seguridad…').click();
  await expect(page.getByRole('status')).toHaveText(
    'Ya existía un perfil con ese nombre, así que se ha restaurado como «Ana (1)».',
  );
  await button('Abrir el perfil de Ana (1)').click();
  await button('Videojuegos').click();
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expect(itemCard('Zelda')).toBeVisible();
});

test('restores a backup before any profile exists', async () => {
  // Deleting the only profile saves its automatic backup, and leaves the first profile screen.
  await createProfile('Bea');
  await button('Abrir el perfil de Bea').click();
  await button('Videojuegos').click();
  await addGame('Metroid');
  await button('Perfiles').click();
  for (const name of ['Ana', 'Bea']) {
    await button(`Eliminar el perfil de ${name}`).click();
    await page
      .getByRole('dialog', { name: 'Eliminar perfil' })
      .getByRole('button', { name: 'Eliminar perfil' })
      .click();
    await expect(button(`Abrir el perfil de ${name}`)).toHaveCount(0);
  }
  await expect(page.getByRole('heading', { name: /primer perfil/ })).toBeVisible();
  const backupsDir = join(dataDir, 'backups');
  const beaBackup = readdirSync(backupsDir).find((name) => name.includes(' - Bea - '));

  await chooseOpenPath(join(backupsDir, beaBackup!));
  await button('Restaurar copia de seguridad…').click();
  await expect(page.getByRole('status')).toHaveText('Perfil «Bea» restaurado.');
  await button('Abrir el perfil de Bea').click();
  await button('Videojuegos').click();
  await expect(itemCard('Metroid')).toBeVisible();
});

test('tells why a file cannot be restored, and changes nothing', async () => {
  const notABackup = join(outDir, 'fotos.zip');
  await writeTestZip(notABackup, [{ name: 'foto.txt', bytes: Buffer.from('hola') }]);

  await chooseOpenPath(notABackup);
  await button('Restaurar copia de seguridad…').click();
  await expect(page.getByRole('alert')).toHaveText(
    'Ese archivo no es una copia de seguridad de KeepToMyShelf, o se ha modificado. No se ha restaurado nada.',
  );
  expect(profileFolders()).toHaveLength(1);

  // Over the open profile, too: the error shows in the settings, before anything is asked.
  await button('Abrir el perfil de Ana').click();
  await button('Ajustes').click();
  await settings().getByRole('button', { name: 'Restaurar copia sobre este perfil…' }).click();
  await expect(settings().getByRole('alert')).toContainText('no es una copia de seguridad');
  await expect(page.getByRole('dialog', { name: 'Restaurar copia sobre este perfil' })).toHaveCount(
    0,
  );
});

test('restores a backup over the open profile, after saving its current state', async () => {
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await addGame('Zelda');
  const backup = join(outDir, 'Copia de Ana.zip');
  await saveBackup(backup);
  await addGame('Mario');
  await expect(heading('Videojuegos (2)')).toBeVisible();

  await button('Ajustes').click();
  const section = settings().getByRole('region', { name: 'Copias de seguridad' });
  await chooseOpenPath(backup);
  await section.getByRole('button', { name: 'Restaurar copia sobre este perfil…' }).click();

  // The confirmation tells what the backup holds; focus starts on "Cancel".
  const confirm = page.getByRole('dialog', { name: 'Restaurar copia sobre este perfil' });
  await expect(confirm).toContainText(
    '¿Seguro que quieres restaurar esta copia sobre el perfil «Ana»?',
  );
  await expect(confirm).toContainText('Copia de Ana.zip');
  await expect(confirm).toContainText(/Fecha de la copia\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/);
  await expect(confirm.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(confirm).toHaveCount(0);
  const backupsDir = join(dataDir, 'backups');
  const beforeRestore = () =>
    existsSync(backupsDir)
      ? readdirSync(backupsDir).filter((name) => name.endsWith('before-restore.zip'))
      : [];
  expect(beforeRestore()).toEqual([]);

  await section.getByRole('button', { name: 'Restaurar copia sobre este perfil…' }).click();
  await confirm.getByRole('button', { name: 'Restaurar copia', exact: true }).click();
  await expect(section.getByRole('status')).toHaveText('Copia restaurada: «Copia de Ana.zip».');

  // The current state was saved first.
  expect(beforeRestore()).toEqual([expect.stringMatching(/ - Ana - before-restore\.zip$/)]);

  // The profile starts again from its first screen, with the backup's library and the new
  // session (opening a library would fail with the old one).
  await settings().getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(heading('¿Qué quieres consultar?')).toBeVisible();
  await button('Videojuegos').click();
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expect(itemCard('Zelda')).toBeVisible();
  await expect(itemCard('Mario')).toHaveCount(0);
});

test('asks about unsaved changes before restoring over the profile', async () => {
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await button('Añadir').click();
  await page.getByLabel('Título', { exact: true }).fill('Sin guardar');

  // The file dialog counts how many times it opens, and is cancelled.
  await app!.evaluate(({ dialog }) => {
    const state = globalThis as { openDialogs?: number };
    state.openDialogs = 0;
    dialog.showOpenDialog = (async () => {
      state.openDialogs! += 1;
      return { canceled: true, filePaths: [] };
    }) as never;
  });
  const openDialogs = () =>
    app!.evaluate(() => (globalThis as { openDialogs?: number }).openDialogs);

  await button('Ajustes').click();
  const restore = settings().getByRole('button', { name: 'Restaurar copia sobre este perfil…' });
  const unsaved = page.getByRole('dialog', { name: 'Cambios sin guardar' });

  // "Keep editing" chooses no backup.
  await restore.click();
  await expect(unsaved).toBeVisible();
  await unsaved.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(unsaved).toHaveCount(0);
  expect(await openDialogs()).toBe(0);

  // "Discard" goes on to choose one.
  await restore.click();
  await unsaved.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect.poll(openDialogs).toBe(1);

  // No backup was chosen, so the editor keeps its draft; leaving it still asks.
  await settings().getByRole('button', { name: 'Cerrar', exact: true }).click();
  await button('Volver').click();
  await unsaved.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(heading('Videojuegos (0)')).toBeVisible();
});

test('opens the profile again, unchanged, if the restore fails after closing it', async () => {
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await addGame('Zelda');
  const backup = join(outDir, 'Copia de Ana.zip');
  await saveBackup(backup);
  await addGame('Mario');

  // A process working inside the profile's folder: Windows does not let the folder be renamed,
  // so the restore fails after the session was closed (and the profile opened again).
  const [profileId] = profileFolders();
  const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: join(dataDir, 'profiles', profileId!),
    stdio: 'ignore',
  });
  try {
    await button('Ajustes').click();
    const section = settings().getByRole('region', { name: 'Copias de seguridad' });
    await chooseOpenPath(backup);
    await section.getByRole('button', { name: 'Restaurar copia sobre este perfil…' }).click();
    await page
      .getByRole('dialog', { name: 'Restaurar copia sobre este perfil' })
      .getByRole('button', { name: 'Restaurar copia', exact: true })
      .click();
    await expect(section.getByRole('alert')).toHaveText(
      'No se ha podido restaurar la copia de seguridad. Comprueba que hay espacio libre. Tus datos no han cambiado.',
    );
  } finally {
    holder.kill();
  }

  // The same screen, with its data, and a session that works.
  await settings().getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(heading('Videojuegos (2)')).toBeVisible();
  await itemCard('Mario').click();
  await expect(heading('Mario')).toBeVisible();
});
