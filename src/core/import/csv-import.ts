/**
 * Reads the items of one kind from a CSV file with the columns of the export
 * (`core/export/csv-columns.ts`), in either language, and turns them into the items of a
 * library export, so that `planLibraryImport` adds them as it adds those of a JSON file.
 * Pure: it gets the records of the file and decides; reading and writing are someone else's.
 */
import type { ItemKind } from '../../shared/content';
import { ITEM_KINDS } from '../../shared/content';
import type { ExportedCollection, ExportedItem, ExportedLibrary } from '../../shared/exports';
import type { CsvDuplicate, CsvImportError } from '../../shared/imports';
import { normalizeCatalogName, rolesForKind, type ItemRole } from '../catalogs/catalogs';
import { collectionNameKey, normalizeCollectionName } from '../collections/collection-name';
import { createPartialDate, parseIsoPartialDate, toIsoPartialDate } from '../dates/partial-date';
import { UNKNOWN_USAGE_DATE, toStoredUsageDate } from '../dates/usage-period';
import { ValidationError } from '../errors';
import { splitList, unguardFormula } from '../export/csv';
import {
  BOOLEAN_LABELS,
  csvColumns,
  FORMAT_LABELS,
  statusLabel,
  UNKNOWN_DATE_LABEL,
  type Label,
} from '../export/csv-columns';
import { checkItemDraft, ITEM_STATUSES, type ItemStatus } from '../items/item-draft';
import { toOwnershipFlags, type OwnershipFormat } from '../items/ownership';
import { starsToRating } from '../items/rating';
import { normalizeForSearch } from '../text/normalize';
import { toItemDraft } from './library-import';

/** A row of the file, read as the item it adds. */
export interface CsvRow {
  /** Its row in the spreadsheet: 1 is the header. */
  readonly row: number;
  /** With a new UUID; its title is already clean. */
  readonly item: ExportedItem;
  /** The names of the collections it belongs to, clean and without repetitions. */
  readonly collections: readonly string[];
}

export type CsvReadResult =
  | { readonly ok: true; readonly rows: readonly CsvRow[] }
  | { readonly ok: false; readonly errors: readonly CsvImportError[] };

export interface CsvReadContext {
  readonly newId: () => string;
  readonly now: Date;
}

/** Headers and fixed values are told apart ignoring case, accents and extra spaces. */
const key = (text: string) => normalizeForSearch(text);
const keysOf = (...labels: Label[]) => labels.flatMap(({ es, en }) => [key(es), key(en)]);

/** The column ids of a kind, by the key of their label in each language. */
function columnsByHeader(kind: ItemKind): Map<string, string> {
  const columns = new Map<string, string>();
  for (const { id, label } of csvColumns(kind)) {
    for (const header of keysOf(label)) columns.set(header, id);
  }
  return columns;
}

const STATUS_BY_KEY = new Map<string, ItemStatus>(
  ITEM_STATUSES.flatMap((status) =>
    // Both genders are accepted for every kind: "Terminado" and "Terminada".
    keysOf(statusLabel('game', status), statusLabel('movie', status)).map(
      (text) => [text, status] as const,
    ),
  ),
);

const FORMAT_BY_KEY = new Map<string, OwnershipFormat>(
  (Object.entries(FORMAT_LABELS) as [OwnershipFormat, Label][]).flatMap(([format, label]) =>
    keysOf(label).map((text) => [text, format] as const),
  ),
);

const YES = new Set(keysOf(BOOLEAN_LABELS.yes));
const NO = new Set(keysOf(BOOLEAN_LABELS.no));
const UNKNOWN_DATE = new Set(keysOf(UNKNOWN_DATE_LABEL));
const STORED_UNKNOWN_DATE = toStoredUsageDate(UNKNOWN_USAGE_DATE);

/** "45:30", and "45:30:00" as a spreadsheet may turn it into; also whole hours, "45". */
const DURATION = /^(\d{1,9})(?::([0-5]\d)(?::00)?)?$/;
const WHOLE_NUMBER = /^\d{1,9}$/;
const STARS = /^\d(?:[.,]\d+)?$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The column of each field that `checkItemDraft` reports. */
const FIELD_COLUMNS: Readonly<Record<string, string>> = {
  title: 'title',
  alternateTitles: 'alternateTitles',
  rating: 'rating',
  startedOn: 'startedOn',
  finishedOn: 'finishedOn',
  minutesPlayed: 'hoursPlayed',
  seasonsCount: 'seasons',
  episodesCount: 'episodes',
  description: 'description',
  notes: 'notes',
  releases: 'releases',
};

