import { describe, expect, it } from 'vitest';
import type { ItemKind } from '../../shared/content';
import type { ExportedItem } from '../../shared/exports';
import type { CsvImportError } from '../../shared/imports';
import type { Language } from '../../shared/settings';
import { toCsv, type CsvSeparator } from '../export/csv';
import { csvColumns } from '../export/csv-columns';
import { csvLibrary, findCsvDuplicates, readCsvItems, type CsvRow } from './csv-import';
import { parseCsv } from './csv-parse';

let nextId = 0;
const newId = () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;
const NOW = new Date('2026-11-26T10:00:00.000Z');
const CONTEXT = { newId, now: NOW };

const EMPTY: ExportedItem = {
  uuid: 'u',
  kind: 'game',
  title: null,
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
  createdAt: new Date(2025, 4, 6).toISOString(),
  updatedAt: NOW.toISOString(),
  deletedAt: null,
};

/** The CSV file the export writes for these items, with their collections. */
function exportCsv(
  kind: ItemKind,
  items: readonly { item: Partial<ExportedItem>; collections?: string[] }[],
  language: Language = 'es',
  separator: CsvSeparator = ';',
): string {
  const columns = csvColumns(kind);
  const rows = items.map(({ item, collections = [] }) =>
    columns.map(({ value }) =>
      value({ ...EMPTY, kind, ...item }, { language, separator, collections }),
    ),
  );
  return toCsv([columns.map(({ label }) => label[language]), ...rows], separator);
}

function read(kind: ItemKind, text: string) {
  return readCsvItems(kind, parseCsv(text).records, CONTEXT);
}

function rowsOf(kind: ItemKind, text: string): readonly CsvRow[] {
  const result = read(kind, text);
  if (!result.ok) return expect.fail(`Errors: ${JSON.stringify(result.errors)}`);
  return result.rows;
}

function errorsOf(kind: ItemKind, text: string): readonly CsvImportError[] {
  const result = read(kind, text);
  if (result.ok) return expect.fail('The file was read without errors');
  return result.errors;
}

/** A file typed by hand: a header and rows, with ";". */
const sheet = (...lines: string[]) => lines.join('\r\n');

const FULL_GAME: Partial<ExportedItem> = {
  title: 'Okami',
  alternateTitles: ['大神', 'a|b'],
  description: 'Primera línea\nSegunda; "línea"',
  notes: '=No es una fórmula',
  isFavorite: true,
  rating: 9,
  status: 'completed',
  isReplay: true,
  ownsPhysical: true,
  ownsDigital: true,
  startedOn: '2021-03',
  finishedOn: 'unknown',
  minutesPlayed: 2730,
  relations: {
    genre: ['Aventura', 'Acción'],
    owned_on: ['PS2'],
    released_on: ['PS2', 'Wii'],
    tag: ['+Arte'],
  },
  releases: [
    { region: 'Japón', date: '2006-04-20' },
    { region: null, date: '2007' },
  ],
};

