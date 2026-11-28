import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { launchApp } from './launch-app';
import {
  seedCollections,
  seedItems,
  type SeedCollection,
  type SeedEntry,
  type SeedItem,
} from './seed-items';

let dataDir: string;
let app: ElectronApplication | undefined;
let page: Page;

const heading = (name: string) => page.getByRole('heading', { name, exact: true });
const button = (name: string) => page.getByRole('button', { name, exact: true });
const titles = () => page.locator('.item-card__title');
const builder = () => page.getByRole('region', { name: 'Filtros avanzados', exact: true });
const mode = (name: 'Filtros simples' | 'Filtros avanzados', count?: number) =>
  button(count === undefined ? name : `${name} (${count})`);

const genre = (name: string): SeedEntry => ({ role: 'genre', catalog: 'game_genre', name });
const tag = (name: string): SeedEntry => ({ role: 'tag', catalog: 'tag', name });

const expectTitles = (expected: string[]) => expect(titles()).toHaveText(expected);

/** Opens the games library with the given items and collections, and its advanced filters. */
async function openBuilder(
  items: readonly SeedItem[],
  collections: readonly SeedCollection[] = [],
): Promise<void> {
  seedItems(dataDir, items);
  seedCollections(dataDir, collections);
  await button('Videojuegos').click();
  await expect(heading(`Videojuegos (${items.length})`)).toBeVisible();
  await button('Filtros').click();
  await mode('Filtros avanzados').click();
  await expect(builder()).toBeVisible();
}

/** Adds a row to `within` (the whole builder by default) and fills it in. */
async function addRow(
  field: string,
  value: string | null,
  operator?: string,
  within: Locator = builder(),
): Promise<void> {
  await within.getByRole('button', { name: 'Añadir condición', exact: true }).last().click();
  const row = within.locator('.advanced-filters__condition').last();
  await row.getByLabel('Campo', { exact: true }).selectOption({ label: field });
  if (operator !== undefined) {
    await row.getByLabel('Operador', { exact: true }).selectOption({ label: operator });
  }
  if (value !== null) {
    const control = row.getByLabel('Valor', { exact: true });
    // Catalog values and collections are chosen in a list that can be searched.
    if (await control.evaluate((element) => element.tagName === 'INPUT')) {
      await control.click();
      await page.getByRole('option', { name: value, exact: true }).click();
      await expect(control).toHaveValue(value);
    } else {
      await control.selectOption({ label: value });
    }
  }
}

/** The searchable value of the last row, and its list. */
const lastValue = () =>
  builder()
    .locator('.advanced-filters__condition')
    .last()
    .getByRole('combobox', { name: 'Valor', exact: true });
const valueList = () => page.getByRole('listbox', { name: 'Valor', exact: true });
const optionNames = () => valueList().getByRole('option');

test.beforeEach(async () => {
  dataDir = mkdtempSync(join(tmpdir(), 'ktms-e2e-ñáü-'));
  ({ app, page } = await launchApp(dataDir));
  await button('Español').click();
  await page.getByLabel('Nombre').fill('Ana');
  await button('Crear perfil').click();
  await button('Abrir el perfil de Ana').click();
  await expect(button('Videojuegos')).toBeVisible();
});

