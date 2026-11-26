import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { ExportedItem, LibraryExportFile } from '../../src/shared/exports';
import { launchApp } from './launch-app';

let dataDir: string;
/** Where the files to import are, outside the app's data folder. */
let inDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const MOMENT = '2026-11-20T10:00:00.000Z';
const button = (name: string) => page.getByRole('button', { name, exact: true });
const settings = () => page.getByRole('dialog', { name: 'Ajustes' });
const section = () => settings().getByRole('region', { name: 'Importar', exact: true });
const importButton = () =>
  section().getByRole('button', { name: 'Importar desde JSON…', exact: true });
const confirmDialog = () => page.getByRole('dialog', { name: 'Importar biblioteca' });
const itemCard = (title: string) =>
  page.locator('.item-grid').getByRole('button', { name: new RegExp(`^${title}`) });

function game(title: string, overrides: Partial<ExportedItem> = {}): ExportedItem {
  return {
    uuid: randomUUID(),
    kind: 'game',
    title,
    placeholderNumber: null,
    alternateTitles: [],
    description: null,
    notes: null,
    isFavorite: false,
    rating: null,
    status: null,
    isReplay: false,
    ownsPhysical: false,
    ownsDigital: false,
    startedOn: null,
    finishedOn: null,
    minutesPlayed: null,
    seasonsCount: null,
    episodesCount: null,
    relations: {},
    releases: [],
    createdAt: MOMENT,
    updatedAt: MOMENT,
    deletedAt: null,
    ...overrides,
  };
}

/** A JSON export of another profile, as the app writes it. */
function writeExport(name: string, items: ExportedItem[]): string {
  const file: LibraryExportFile = {
    format: 'keeptomyshelf-library',
    formatVersion: 1,
    appVersion: '1.2.0',
    exportedAt: MOMENT,
    profile: { name: 'Bea' },
    catalogs: [{ catalog: 'tag', name: 'Importada', aliases: [], scope: null }],
    items,
    collections: [
      {
        uuid: randomUUID(),
        name: 'Clásicos',
        createdAt: MOMENT,
        updatedAt: MOMENT,
        items: items.map(({ uuid }) => ({ uuid, addedAt: MOMENT })),
      },
    ],
  };
  const path = join(inDir, name);
  writeFileSync(path, JSON.stringify(file, null, 2));
  return path;
}

/** The system "Open" dialog is replaced so it "chooses" this file (or is cancelled). */
async function chooseOpenPath(path: string | null): Promise<void> {
  await app!.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = (async () =>
      filePath === null
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [filePath] }) as never;
  }, path);
}

const automaticBackups = () => {
  try {
    return readdirSync(join(dataDir, 'backups')).filter((name) => name.endsWith('.zip'));
  } catch {
    return [];
  }
};

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  inDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-importar-ñ-'));
  ({ app, page } = await launchApp(dataDir));
  await button('Español').click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await expect(page.getByRole('heading', { name: 'Videojuegos (0)', exact: true })).toBeVisible();
  await button('Ajustes').click();
});

test.afterEach(async () => {
  await app?.close();
  for (const dir of [dataDir, inDir]) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('imports a library after confirming, and the library shows it at once', async () => {
  const path = writeExport('De Bea.json', [
    game('Okami'),
    game('Ico'),
    game('Borrado', { deletedAt: MOMENT }),
  ]);
  await expect(section()).toContainText('Solo se añade lo que falta');

  // Cancelling the file dialog does nothing.
  await chooseOpenPath(null);
  await importButton().click();
  await expect(importButton()).toBeEnabled();
  await expect(confirmDialog()).toHaveCount(0);

  // Cancelling the confirmation imports nothing either; the focus starts on "Cancelar".
  await chooseOpenPath(path);
  await importButton().click();
  await expect(confirmDialog()).toContainText('¿Importar «De Bea.json» en el perfil «Ana»?');
  await expect(confirmDialog()).toContainText('Exportado del perfil');
  await expect(confirmDialog()).toContainText('Bea');
  await expect(confirmDialog()).toContainText('Elementos nuevos3');
  await expect(confirmDialog()).toContainText('Colecciones nuevas1');
  await expect(confirmDialog()).toContainText(
    '1 de los elementos nuevos estaba en la papelera y se añadirá a la papelera.',
  );
  await expect(
    confirmDialog().getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeFocused();
  await confirmDialog().getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(confirmDialog()).toHaveCount(0);
  expect(automaticBackups()).toEqual([]);

  await importButton().click();
  await confirmDialog().getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(section().getByRole('status')).toContainText('Importado: «De Bea.json».');
  expect(automaticBackups()).toEqual([expect.stringMatching(/ - Ana - before-import\.zip$/)]);

  // The library behind the settings shows the new items without leaving it.
  await settings().getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Videojuegos (2)', exact: true })).toBeVisible();
  await expect(itemCard('Ico')).toBeVisible();
  await expect(itemCard('Okami')).toBeVisible();

  // The same file again has nothing new.
  await button('Ajustes').click();
  await importButton().click();
  await expect(section().getByRole('status')).toHaveText(
    '«De Bea.json» no tiene nada nuevo para este perfil.',
  );
  await expect(confirmDialog()).toHaveCount(0);
});

test('says which item is not valid, and imports nothing', async () => {
  await chooseOpenPath(writeExport('Mal.json', [game('Okami'), game('Zelda', { rating: 0 })]));
  await importButton().click();
  await expect(section().getByRole('alert')).toHaveText(
    'No se ha importado nada: el elemento n.º 2 de «Mal.json» (Zelda) no es válido. La valoración no es válida.',
  );
  await expect(confirmDialog()).toHaveCount(0);
  expect(automaticBackups()).toEqual([]);
});

test('says when a file is not a library export', async () => {
  const path = join(inDir, 'otra cosa.json');
  writeFileSync(path, '{"hola": 1}');
  await chooseOpenPath(path);
  await importButton().click();
  await expect(section().getByRole('alert')).toHaveText(
    'Ese archivo no es una exportación JSON de KeepToMyShelf, o se ha modificado y ya no es válido. No se ha importado nada.',
  );
});
