import {
  catalogForRole,
  isScopeCompatible,
  type Catalog,
  type GenreScope,
  type ItemRole,
} from '../../../core/catalogs/catalogs';
import { toIsoPartialDate } from '../../../core/dates/partial-date';
import { toStoredUsageDate } from '../../../core/dates/usage-period';
import { NotFoundError, ValidationError } from '../../../core/errors';
import type { ValidItemDraft } from '../../../core/items/item-draft';
import type { EntryRef } from '../../../core/items/item-relations';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { ItemKind } from '../../../shared/content';
import type Database from 'better-sqlite3';
import type { SqliteDatabase } from './connection';

type Statement = Database.Statement<unknown[]>;

/** Compiled once per connection: an import writes thousands of items with the same SQL. */
const statements = new WeakMap<SqliteDatabase, Map<string, Statement>>();

function prepared(db: SqliteDatabase, sql: string): Statement {
  let cache = statements.get(db);
  if (cache === undefined) statements.set(db, (cache = new Map()));
  let statement = cache.get(sql);
  if (statement === undefined) cache.set(sql, (statement = db.prepare(sql)));
  return statement;
}

/**
 * Writes every attribute of an item except its title: the item's row, its alternate titles,
 * its series details, its catalog values and its release dates. `timestamp` becomes its
 * modification date. Shared by the item form and the import, so both store items alike.
 */
export function writeItemAttributes(
  db: SqliteDatabase,
  id: number,
  kind: ItemKind,
  valid: ValidItemDraft,
  timestamp: string,
): void {
  prepared(
    db,
    `UPDATE item SET description = ?, notes = ?, is_favorite = ?, rating = ?, status = ?,
       is_replay = ?, owns_physical = ?, owns_digital = ?, started_on = ?, finished_on = ?,
       minutes_played = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    valid.description,
    valid.notes,
    Number(valid.isFavorite),
    valid.rating,
    valid.status,
    Number(valid.isReplay),
    Number(valid.ownsPhysical),
    Number(valid.ownsDigital),
    valid.startedOn === null ? null : toStoredUsageDate(valid.startedOn),
    valid.finishedOn === null ? null : toStoredUsageDate(valid.finishedOn),
    valid.minutesPlayed,
    timestamp,
    id,
  );

  prepared(db, 'DELETE FROM item_alt_title WHERE item_id = ?').run(id);
  const insertAlternate = prepared(
    db,
    'INSERT INTO item_alt_title (item_id, title, title_norm, sort_order) VALUES (?, ?, ?, ?)',
  );
  valid.alternateTitles.forEach((title, index) =>
    insertAlternate.run(id, title, normalizeForSearch(title), index),
  );

  if (kind === 'series') {
    prepared(
      db,
      `INSERT INTO series_details (item_id, seasons_count, episodes_count) VALUES (?, ?, ?)
       ON CONFLICT (item_id) DO UPDATE SET
         seasons_count = excluded.seasons_count, episodes_count = excluded.episodes_count`,
    ).run(id, valid.seasonsCount, valid.episodesCount);
  }

  prepared(db, 'DELETE FROM item_entry WHERE item_id = ?').run(id);
  // A value referenced twice (e.g. as existing and as a new name) is linked once.
  const insertEntry = prepared(
    db,
    'INSERT OR IGNORE INTO item_entry (item_id, entry_id, role, sort_order) VALUES (?, ?, ?, ?)',
  );
  for (const [role, refs] of Object.entries(valid.relations) as [ItemRole, EntryRef[]][]) {
    // validateItemDraft only keeps roles that apply to the kind.
    const catalog = catalogForRole(kind, role)!;
    refs.forEach((ref, index) =>
      insertEntry.run(id, resolveEntry(db, catalog, kind, ref), role, index),
    );
  }

  prepared(db, 'DELETE FROM item_release WHERE item_id = ?').run(id);
  const insertRelease = prepared(
    db,
    'INSERT INTO item_release (item_id, region_id, date, sort_order) VALUES (?, ?, ?, ?)',
  );
  valid.releases.forEach(({ region, date }, index) =>
    insertRelease.run(
      id,
      region === null ? null : resolveEntry(db, 'region', kind, region),
      toIsoPartialDate(date),
      index,
    ),
  );
}

/**
 * The id of the catalog value a reference points to. A new name is created, unless a value
 * with exactly that name already exists (e.g. created meanwhile in another window).
 */
function resolveEntry(db: SqliteDatabase, catalog: Catalog, kind: ItemKind, ref: EntryRef): number {
  const entry = (
    ref.kind === 'existing'
      ? prepared(db, 'SELECT id, catalog, scope FROM catalog_entry WHERE id = ?').get(ref.id)
      : prepared(
          db,
          'SELECT id, catalog, scope FROM catalog_entry WHERE catalog = ? AND name = ?',
        ).get(catalog, ref.name)
  ) as { id: number; catalog: Catalog; scope: GenreScope | null } | undefined;

  if (entry === undefined) {
    if (ref.kind === 'existing') {
      throw new NotFoundError('catalog.not_found', `Catalog value ${ref.id} does not exist`);
    }
    const result = prepared(
      db,
      'INSERT INTO catalog_entry (catalog, name, name_key) VALUES (?, ?, ?)',
    ).run(catalog, ref.name, normalizeForSearch(ref.name));
    return Number(result.lastInsertRowid);
  }
  if (entry.catalog !== catalog) {
    throw new ValidationError('item.wrong_catalog', `Value ${entry.id} is not in ${catalog}`);
  }
  if (!isScopeCompatible(entry.scope, kind)) {
    throw new ValidationError('item.genre_scope_mismatch', `Genre ${entry.id} is not for ${kind}`);
  }
  return entry.id;
}
