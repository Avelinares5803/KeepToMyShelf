import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './launch-app';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  ({ app, page } = await launchApp(dataDir));
  await page.getByRole('button', { name: 'Español', exact: true }).click();
  await page.getByLabel('Nombre').fill('Ana');
  await page.getByRole('button', { name: 'Crear perfil' }).click();
  await page.getByRole('button', { name: 'Abrir el perfil de Ana' }).click();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });

async function openLibrary(mode: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Ruta de navegación' })
    .getByRole('button', { name: 'Ana' })
    .click();
  await button(mode).click();
}

async function addItem(title: string): Promise<void> {
  await button('Añadir').click();
  await page.getByLabel('Título', { exact: true }).fill(title);
  await button('Guardar').click();
  await expect(heading(title)).toBeVisible();
  await button('Volver').click();
}

test('creates, shows and edits items, hiding empty fields and guarding unsaved changes', async () => {
  await button('Videojuegos').click();
  await expect(heading('Videojuegos (0)')).toBeVisible();

  // An item can be saved without filling anything in: it gets a placeholder title.
  await button('Añadir').click();
  await expect(heading('Nuevo videojuego')).toBeVisible();
  await button('Guardar').click();
  await expect(heading('Sin nombre 1')).toBeVisible();
  const details = page.locator('.details');
  await expect(details).toContainText('Añadido el');
  await expect(details).not.toContainText('Descripción');
  await expect(details).not.toContainText('Valoración');
  await button('Volver').click();
  await expect(heading('Videojuegos (1)')).toBeVisible();

  // A fully filled-in item.
  await button('Añadir').click();
  await page.getByLabel('Título', { exact: true }).fill('Chrono Trigger');
  await page.getByLabel('Favorito').check();
  await button('Añadir título alternativo').click();
  await page.getByLabel('Título alternativo 1', { exact: true }).fill('クロノ・トリガー');
  await button('4,5 estrellas').click();
  await page.getByLabel('Estado').selectOption({ label: 'Terminado' });
  await page.getByLabel('Rejugado').check();
  await page.getByLabel('Físico').check();
  const start = page.getByRole('group', { name: 'Inicio' });
  await start.getByLabel('Mes').selectOption('3');
  await start.getByLabel('Año').fill('1995');
  await page.getByRole('group', { name: 'Fin' }).getByLabel('Indeterminada').check();
  await page.getByLabel('Horas', { exact: true }).fill('45');
  await page.getByLabel('Minutos').fill('30');
  await page.getByLabel('Notas').fill('Final 13 de 13');
  await button('Guardar').click();

  await expect(heading('Chrono Trigger')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ruta de navegación' })).toContainText(
    'Chrono Trigger',
  );
  await expect(page.getByRole('img', { name: '4,5 de 5 estrellas' })).toBeVisible();
  for (const text of [
    'クロノ・トリガー',
    'Terminado · Rejugado',
    'Físico',
    'Inicio: 03/1995',
    'Fin: Indeterminada',
    '45:30',
    'Final 13 de 13',
  ]) {
    await expect(details).toContainText(text);
  }
  await expect(details).not.toContainText('Descripción');
  await expect(button('Quitar de favoritos')).toBeVisible();

  // Leaving with unsaved changes asks; "Keep editing" (focused) stays, "Discard" leaves.
  await button('Editar').click();
  await page.getByLabel('Título', { exact: true }).fill('Chrono Trigger DS');
  await button('Volver').click();
  const unsaved = page.getByRole('dialog', { name: 'Cambios sin guardar' });
  await expect(unsaved.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
  await unsaved.getByRole('button', { name: 'Seguir editando' }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Chrono Trigger DS');
  await button('Volver').click();
  await unsaved.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(heading('Chrono Trigger')).toBeVisible();

  // Saving returns to the detail view; going back afterwards does not ask.
  await button('Editar').click();
  await page.getByLabel('Notas').fill('Final 13 de 13 (otra vez)');
  await button('Guardar').click();
  await expect(details).toContainText('Final 13 de 13 (otra vez)');
  await button('Volver').click();
  await expect(heading('Videojuegos (2)')).toBeVisible();

  // "Save" in the unsaved-changes dialog saves and then leaves.
  await button('Chrono Trigger Favorito').click();
  await button('Editar').click();
  await page.getByLabel('Título', { exact: true }).fill('Chrono Trigger (SNES)');
  await page
    .getByRole('navigation', { name: 'Ruta de navegación' })
    .getByRole('button', { name: 'Videojuegos' })
    .click();
  await unsaved.getByRole('button', { name: 'Guardar' }).click();
  await expect(heading('Videojuegos (2)')).toBeVisible();
  await expect(button('Chrono Trigger (SNES) Favorito')).toBeVisible();

  // Invalid data shows a translated error and keeps the form open.
  await button('Chrono Trigger (SNES) Favorito').click();
  await button('Editar').click();
  await page.getByRole('group', { name: 'Fin' }).getByLabel('Indeterminada').uncheck();
  await page.getByRole('group', { name: 'Fin' }).getByLabel('Año').fill('1990');
  await button('Guardar').click();
  await expect(page.getByRole('alert')).toHaveText(
    'La fecha de finalización no puede ser anterior a la de comienzo.',
  );
  await button('Cancelar').click();
  await unsaved.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(heading('Chrono Trigger (SNES)')).toBeVisible();
});

test('moves items to the trash, restores them and deletes them permanently', async () => {
  await button('Videojuegos').click();
  await addItem('Zelda');
  await addItem('Metroid');
  await openLibrary('Películas');
  await addItem('Alien');

  // Delete: confirmation with the exact wording, focus on Cancel.
  await button('Alien').click();
  await button('Eliminar').click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText(
    '¿Seguro que quieres eliminar «Alien»? Se enviará a la papelera.',
  );
  await expect(confirm.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Eliminar' }).click();
  await expect(heading('Películas (0)')).toBeVisible();
  await expect(button('Papelera (1)')).toBeVisible();

  await openLibrary('Videojuegos');
  for (const title of ['Zelda', 'Metroid']) {
    await button(title).click();
    await button('Eliminar').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  }
  await expect(heading('Videojuegos (0)')).toBeVisible();

  // The trash opens on the current mode and can switch to the others or to everything.
  await button('Papelera (2)').click();
  await expect(page.getByLabel('Mostrar')).toHaveValue('game');
  await expect(page.locator('.trash-list__row')).toHaveCount(2);
  await button('Restaurar «Zelda»').click();
  await expect(page.locator('.trash-list__row')).toHaveCount(1);

  await page.getByLabel('Mostrar').selectOption('all');
  await expect(page.locator('.trash-list__row')).toHaveCount(2);
  await expect(page.locator('.trash-list')).toContainText('Película ·');

  await button('Eliminar definitivamente «Metroid»').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar definitivamente' }).click();
  await expect(page.locator('.trash-list__row')).toHaveCount(1);

  // Emptying removes what is shown, and says how many and from where.
  await button('Vaciar papelera').click();
  await expect(page.getByRole('dialog')).toContainText(
    'Se eliminará definitivamente 1 elemento de «Todo».',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Vaciar papelera' }).click();
  await expect(page.getByText('La papelera está vacía.')).toBeVisible();

  await button('Volver').click();
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expect(button('Zelda')).toBeVisible();
  await expect(button('Papelera (0)')).toBeVisible();
});

test('shows untitled items in the current language', async () => {
  await button('Series').click();
  await button('Añadir').click();
  await page.getByLabel('Temporadas').fill('3');
  await button('Guardar').click();
  await expect(heading('Sin nombre 1')).toBeVisible();
  await expect(page.locator('.details')).toContainText('Temporadas');

  await button('English').click();
  await expect(heading('Untitled 1')).toBeVisible();
  await expect(page.locator('.details')).toContainText('Seasons');
});