test.afterEach(async () => {
  await app?.close();
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

test('finds items with both values, which the simple filters cannot do', async () => {
  await openBuilder([
    { title: 'Solo RPG', entries: [genre('RPG uno')] },
    { title: 'Solo acción', entries: [genre('Acción uno')] },
    { title: 'Las dos', entries: [genre('RPG uno'), genre('Acción uno')] },
  ]);
  await addRow('Géneros', 'RPG uno');
  await addRow('Géneros', 'Acción uno');
  await expectTitles(['Las dos']);
  await expect(heading('Videojuegos (1)')).toBeVisible();
  await expect(button('Filtros (2)')).toBeVisible();

  // The same rows, combined the other way.
  await builder()
    .getByLabel('Cumple', { exact: true })
    .selectOption({ label: 'alguna de estas condiciones' });
  await expectTitles(['Las dos', 'Solo acción', 'Solo RPG']);
});

test('opens the whole list of values, and narrows it down by name or other name', async () => {
  await openBuilder([
    { title: 'Rol', entries: [{ ...genre('Rol'), aliases: ['RPG'] }] },
    { title: 'Acción', entries: [genre('Acción')] },
    { title: 'Aventura', entries: [genre('Aventura de acción')] },
  ]);
  await addRow('Géneros', null);
  const value = lastValue();
  await expect(value).toHaveAttribute('placeholder', 'Elige un valor');
  await value.click();
  await expect(value).toHaveAttribute('aria-expanded', 'true');
  await expect(optionNames()).toHaveText(['Acción', 'Aventura de acción', 'Rol']);

  // Without accents or capitals, the names that start with the text first.
  await value.fill('ACCION');
  await expect(optionNames()).toHaveText(['Acción', 'Aventura de acción']);
  await value.fill('rpg');
  await expect(optionNames()).toHaveText(['Rol (RPG)']);
  await value.fill('estrategia');
  await expect(valueList()).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveText('Sin resultados');

  await value.fill('rpg');
  await page.getByRole('option', { name: 'Rol (RPG)', exact: true }).click();
  await expect(value).toHaveValue('Rol');
  await expect(valueList()).toHaveCount(0);
  await expectTitles(['Rol']);
});

test('chooses a value with the keyboard alone, and Esc closes the list', async () => {
  await openBuilder([
    { title: 'Con Acción', entries: [genre('Acción')] },
    { title: 'Con Rol', entries: [genre('Rol')] },
  ]);
  await addRow('Géneros', null);
  const value = lastValue();
  await value.focus();
  await expect(optionNames()).toHaveCount(2);

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { name: 'Rol', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Enter');
  await expect(value).toHaveValue('Rol');
  await expectTitles(['Con Rol']);

  // Esc closes the list and leaves the chosen value as it was.
  await page.keyboard.press('ArrowDown');
  await expect(valueList()).toBeVisible();
  await page.keyboard.type('Acc');
  await page.keyboard.press('Escape');
  await expect(valueList()).toHaveCount(0);
  await expect(value).toHaveValue('Rol');

  // Enter alone chooses only a value with exactly the typed name.
  await page.keyboard.press('Control+A');
  await page.keyboard.type('acción');
  await page.keyboard.press('Enter');
  await expect(value).toHaveValue('Acción');
  await expectTitles(['Con Acción']);
});

test('keeps the value when leaving with half a name, and drops it when leaving it empty', async () => {
  await openBuilder([{ title: 'Con Rol', entries: [genre('Rol')] }, { title: 'Otro' }]);
  await addRow('Géneros', 'Rol');
  await expectTitles(['Con Rol']);
  const value = lastValue();

  // Clicking the field selects the name, so typing replaces it.
  await value.click();
  await page.keyboard.type('Ro');
  await expect(value).toHaveValue('Ro');
  await builder().getByLabel('Cumple', { exact: true }).focus();
  await expect(value).toHaveValue('Rol');
  await expectTitles(['Con Rol']);

  await value.fill('');
  await builder().getByLabel('Cumple', { exact: true }).focus();
  await expect(value).toHaveValue('');
  await expectTitles(['Con Rol', 'Otro']);
  await expect(button('Filtros')).toBeVisible();
});

test('compares numbers, and finds the items without them', async () => {
  await openBuilder([
    { title: 'Corto', minutesPlayed: 120, releaseDate: '1990' },
    { title: 'Largo', minutesPlayed: 3000, releaseDate: '2010-04-02' },
    { title: 'Sin horas' },
  ]);
  await addRow('Horas jugadas', null, 'al menos');
  const row = builder().locator('.advanced-filters__condition').last();
  const value = row.getByRole('spinbutton', { name: 'Valor', exact: true });
  await expect(value).toHaveAttribute('placeholder', '2–50');
  await value.fill('10');
  await expectTitles(['Largo']);
  await row.getByLabel('Operador', { exact: true }).selectOption({ label: 'como mucho' });
  await expectTitles(['Corto']);

  // Half-typed or impossible numbers do not apply.
  await value.fill('-3');
  await expect(value).toHaveAttribute('aria-invalid', 'true');
  await expectTitles(['Corto', 'Largo', 'Sin horas']);
  await expect(button('Filtros')).toBeVisible();

  await row.getByLabel('Operador', { exact: true }).selectOption({ label: 'sin indicar' });
  await expect(value).toHaveCount(0);
  await expectTitles(['Sin horas']);

  await addRow('Año de lanzamiento', null, 'como mucho');
  await builder()
    .locator('.advanced-filters__condition')
    .last()
    .getByRole('spinbutton', { name: 'Valor', exact: true })
    .fill('2000');
  await expect(heading('Videojuegos (0)')).toBeVisible();
  await builder()
    .getByLabel('Cumple', { exact: true })
    .selectOption({ label: 'alguna de estas condiciones' });
  await expectTitles(['Corto', 'Sin horas']);
});

test('finds the items in a collection, or in no collection but one', async () => {
  await openBuilder(
    [{ title: 'Favorito' }, { title: 'En las dos' }, { title: 'Suelto' }],
    [
      { name: 'Favoritos', items: ['Favorito', 'En las dos'] },
      { name: 'Pendientes', items: ['En las dos'] },
    ],
  );
  await addRow('Colecciones', 'Favoritos');
  await addRow('Colecciones', 'Pendientes');
  await expectTitles(['En las dos']);

  await builder()
    .locator('.advanced-filters__condition')
    .last()
    .getByLabel('Operador', { exact: true })
    .selectOption({ label: 'no es' });
  await expectTitles(['Favorito']);
});

test('mixes "all" and "any" with a group', async () => {
  await openBuilder([
    { title: 'RPG terminado', status: 'completed', entries: [genre('RPG uno')] },
    { title: 'RPG muy bueno', rating: 9, entries: [genre('RPG uno')] },
    { title: 'RPG normal', rating: 4, entries: [genre('RPG uno')] },
    { title: 'Otro terminado', status: 'completed' },
  ]);
  await addRow('Géneros', 'RPG uno');
  await builder().getByRole('button', { name: 'Añadir grupo', exact: true }).click();
  const group = builder().locator('.advanced-filters__group');
  await expect(group.getByLabel('Cumple', { exact: true })).toHaveValue('or');
  await addRow('Estado', 'Terminado', undefined, group);
  await addRow('Valoración', '4 estrellas', 'al menos', group);

  await expectTitles(['RPG muy bueno', 'RPG terminado']);

  await group.getByRole('button', { name: 'Quitar grupo', exact: true }).click();
  await expectTitles(['RPG muy bueno', 'RPG normal', 'RPG terminado']);
});

test('allows three levels of groups, and no more', async () => {
  await openBuilder([{ title: 'Zelda' }]);
  const addGroup = builder().getByRole('button', { name: 'Añadir grupo', exact: true });
  await expect(addGroup).toHaveCount(1);
  await addGroup.click();
  await expect(addGroup).toHaveCount(2);
  const groups = builder().locator('.advanced-filters__group');
  await groups.first().getByRole('button', { name: 'Añadir grupo', exact: true }).click();
  await expect(groups).toHaveCount(2);

  // The main group and the second one can still have groups; the third one cannot, although
  // it can have conditions.
  await expect(addGroup).toHaveCount(2);
  const third = groups.nth(1);
  await expect(third.getByRole('button', { name: 'Añadir grupo', exact: true })).toHaveCount(0);
  await expect(third.getByRole('button', { name: 'Añadir condición', exact: true })).toHaveCount(1);
});

test('says what the simple filters cannot: "not favorite", "not replayed" and "is not"', async () => {
  await openBuilder([
    { title: 'Favorito', favorite: true, replay: true },
    { title: 'Ninguno' },
    { title: 'Terminado', status: 'completed', replay: true },
  ]);
  await addRow('Favorito', 'No favoritos');
  await expectTitles(['Ninguno', 'Terminado']);

  await addRow('Rejugado', 'No rejugados');
  await expectTitles(['Ninguno']);

  await builder().getByRole('button', { name: 'Quitar condición', exact: true }).last().click();
  await addRow('Estado', 'Terminado', 'no es');
  // An item without a status "is not" completed.
  await expectTitles(['Ninguno']);
});

test('finds the items without a status, and by the year they were finished', async () => {
  await openBuilder([
    { title: 'Terminado', status: 'completed', finishedOn: '2023-06' },
    { title: 'Sin estado', finishedOn: 'unknown' },
    { title: 'Otro sin estado' },
  ]);
  await addRow('Estado', null, 'sin indicar');
  const row = builder().locator('.advanced-filters__condition').last();
  await expect(row.getByLabel('Valor', { exact: true })).toHaveCount(0);
  await expectTitles(['Otro sin estado', 'Sin estado']);
  await expect(button('Filtros (1)')).toBeVisible();

  await builder().getByRole('button', { name: 'Quitar condición', exact: true }).click();
  await addRow('Año de fin', null, 'al menos');
  await builder()
    .locator('.advanced-filters__condition')
    .last()
    .getByRole('spinbutton', { name: 'Valor', exact: true })
    .fill('2023');
  await expectTitles(['Terminado']);
  await builder()
    .locator('.advanced-filters__condition')
    .last()
    .getByLabel('Operador', { exact: true })
    .selectOption({ label: 'sin indicar' });
  // An unknown end date has no year, like an empty one.
  await expectTitles(['Otro sin estado', 'Sin estado']);
});

test('filters by rating with every operator', async () => {
  await openBuilder([
    { title: 'Alta', rating: 9 },
    { title: 'Baja', rating: 2 },
    { title: 'Sin valorar' },
  ]);
  await addRow('Valoración', '4 estrellas', 'al menos');
  await expectTitles(['Alta']);

  const row = builder().locator('.advanced-filters__condition');
  await row.getByLabel('Operador', { exact: true }).selectOption({ label: 'como mucho' });
  await expectTitles(['Baja']);

  await row.getByLabel('Operador', { exact: true }).selectOption({ label: 'sin valorar' });
  await expect(row.getByLabel('Valor', { exact: true })).toHaveCount(0);
  await expectTitles(['Sin valorar']);
});

test('ignores rows that are not complete, and starts over when the field changes', async () => {
  await openBuilder([{ title: 'Uno', status: 'completed' }, { title: 'Dos' }]);
  const add = builder().getByRole('button', { name: 'Añadir condición', exact: true });
  await add.click();
  const row = builder().locator('.advanced-filters__condition');

  await expect(heading('Videojuegos (2)')).toBeVisible();
  await expect(button('Filtros')).toBeVisible();

  await row.getByLabel('Campo', { exact: true }).selectOption({ label: 'Estado' });
  await expect(heading('Videojuegos (2)')).toBeVisible();

  await row.getByLabel('Valor', { exact: true }).selectOption({ label: 'Terminado' });
  await expect(heading('Videojuegos (1)')).toBeVisible();

  await row.getByLabel('Campo', { exact: true }).selectOption({ label: 'Favorito' });
  await expect(row.getByLabel('Valor', { exact: true })).toHaveValue('');
  await expect(row.getByLabel('Operador', { exact: true })).toHaveCount(0);
  await expect(heading('Videojuegos (2)')).toBeVisible();
});

test('uses only one mode, asking before leaving the other one', async () => {
  seedItems(dataDir, [
    { title: 'Favorito', favorite: true },
    { title: 'Rejugado', replay: true },
    { title: 'Ninguno' },
  ]);
  await button('Videojuegos').click();
  await button('Filtros').click();
  await expect(mode('Filtros simples')).toHaveAttribute('aria-pressed', 'true');
  await expect(mode('Filtros avanzados')).toHaveAttribute('aria-pressed', 'false');

  // Nothing would stop applying, so it does not ask.
  await mode('Filtros avanzados').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(builder()).toBeVisible();
  await mode('Filtros simples').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Favoritos', exact: true }).check();
  await expectTitles(['Favorito']);

  // It asks, with the focus on "Cancel", and cancelling changes nothing.
  await mode('Filtros avanzados').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    'Si continúas, se usarán los filtros avanzados y se ignorarán los filtros simples. No se borrarán: podrás volver a ellos.',
  );
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(mode('Filtros simples', 1)).toHaveAttribute('aria-pressed', 'true');
  await expectTitles(['Favorito']);

  // Accepting ignores the simple filters, and keeps them.
  await mode('Filtros avanzados').click();
  await dialog.getByRole('button', { name: 'Usar filtros avanzados', exact: true }).click();
  await expect(builder()).toBeVisible();
  await expect(mode('Filtros simples', 1)).toHaveAttribute('aria-pressed', 'false');
  await expectTitles(['Favorito', 'Ninguno', 'Rejugado']);
  await expect(button('Filtros')).toBeVisible();

  await addRow('Rejugado', 'Rejugados');
  await expectTitles(['Rejugado']);

  // And the other way round, finding each mode as it was.
  await mode('Filtros simples', 1).click();
  await expect(dialog).toContainText(
    'se usarán los filtros simples y se ignorarán los filtros avanzados',
  );
  await dialog.getByRole('button', { name: 'Usar filtros simples', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Favoritos', exact: true })).toBeChecked();
  await expectTitles(['Favorito']);

  await mode('Filtros avanzados', 1).click();
  await dialog.getByRole('button', { name: 'Usar filtros avanzados', exact: true }).click();
  await expect(builder().getByLabel('Valor', { exact: true })).toHaveValue('true');
  await expectTitles(['Rejugado']);
});

test('removes only the filters of the mode in use', async () => {
  await openBuilder([{ title: 'Favorito', favorite: true }, { title: 'Ninguno' }]);
  await addRow('Favorito', 'Favoritos');
  await expectTitles(['Favorito']);

  await button('Quitar filtros').click();
  await expect(builder().locator('.advanced-filters__condition')).toHaveCount(0);
  await expectTitles(['Favorito', 'Ninguno']);
  await expect(button('Quitar filtros')).toBeDisabled();

  // Nothing applies any more, so it does not ask.
  await mode('Filtros simples').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Favoritos', exact: true }).check();
  await mode('Filtros avanzados').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Usar filtros avanzados', exact: true })
    .click();
  await addRow('Favorito', 'No favoritos');
  await expectTitles(['Ninguno']);

  // The advanced filters go, and the simple ones stay, although they were not applying.
  await button('Quitar filtros').click();
  await expect(builder().locator('.advanced-filters__condition')).toHaveCount(0);
  await expectTitles(['Favorito', 'Ninguno']);
  await expect(mode('Filtros simples', 1)).toBeVisible();
});

test('offers a way out when nothing is found', async () => {
  await openBuilder([{ title: 'Ninguno' }]);
  await addRow('Favorito', 'Favoritos');
  await expect(heading('Videojuegos (0)')).toBeVisible();
  await page
    .locator('.library__no-results')
    .getByRole('button', { name: 'Quitar filtros', exact: true })
    .click();
  await expectTitles(['Ninguno']);
});

test('keeps each mode per library until the profile is closed', async () => {
  await openBuilder([{ title: 'Zelda', favorite: true }, { title: 'Metroid' }]);
  seedItems(dataDir, [{ title: 'Alien', kind: 'movie' }]);
  await addRow('Favorito', 'Favoritos');
  await expectTitles(['Zelda']);

  // Coming back from an item, as it was.
  await page.locator('.item-card').first().click();
  await expect(heading('Zelda')).toBeVisible();
  await button('Volver').click();
  await expect(builder().getByLabel('Valor', { exact: true })).toHaveValue('true');
  await expect(button('Filtros (1)')).toBeVisible();
  await expectTitles(['Zelda']);

  // Each library has its own.
  await button('Volver').click();
  await button('Películas').click();
  await expectTitles(['Alien']);
  await expect(builder()).toHaveCount(0);

  await button('Volver').click();
  await button('Videojuegos').click();
  await expectTitles(['Zelda']);

  // Closing the profile forgets it.
  await button('Volver').click();
  await button('Volver').click();
  await button('Abrir el perfil de Ana').click();
  await button('Videojuegos').click();
  await expectTitles(['Metroid', 'Zelda']);
  await button('Filtros').click();
  await expect(mode('Filtros simples')).toHaveAttribute('aria-pressed', 'true');
});

test('takes out a condition whose value was deleted from its catalog', async () => {
  await openBuilder([
    { title: 'Con etiqueta', entries: [tag('Romhack')] },
    { title: 'Sin etiqueta' },
  ]);
  await addRow('Etiquetas', 'Romhack');
  await addRow('Favorito', 'No favoritos');
  await expectTitles(['Con etiqueta']);

  await button('Catálogos').click();
  await page
    .getByRole('navigation', { name: 'Catálogos' })
    .getByRole('button', { name: 'Etiquetas' })
    .click();
  await button('Eliminar «Romhack»').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await button('Volver').click();
  await expect(builder().locator('.advanced-filters__condition')).toHaveCount(1);
  await expect(button('Filtros (1)')).toBeVisible();
  await expectTitles(['Con etiqueta', 'Sin etiqueta']);
});

test('names replays by the kind of library, and works in English', async () => {
  seedItems(dataDir, [
    { title: 'Película', kind: 'movie', replay: true },
    { title: 'Otra', kind: 'movie' },
  ]);
  await button('Películas').click();
  await button('Filtros').click();
  await mode('Filtros avanzados').click();
  await addRow('Revisionada', 'No revisionadas');
  await expectTitles(['Otra']);

  await button('Ajustes').click();
  const settings = page.getByRole('dialog');
  await settings.getByLabel('Idioma', { exact: true }).selectOption('en');
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  const english = page.getByRole('region', { name: 'Advanced filters', exact: true });
  await expect(english.getByLabel('Value', { exact: true }).locator('option:checked')).toHaveText(
    'Not rewatched',
  );
  await expect(english.getByLabel('Match', { exact: true }).locator('option:checked')).toHaveText(
    'all of these conditions',
  );
});

test('can be used with the keyboard alone', async () => {
  await openBuilder([{ title: 'Favorito', favorite: true }, { title: 'Ninguno' }]);
  await builder().getByRole('button', { name: 'Añadir condición', exact: true }).focus();
  await page.keyboard.press('Enter');

  const row = builder().locator('.advanced-filters__condition');
  await row.getByLabel('Campo', { exact: true }).focus();
  await page.keyboard.type('Favorito');
  await page.keyboard.press('Tab');
  await expect(row.getByLabel('Valor', { exact: true })).toBeFocused();
  await page.keyboard.type('No favoritos');
  await expectTitles(['Ninguno']);

  await page.keyboard.press('Tab');
  await expect(row.getByRole('button', { name: 'Quitar condición', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expectTitles(['Favorito', 'Ninguno']);
});

test('moves the grid with the builder, staying steady in a narrow window', async () => {
  await app!.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setSize(1024, 720);
  });
  await openBuilder(
    Array.from({ length: 200 }, (_, index) => ({
      title: `Juego ${index}`,
      favorite: index % 2 === 0,
    })),
  );
  await addRow('Favorito', 'Favoritos');
  await addRow('Favorito', 'Favoritos');
  await expect(heading('Videojuegos (100)')).toBeVisible();

  // A card that moves cannot be clicked: this also proves that it settles.
  await page.locator('.item-card').first().click();
  await expect(heading('Juego 0')).toBeVisible();
});