describe('readCsvItems', () => {
  it.each([
    ['es', ';'],
    ['es', ','],
    ['en', ','],
    ['en', ';'],
  ] as const)('reads back every value the export writes (%s, "%s")', (language, separator) => {
    const text = exportCsv(
      'game',
      [{ item: FULL_GAME, collections: ['Clásicos', 'Zen'] }],
      language,
      separator,
    );
    const [row] = rowsOf('game', text);
    expect(row).toEqual({
      row: 2,
      item: { ...EMPTY, ...FULL_GAME, uuid: expect.any(String) },
      collections: ['Clásicos', 'Zen'],
    });
  });

  it('reads the columns of series and movies', () => {
    const series = { title: 'Lost', seasonsCount: 6, episodesCount: 121, isReplay: true };
    expect(rowsOf('series', exportCsv('series', [{ item: series }]))[0]!.item).toMatchObject(
      series,
    );
    const movie: Partial<ExportedItem> = {
      title: 'Alien',
      status: 'abandoned',
      relations: { actor: ['Sigourney'] },
    };
    expect(
      rowsOf('movie', exportCsv('movie', [{ item: movie }], 'en', ','))[0]!.item,
    ).toMatchObject(movie);
  });

  it('gives untitled rows no title, and a new UUID to every row', () => {
    const rows = rowsOf('game', exportCsv('game', [{ item: {} }, { item: { title: 'Ico' } }]));
    expect(rows.map(({ item }) => item.title)).toEqual([null, 'Ico']);
    expect(new Set(rows.map(({ item }) => item.uuid)).size).toBe(2);
  });

  it('accepts columns in any order, headers in either language and missing columns', () => {
    const rows = rowsOf(
      'game',
      sheet('VALORACIÓN;titulo;Favorite;Estado', '4.5;Okami;sí;Terminada', ' ;Ico;;'),
    );
    expect(rows.map(({ item }) => item)).toEqual([
      expect.objectContaining({ title: 'Okami', rating: 9, isFavorite: true, status: 'completed' }),
      expect.objectContaining({ title: 'Ico', rating: null, isFavorite: false, status: null }),
    ]);
  });

  it('accepts what a spreadsheet may do to hours, and whole hours', () => {
    const rows = rowsOf('game', sheet('Título;Horas jugadas', 'A;45:30:00', 'B;45', 'C;0:05'));
    expect(rows.map(({ item }) => item.minutesPlayed)).toEqual([2730, 2700, 5]);
  });

  it('skips blank rows, but counts them for the row numbers', () => {
    const rows = rowsOf('game', sheet('Título;Notas', 'Okami;', ';', '', 'Ico;'));
    expect(rows.map(({ row, item }) => [row, item.title])).toEqual([
      [2, 'Okami'],
      [5, 'Ico'],
    ]);
  });

  it('takes the day an item was added as that day in local time, or now', () => {
    const rows = rowsOf('game', sheet('Título;Añadido el', 'A;2025-05-06', 'B;'));
    expect(rows.map(({ item }) => item.createdAt)).toEqual([
      new Date(2025, 4, 6).toISOString(),
      NOW.toISOString(),
    ]);
    expect(rows.every(({ item }) => item.updatedAt === NOW.toISOString())).toBe(true);
  });

  it('cleans collection names and counts one only once', () => {
    const [row] = rowsOf('game', sheet('Título;Colecciones', 'A;  Zen  | zén | Otra'));
    expect(row!.collections).toEqual(['Zen', 'Otra']);
  });

  it('reports every error of every row, by row and column as the file names it', () => {
    const errors = errorsOf(
      'game',
      sheet(
        'Título;Valoración;Estado;Inicio;Fin;Horas jugadas;Favorito;Formato;Añadido el',
        'Bien;4;En curso;2020;2021;10:00;No;Físico;2025-01-01',
        'Mal;0;Jugando;2021-13;ayer;10:75;quizá;Caja;06/05/2025',
        'Fechas;;;2022;2021;;;;',
      ),
    );
    expect(errors).toEqual([
      { row: 3, column: 'Valoración', code: 'import.csv_invalid_rating' },
      { row: 3, column: 'Estado', code: 'import.csv_invalid_status' },
      { row: 3, column: 'Inicio', code: 'import.csv_invalid_date' },
      { row: 3, column: 'Fin', code: 'import.csv_invalid_date' },
      { row: 3, column: 'Horas jugadas', code: 'import.csv_invalid_hours' },
      { row: 3, column: 'Favorito', code: 'import.csv_invalid_yes_no' },
      { row: 3, column: 'Formato', code: 'import.csv_invalid_format' },
      { row: 3, column: 'Añadido el', code: 'import.csv_invalid_added_on' },
      // The rules of the item form apply too.
      { row: 4, column: 'Fin', code: 'date.end_before_start' },
    ]);
  });

  it('reports the rules of the item form and of catalog values', () => {
    const errors = errorsOf(
      'game',
      sheet(
        'Título;Géneros;Fechas de lanzamiento;Colecciones',
        `${'x'.repeat(301)};;;`,
        `B;${'g'.repeat(201)};Japón: 2006-02-30;`,
        `C;;;${'c'.repeat(101)}`,
      ),
    );
    expect(errors).toEqual([
      { row: 2, column: 'Título', code: 'item.title_too_long' },
      { row: 3, column: 'Géneros', code: 'catalog.name_too_long' },
      { row: 3, column: 'Fechas de lanzamiento', code: 'import.csv_invalid_release' },
      { row: 4, column: 'Colecciones', code: 'collection.name_too_long' },
    ]);
  });

  it('refuses a value in a column without a header', () => {
    expect(errorsOf('game', sheet('Título;', 'A;', 'B;x'))).toEqual([
      { row: 3, column: null, code: 'import.csv_cell_without_column' },
    ]);
  });

  it('refuses unknown, repeated and missing columns', () => {
    expect(errorsOf('game', sheet('Título;Año;Titulo;Nota', 'A;1;A;x'))).toEqual([
      { row: 1, column: 'Titulo', code: 'import.csv_repeated_column' },
      { row: 1, column: 'Año', code: 'import.csv_unknown_column' },
      { row: 1, column: 'Nota', code: 'import.csv_unknown_column' },
    ]);
    expect(errorsOf('game', sheet('Notas', 'x'))).toEqual([
      { row: 1, column: null, code: 'import.csv_no_title_column' },
    ]);
    expect(errorsOf('game', '')).toEqual([{ row: 1, column: null, code: 'import.csv_empty' }]);
  });

  it('says which kind a file of another kind is', () => {
    const series = exportCsv('series', [{ item: { title: 'Lost' } }]);
    expect(errorsOf('game', series)).toEqual([
      { row: 1, column: null, code: 'import.csv_kind_series' },
    ]);
    expect(errorsOf('movie', exportCsv('game', [], 'en', ','))).toEqual([
      { row: 1, column: null, code: 'import.csv_kind_game' },
    ]);
    // A movie file fits series too: the smallest kind is named.
    expect(errorsOf('game', exportCsv('movie', []))).toEqual([
      { row: 1, column: null, code: 'import.csv_kind_movie' },
    ]);
  });

  it('reads a file with only the header as no rows', () => {
    expect(rowsOf('game', exportCsv('game', []))).toEqual([]);
  });
});