const fail = (code: string, message: string) => new ValidationError(code, message);

/**
 * Reads the items of `kind` from the records of a CSV file (`parseCsv`), the header first.
 * Columns may come in any order and with headers in either language; only the title is
 * required. Rows with every cell blank are skipped. Every error is reported, by row and
 * column, and none is imported while there is one.
 */
export function readCsvItems(
  kind: ItemKind,
  records: readonly (readonly string[])[],
  context: CsvReadContext,
): CsvReadResult {
  const [headerRecord = []] = records;
  const header = readHeader(kind, headerRecord);
  if (!header.ok) return header;
  const { columns } = header;

  const rows: CsvRow[] = [];
  const errors: CsvImportError[] = [];
  records.slice(1).forEach((record, index) => {
    if (record.every((cell) => cell.trim().length === 0)) return;
    const result = readRow(kind, index + 2, record, columns, context);
    if (result.ok) rows.push(result.row);
    else errors.push(...result.errors);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, rows };
}

/** The column id of each position of the file (null for an unnamed one), and its header. */
type Columns = readonly ({ readonly id: string; readonly header: string } | null)[];

function readHeader(
  kind: ItemKind,
  record: readonly string[],
):
  | { readonly ok: true; readonly columns: Columns }
  | { readonly ok: false; errors: CsvImportError[] } {
  const headerError = (code: string, column: string | null = null): CsvImportError => ({
    row: 1,
    column,
    code,
  });
  if (record.every((cell) => cell.trim().length === 0)) {
    return { ok: false, errors: [headerError('import.csv_empty')] };
  }

  const known = columnsByHeader(kind);
  const seen = new Set<string>();
  const unknown: string[] = [];
  const errors: CsvImportError[] = [];
  const columns = record.map((raw) => {
    const header = raw.trim();
    if (header.length === 0) return null;
    const id = known.get(key(header));
    if (id === undefined) {
      unknown.push(header);
      return null;
    }
    if (seen.has(id)) errors.push(headerError('import.csv_repeated_column', header));
    seen.add(id);
    return { id, header };
  });

  if (unknown.length > 0) {
    // A file of another kind would only give a list of unknown columns: say what it is.
    const otherKind = kindOfHeaders(
      record.filter((header) => header.trim().length > 0),
      kind,
    );
    if (otherKind !== null) {
      return { ok: false, errors: [headerError(`import.csv_kind_${otherKind}`)] };
    }
    errors.push(...unknown.map((header) => headerError('import.csv_unknown_column', header)));
  }
  if (!seen.has('title')) errors.push(headerError('import.csv_no_title_column'));
  return errors.length > 0 ? { ok: false, errors } : { ok: true, columns };
}

/** The kind (other than `chosen`) whose columns include every header, the smallest first. */
function kindOfHeaders(headers: readonly string[], chosen: ItemKind): ItemKind | null {
  const candidates = ITEM_KINDS.filter((kind) => kind !== chosen)
    .map((kind) => ({ kind, columns: columnsByHeader(kind) }))
    .sort((a, b) => a.columns.size - b.columns.size);
  const match = candidates.find(({ columns }) =>
    headers.every((header) => columns.has(key(header))),
  );
  return match?.kind ?? null;
}

/** The fields of an item that a row fills; the rest keep the values of an empty item. */
interface RowValues {
  title: string;
  alternateTitles: string[];
  status: ItemStatus | null;
  isReplay: boolean;
  isFavorite: boolean;
  rating: number | null;
  ownsPhysical: boolean;
  ownsDigital: boolean;
  startedOn: string | null;
  finishedOn: string | null;
  minutesPlayed: number | null;
  seasonsCount: number | null;
  episodesCount: number | null;
  releases: { region: string | null; date: string }[];
  relations: Partial<Record<ItemRole, string[]>>;
  description: string | null;
  notes: string | null;
  collections: string[];
  createdAt: string | null;
}

function readRow(
  kind: ItemKind,
  row: number,
  record: readonly string[],
  columns: Columns,
  { newId, now }: CsvReadContext,
): { ok: true; row: CsvRow } | { ok: false; errors: CsvImportError[] } {
  const values: RowValues = {
    title: '',
    alternateTitles: [],
    status: null,
    isReplay: false,
    isFavorite: false,
    rating: null,
    ownsPhysical: false,
    ownsDigital: false,
    startedOn: null,
    finishedOn: null,
    minutesPlayed: null,
    seasonsCount: null,
    episodesCount: null,
    releases: [],
    relations: {},
    description: null,
    notes: null,
    collections: [],
    createdAt: null,
  };
  const errors: CsvImportError[] = [];
  const failed = new Set<string>();

  record.forEach((raw, index) => {
    const column = columns[index];
    if (column === null || column === undefined) {
      if (raw.trim().length > 0) {
        errors.push({ row, column: null, code: 'import.csv_cell_without_column' });
      }
      return;
    }
    try {
      readCell(kind, column.id, unguardFormula(raw), values);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      errors.push({ row, column: column.header, code: error.code });
      failed.add(column.id);
    }
  });

  const item: ExportedItem = {
    uuid: newId(),
    kind,
    title: values.title,
    placeholderNumber: null,
    alternateTitles: values.alternateTitles,
    description: values.description,
    notes: values.notes,
    isFavorite: values.isFavorite,
    rating: values.rating,
    status: values.status,
    isReplay: values.isReplay,
    ownsPhysical: values.ownsPhysical,
    ownsDigital: values.ownsDigital,
    startedOn: values.startedOn,
    finishedOn: values.finishedOn,
    minutesPlayed: values.minutesPlayed,
    seasonsCount: values.seasonsCount,
    episodesCount: values.episodesCount,
    relations: values.relations,
    releases: values.releases,
    createdAt: values.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
  };

  // The rules of the item form, also for what each cell cannot tell alone (an end before
  // the start, a title too long…). A column that already failed is not reported twice.
  const check = checkItemDraft(kind, toItemDraft(item));
  if (!check.ok) {
    for (const { field, code } of check.errors) {
      const id = FIELD_COLUMNS[field.split('.')[0]!];
      if (id === undefined) {
        errors.push({ row, column: null, code });
        continue;
      }
      if (failed.has(id)) continue;
      const header = columns.find((column) => column !== null && column.id === id)?.header;
      errors.push({ row, column: header ?? null, code });
    }
  }
  if (errors.length > 0 || !check.ok) return { ok: false, errors };
  return {
    ok: true,
    row: { row, item: { ...item, title: check.value.title }, collections: values.collections },
  };
}

/** Puts in `values` what the cell of column `id` says, or throws why it cannot. */
function readCell(kind: ItemKind, id: string, cell: string, values: RowValues): void {
  const text = cell.trim();
  const empty = text.length === 0;
  switch (id) {
    case 'title':
      values.title = cell;
      return;
    case 'alternateTitles':
      values.alternateTitles = splitList(cell);
      return;
    case 'status':
      values.status = empty ? null : lookUp(STATUS_BY_KEY, text, 'import.csv_invalid_status');
      return;
    case 'isReplay':
      values.isReplay = readYesNo(text);
      return;
    case 'isFavorite':
      values.isFavorite = readYesNo(text);
      return;
    case 'rating':
      values.rating = empty ? null : readStars(text);
      return;
    case 'format':
      Object.assign(
        values,
        toOwnershipFlags(empty ? null : lookUp(FORMAT_BY_KEY, text, 'import.csv_invalid_format')),
      );
      return;
    case 'startedOn':
      values.startedOn = empty ? null : readUsageDate(text);
      return;
    case 'finishedOn':
      values.finishedOn = empty ? null : readUsageDate(text);
      return;
    case 'hoursPlayed':
      values.minutesPlayed = empty ? null : readDuration(text);
      return;
    case 'seasons':
      values.seasonsCount = empty ? null : readWholeNumber(text);
      return;
    case 'episodes':
      values.episodesCount = empty ? null : readWholeNumber(text);
      return;
    case 'releases':
      values.releases = splitList(cell).map(readRelease);
      return;
    case 'description':
      values.description = empty ? null : cell;
      return;
    case 'notes':
      values.notes = empty ? null : cell;
      return;
    case 'collections':
      values.collections = uniqueCollectionNames(splitList(cell));
      return;
    case 'addedOn':
      values.createdAt = empty ? null : readDay(text);
      return;
    default: {
      // Every other column is a role of the kind, whose values are catalog names.
      const role = rolesForKind(kind).find((candidate) => candidate === id);
      if (role === undefined) throw new Error(`Unexpected CSV column "${id}"`);
      const names = splitList(cell).map(normalizeCatalogName);
      // Roles without values are left out, as the JSON export does.
      if (names.length > 0) values.relations[role] = names;
    }
  }
}

function lookUp<T>(values: ReadonlyMap<string, T>, text: string, code: string): T {
  const value = values.get(key(text));
  if (value === undefined) throw fail(code, `Unknown value "${text}"`);
  return value;
}

function readYesNo(text: string): boolean {
  const value = key(text);
  if (value.length === 0 || NO.has(value)) return false;
  if (YES.has(value)) return true;
  throw fail('import.csv_invalid_yes_no', `Neither yes nor no: "${text}"`);
}

/** "4,5" and "4.5" alike, whatever the separator: half stars, from 0.5 to 5. */
function readStars(text: string): number {
  const rating = STARS.test(text) ? starsToRating(Number(text.replace(',', '.'))) : null;
  if (rating === null) throw fail('import.csv_invalid_rating', `Invalid stars: "${text}"`);
  return rating;
}

function readUsageDate(text: string): string {
  if (UNKNOWN_DATE.has(key(text))) return STORED_UNKNOWN_DATE;
  return readPartialDate(text, 'import.csv_invalid_date');
}

/** "2021", "2021-03" or "2021-03-14", as the app stores it. */
function readPartialDate(text: string, code: string): string {
  try {
    return toIsoPartialDate(parseIsoPartialDate(text));
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw fail(code, `Invalid date "${text}": ${error.message}`);
  }
}

function readDuration(text: string): number {
  const match = DURATION.exec(text);
  if (match === null) throw fail('import.csv_invalid_hours', `Invalid duration: "${text}"`);
  return Number(match[1]) * 60 + Number(match[2] ?? 0);
}

function readWholeNumber(text: string): number {
  if (!WHOLE_NUMBER.test(text)) throw fail('import.csv_invalid_number', `Not a number: "${text}"`);
  return Number(text);
}

/** "Región: fecha", or only the date. A date has no ":", so the last one ends the region. */
function readRelease(text: string): { region: string | null; date: string } {
  const colon = text.lastIndexOf(':');
  const region = colon === -1 ? '' : text.slice(0, colon).trim();
  const date = readPartialDate(text.slice(colon + 1).trim(), 'import.csv_invalid_release');
  return { region: region.length === 0 ? null : normalizeCatalogName(region), date };
}

/** The day an item was added, "2026-11-25", as that day at 00:00 local time. */
function readDay(text: string): string {
  const match = DAY.exec(text);
  try {
    if (match === null) throw fail('import.csv_invalid_added_on', 'Not a day');
    const [, year, month, day] = match.map(Number) as [number, number, number, number];
    createPartialDate(year, month, day);
    return new Date(year, month - 1, day).toISOString();
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw fail('import.csv_invalid_added_on', `Invalid day "${text}"`);
  }
}

/** Clean names; two that the app would take for the same collection count once. */
function uniqueCollectionNames(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const candidate of raw) {
    const name = normalizeCollectionName(candidate);
    if (seen.has(collectionNameKey(name))) continue;
    seen.add(collectionNameKey(name));
    names.push(name);
  }
  return names;
}

