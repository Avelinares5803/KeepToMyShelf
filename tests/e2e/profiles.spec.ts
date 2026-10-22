import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { launchApp } from './launch-app';

test('profiles can be created, opened, renamed and deleted, and persist across restarts', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  let app: ElectronApplication | undefined;

  try {
    let page;
    ({ app, page } = await launchApp(dataDir));

    // Start in Spanish regardless of the machine's language.
    await page.getByRole('button', { name: 'Español', exact: true }).click();

    // First run: create the first profile.
    await expect(
      page.getByRole('heading', { name: 'Crea tu primer perfil para empezar' }),
    ).toBeVisible();
    await page.getByLabel('Nombre').fill('Adrián');
    await page.getByRole('button', { name: 'Crear perfil' }).click();

    // Open it: its library database is created with the migrations applied.
    await page.getByRole('button', { name: 'Abrir el perfil de Adrián' }).click();
    await expect(page.getByRole('heading', { name: 'Hola, Adrián' })).toBeVisible();
    const profileFolders = readdirSync(join(dataDir, 'profiles'));
    expect(profileFolders).toHaveLength(1);
    expect(existsSync(join(dataDir, 'profiles', profileFolders[0] as string, 'library.db'))).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Cambiar de perfil' }).click();

    // A duplicate name (ignoring case and accents) gets a suffix and the user is told.
    await page.getByRole('button', { name: 'Nuevo perfil' }).click();
    const createDialog = page.getByRole('dialog');
    await createDialog.getByLabel('Nombre').fill('adrian');
    await createDialog.getByLabel('Idioma').selectOption('en');
    await createDialog.getByRole('button', { name: 'Crear perfil' }).click();
    await expect(page.getByRole('status')).toContainText('«adrian (1)»');

    // The profile's own language applies inside it; the global one applies outside.
    await page.getByRole('button', { name: 'Abrir el perfil de adrian (1)' }).click();
    await expect(page.getByRole('heading', { name: 'Hi, adrian (1)' })).toBeVisible();
    await page.getByRole('button', { name: 'Switch profile' }).click();
    await expect(
      page.getByRole('heading', { name: '¿Quién va a usar KeepToMyShelf?' }),
    ).toBeVisible();

    // Rename.
    await page.getByRole('button', { name: 'Renombrar el perfil de adrian (1)' }).click();
    const renameDialog = page.getByRole('dialog');
    await renameDialog.getByLabel('Nombre').fill('Bea');
    await renameDialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('button', { name: 'Abrir el perfil de Bea' })).toBeVisible();

    // Delete: the dialog names the profile and starts on "Cancel", so Enter never deletes.
    const openBea = page.getByRole('button', { name: 'Abrir el perfil de Bea' });
    const deleteBea = page.getByRole('button', { name: 'Eliminar el perfil de Bea' });
    await deleteBea.click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog.getByText('Bea', { exact: true })).toBeVisible();
    await expect(deleteDialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(deleteDialog).toBeHidden();
    await expect(openBea).toBeVisible();

    // Escape cancels too.
    await deleteBea.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(openBea).toBeVisible();

    // Only the explicit button deletes the profile.
    await deleteBea.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar perfil' }).click();
    await expect(openBea).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir el perfil de Adrián' })).toBeVisible();

    // Switch the global language, restart: profiles and language are kept.
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByRole('heading', { name: "Who's using KeepToMyShelf?" })).toBeVisible();
    await app.close();

    ({ app, page } = await launchApp(dataDir));
    await expect(page.getByRole('heading', { name: "Who's using KeepToMyShelf?" })).toBeVisible();
    await expect(page.getByRole('button', { name: "Open Adrián's profile" })).toBeVisible();
    await expect(page.getByRole('button', { name: "Open Bea's profile" })).toHaveCount(0);
  } finally {
    await app?.close();
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