describe('findCsvDuplicates', () => {
  it('finds rows whose title exists, ignoring case and accents', () => {
    const rows = rowsOf('game', sheet('Título', 'HIPO', 'Okami', '', 'Nuevo'));
    const existing = new Map([
      ['hipo', 'Hipó'],
      ['okami', 'Okami'],
    ]);
    expect(findCsvDuplicates(rows, existing)).toEqual([
      { row: 2, title: 'HIPO', existingTitle: 'Hipó' },
      { row: 3, title: 'Okami', existingTitle: 'Okami' },
    ]);
  });
});

describe('csvLibrary', () => {
  it('finds collections by name as the app does, and creates the others once', () => {
    const rows = rowsOf('game', sheet('Título;Colecciones', 'A;zen|Nueva', 'B;Nueva', 'C;'));
    const library = csvLibrary(rows, new Map([['zen', 'existing-uuid']]), CONTEXT);
    const [a, b] = rows.map(({ item }) => item.uuid);
    expect(library.items).toHaveLength(3);
    expect(library.collections).toEqual([
      expect.objectContaining({
        uuid: 'existing-uuid',
        items: [{ uuid: a, addedAt: NOW.toISOString() }],
      }),
      expect.objectContaining({
        name: 'Nueva',
        items: [
          { uuid: a, addedAt: NOW.toISOString() },
          { uuid: b, addedAt: NOW.toISOString() },
        ],
      }),
    ]);
  });
});
