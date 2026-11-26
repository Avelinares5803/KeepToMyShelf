import { z } from 'zod';
import { CATALOGS, ITEM_ROLES } from '../../core/catalogs/catalogs';
import { AppError } from '../../core/errors';
import { ITEM_STATUSES } from '../../core/items/item-draft';
import { ITEM_KINDS } from '../../shared/content';
import {
  LIBRARY_EXPORT_FORMAT,
  LIBRARY_EXPORT_FORMAT_VERSION,
  type LibraryExportFile,
} from '../../shared/exports';

// zod checks the shape and rejects absurd sizes; core/items and core/catalogs apply the rules
// of the app, as for anything typed in the UI.
const name = z.string().max(1_000);
const title = z.string().max(5_000);
const longText = z.string().max(500_000);
// Dates as the export writes them ("2021", "2021-03", "2021-03-14", "unknown").
const storedDate = z.string().max(20);
const moment = z.iso.datetime();
const count = z.number().nullable();
const BOM = '\u{FEFF}';

const catalogEntrySchema = z.object({
  catalog: z.enum(CATALOGS),
  name,
  aliases: z.array(name).max(500),
  scope: z.enum(['movie', 'series']).nullable(),
});

const itemSchema = z.object({
  uuid: z.uuid(),
  kind: z.enum(ITEM_KINDS),
  title: title.nullable(),
  placeholderNumber: z.number().int().positive().nullable(),
  alternateTitles: z.array(title).max(500),
  description: longText.nullable(),
  notes: longText.nullable(),
  isFavorite: z.boolean(),
  rating: count,
  status: z.enum(ITEM_STATUSES).nullable(),
  isReplay: z.boolean(),
  ownsPhysical: z.boolean(),
  ownsDigital: z.boolean(),
  startedOn: storedDate.nullable(),
  finishedOn: storedDate.nullable(),
  minutesPlayed: count,
  seasonsCount: count,
  episodesCount: count,
  relations: z.partialRecord(z.enum(ITEM_ROLES), z.array(name).max(5_000)),
  releases: z.array(z.object({ region: name.nullable(), date: storedDate })).max(1_000),
  createdAt: moment,
  updatedAt: moment,
  deletedAt: moment.nullable(),
});

const collectionSchema = z.object({
  uuid: z.uuid(),
  name,
  createdAt: moment,
  updatedAt: moment,
  items: z.array(z.object({ uuid: z.uuid(), addedAt: moment })).max(1_000_000),
});

/** Read first: a newer file is refused as such, not as an invalid one. */
const headerSchema = z.object({
  format: z.literal(LIBRARY_EXPORT_FORMAT),
  formatVersion: z.number().int().positive(),
});

const fileSchema = headerSchema.extend({
  appVersion: z.string().max(100),
  exportedAt: moment,
  profile: z.object({ name }),
  catalogs: z.array(catalogEntrySchema).max(1_000_000),
  items: z.array(itemSchema).max(1_000_000),
  collections: z.array(collectionSchema).max(1_000_000),
});

/**
 * Reads the text of a JSON export of a library. Throws `import.invalid_file` if it is not one
 * (or not a well-formed one) and `import.too_new` if a newer app wrote it.
 */
export function parseLibraryImport(text: string): LibraryExportFile {
  let json: unknown;
  try {
    // Saved by another program, it may start with a BOM.
    json = JSON.parse(text.startsWith(BOM) ? text.slice(BOM.length) : text);
  } catch (error) {
    throw new AppError('import.invalid_file', `Not JSON: ${String(error)}`, { cause: error });
  }
  const header = headerSchema.safeParse(json);
  if (!header.success) {
    throw new AppError('import.invalid_file', 'Not a KeepToMyShelf library export');
  }
  if (header.data.formatVersion > LIBRARY_EXPORT_FORMAT_VERSION) {
    throw new AppError(
      'import.too_new',
      `Format v${header.data.formatVersion} is newer than supported v${LIBRARY_EXPORT_FORMAT_VERSION}`,
    );
  }
  const file = fileSchema.safeParse(json);
  if (!file.success) {
    throw new AppError('import.invalid_file', `Invalid library export: ${file.error.message}`);
  }
  return file.data;
}
