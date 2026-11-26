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

const csvButton = () => section().getByRole('button', { name: 'Importar desde CSV…', exact: true });
const duplicatesDialog = () => page.getByRole('dialog', { name: 'Elementos que ya existen' });

/** A CSV file as a spreadsheet would save it, with ";". */
function writeCsv(name: string, lines: string[]): string {
  const path = join(inDir, name);
  writeFileSync(path, `\u{FEFF}${lines.join('\r\n')}\r\n`);
  return path;
}

test('imports a CSV file, leaving out the rows chosen among those that exist', async () => {
  await chooseOpenPath(writeExport('De Bea.json', [game('Okami'), game('Hipó')]));
  await importButton().click();
  await confirmDialog().getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(section().getByRole('status')).toContainText('Importado');

  await chooseOpenPath(
    writeCsv('juegos.csv', [
      'Título;Valoración;Colecciones',
      'OKAMI;4,5;Clásicos',
      'Hipo;;',
      'Ico;5;clasicos',
    ]),
  );
  await csvButton().click();
  await expect(duplicatesDialog()).toContainText('2 filas de «juegos.csv» tienen el título');
  const okami = duplicatesDialog().getByRole('checkbox', {
    name: 'Fila 2: OKAMI (ya existe «Okami»)',
    exact: true,
  });
  const hipo = duplicatesDialog().getByRole('checkbox', {
    name: 'Fila 3: Hipo (ya existe «Hipó»)',
    exact: true,
  });
  await expect(okami).toBeChecked();
  await expect(hipo).toBeChecked();
  await expect(
    duplicatesDialog().getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeFocused();

  // "Hipo" is another item than "Hipó": it is imported.
  await hipo.uncheck();
  await expect(duplicatesDialog()).toContainText(
    'Filas que se omitirán: 1. Filas que se importarán: 2.',
  );
  await duplicatesDialog().getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(confirmDialog()).toContainText('¿Importar «juegos.csv» en el perfil «Ana»?');
  await expect(confirmDialog()).toContainText('Elementos del CSVVideojuegos');
  await expect(confirmDialog()).toContainText('Elementos nuevos2');
  await expect(confirmDialog()).toContainText('Elementos que ya existen (se omiten)1');
  await expect(confirmDialog()).toContainText('Colecciones que reciben elementos1');
  await confirmDialog().getByRole('button', { name: 'Importar', exact: true }).click();
  await expect(section().getByRole('status')).toContainText('Importado: «juegos.csv».');
  expect(automaticBackups()).toHaveLength(2);

  await settings().getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Videojuegos (4)', exact: true })).toBeVisible();
  await expect(itemCard('Hipo')).toBeVisible();
  await expect(itemCard('Ico')).toBeVisible();
});

test('lists the errors of a CSV file by row and column, and imports nothing', async () => {
  await chooseOpenPath(
    writeCsv('mal.csv', ['Título;Valoración;Fin', 'Okami;4,5;2021', 'Ico;7;ayer']),
  );
  await csvButton().click();
  const alert = section().getByRole('alert');
  await expect(alert).toContainText(
    'No se ha importado nada: «mal.csv» tiene 2 errores. Corrígelos y vuelve a intentarlo.',
  );
  await expect(alert.getByRole('listitem')).toHaveText([
    'Fila 3, «Valoración»: La valoración va de 0,5 a 5 estrellas, en medias estrellas.',
    'Fila 3, «Fin»: Escribe la fecha como AAAA, AAAA-MM o AAAA-MM-DD, o «Indeterminada».',
  ]);

  // A file of games chosen as movies says so.
  await section().getByLabel('Elementos del CSV').selectOption('Películas');
  await chooseOpenPath(writeCsv('juegos.csv', ['Título;Horas jugadas', 'Okami;45:30']));
  await csvButton().click();
  await expect(section().getByRole('alert').getByRole('listitem')).toHaveText([
    'Cabeceras: Son las de un CSV de videojuegos. Elige «Videojuegos» y vuelve a intentarlo.',
  ]);
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