/**
 * The rows whose title is that of an item of the profile (`existingTitles`, by search key),
 * ignoring case and accents, as the search does. Untitled rows never are.
 */
export function findCsvDuplicates(
  rows: readonly CsvRow[],
  existingTitles: ReadonlyMap<string, string>,
): CsvDuplicate[] {
  return rows.flatMap(({ row, item }) => {
    if (item.title === null) return [];
    const existingTitle = existingTitles.get(normalizeForSearch(item.title));
    return existingTitle === undefined ? [] : [{ row, title: item.title, existingTitle }];
  });
}

/**
 * The rows as a library export, for `planLibraryImport`. A collection is found by its name as
 * the app compares them (`collectionsByNameKey`, which gives its UUID); one that does not exist
 * is created, named as the first row that uses it writes it.
 */
export function csvLibrary(
  rows: readonly CsvRow[],
  collectionsByNameKey: ReadonlyMap<string, string>,
  { newId, now }: CsvReadContext,
): ExportedLibrary {
  const moment = now.toISOString();
  const collections = new Map<string, { uuid: string; name: string; members: string[] }>();
  for (const { item, collections: names } of rows) {
    for (const name of names) {
      const nameKey = collectionNameKey(name);
      let collection = collections.get(nameKey);
      if (collection === undefined) {
        const uuid = collectionsByNameKey.get(nameKey) ?? newId();
        collection = { uuid, name, members: [] };
        collections.set(nameKey, collection);
      }
      collection.members.push(item.uuid);
    }
  }
  return {
    catalogs: [],
    items: rows.map(({ item }) => item),
    collections: [...collections.values()].map(({ uuid, name, members }): ExportedCollection => ({
      uuid,
      name,
      createdAt: moment,
      updatedAt: moment,
      items: members.map((member) => ({ uuid: member, addedAt: moment })),
    })),
  };
}
