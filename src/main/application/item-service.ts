import {
  catalogForRole,
  isScopeCompatible,
  type Catalog,
  type GenreScope,
  type ItemRole,
} from '../../core/catalogs/catalogs';
import { parseIsoPartialDate, toIsoPartialDate } from '../../core/dates/partial-date';
import { parseStoredUsageDate, toStoredUsageDate } from '../../core/dates/usage-period';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { validateFilter, type FilterNode } from '../../core/filters/filter-tree';
import type { ItemSort } from '../../core/filters/item-sort';
import { validateItemDraft, type ItemDraft, type ItemStatus } from '../../core/items/item-draft';
import type { EntryRef } from '../../core/items/item-relations';
import { lowestFreeNumber } from '../../core/naming/lowest-free-number';
import { normalizeForSearch } from '../../core/text/normalize';
import type { ItemKind } from '../../shared/content';
import type {
  EntryName,
  ItemDetails,
  ItemFilterValue,
  ItemFilterValues,
  ItemRelease,
  ItemSummary,
} from '../../shared/items';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import { buildItemListQuery, type ItemSearch } from '../infrastructure/db/item-query';
import type { ItemMediaPlan } from '../../shared/media';
import type { MediaForItems, StagedMedia } from './media-service';
import type { SessionManager } from './session-manager';

export interface ItemServiceDeps {
  readonly sessions: SessionManager;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Saves an item's images with it; deleting items for good deletes the files only they used. */
  readonly media: MediaForItems;
}

export interface ItemListRequest {
  readonly search?: ItemSearch | undefined;
  readonly filter?: FilterNode | undefined;
  readonly sort?: ItemSort | undefined;
}

interface SummaryRow {
  id: number;
  kind: ItemKind;
  title: string | null;
  placeholder_no: number | null;
  is_favorite: number;
  rating: number | null;
  status: ItemStatus | null;
  deleted_at: string | null;
}

interface CoverColumns {
  cover_sha256: string | null;
  cover_width: number | null;
  cover_height: number | null;
}

interface DetailRow extends SummaryRow {
  description: string | null;
  notes: string | null;
  is_replay: number;
  owns_physical: number;
  owns_digital: number;
  started_on: string | null;
  finished_on: string | null;
  minutes_played: number | null;
  created_at: string;
  updated_at: string;
  seasons_count: number | null;
  episodes_count: number | null;
}

const SUMMARY_COLUMNS = `item.id, item.kind, item.title, item.placeholder_no, item.is_favorite,
  item.rating, item.status, item.deleted_at,
  cover.sha256 AS cover_sha256, cover.width AS cover_width, cover.height AS cover_height`;

/** The cover of every item, joined as `cover`. */
const COVER_JOIN = 'LEFT JOIN media_file cover ON cover.id = item.cover_media_id';

const toSummary = (row: SummaryRow): Omit<ItemSummary, 'cover'> => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  placeholderNumber: row.placeholder_no,
  isFavorite: row.is_favorite === 1,
  rating: row.rating,
  status: row.status,
  deletedAt: row.deleted_at,
});

/** A row of the library query (`buildItemListQuery`): an item with its cover. */
export type ItemSummaryRow = SummaryRow & CoverColumns;

export const toItemSummary = (row: ItemSummaryRow): ItemSummary => ({
  ...toSummary(row),
  cover:
    row.cover_sha256 === null
      ? null
      : { sha256: row.cover_sha256, width: row.cover_width!, height: row.cover_height! },
});

const storedDate = (value: string | null) => (value === null ? null : parseStoredUsageDate(value));

/**
 * Library items of the open profile. Every method receives the session token, so data is
 * always read from and written to the profile the UI believes is open.
 */
export class ItemService {
  constructor(private readonly deps: ItemServiceDeps) {}

  /** The library of one kind, narrowed down by a search and a filter, and sorted. */
  list(token: string, kind: ItemKind, options: ItemListRequest = {}): ItemSummary[] {
    const db = this.db(token);
    const filter = options.filter ? validateFilter(kind, options.filter) : null;
    const query = buildItemListQuery(kind, { ...options, filter });
    const rows = db.prepare(query.sql).all(...query.parameters) as ItemSummaryRow[];
    return rows.map(toItemSummary);
  }

  /**
   * What the filters of a library can offer: per role, the values its items use. Items in the
   * trash do not count, because they are not in the library: their values would find nothing.
   */
  filterValues(token: string, kind: ItemKind): ItemFilterValues {
    const db = this.db(token);
    const used = `SELECT DISTINCT item_entry.role, entry.id, entry.name, entry.name_key
      FROM item_entry
      JOIN item ON item.id = item_entry.item_id
      JOIN catalog_entry entry ON entry.id = item_entry.entry_id
      WHERE item.kind = ? AND item.deleted_at IS NULL`;
    const rows = db.prepare(`${used} ORDER BY entry.name_key, entry.name`).all(kind) as {
      role: ItemRole;
      id: number;
      name: string;
    }[];
    const aliasRows = db
      .prepare(
        `SELECT alias.entry_id, alias.name FROM catalog_entry_alias alias
         WHERE alias.entry_id IN (SELECT id FROM (${used}))
         ORDER BY alias.id`,
      )
      .all(kind) as { entry_id: number; name: string }[];

    const aliases = new Map<number, string[]>();
    for (const { entry_id, name } of aliasRows) {
      aliases.set(entry_id, [...(aliases.get(entry_id) ?? []), name]);
    }
    const values: Partial<Record<ItemRole, ItemFilterValue[]>> = {};
    for (const { role, id, name } of rows) {
      (values[role] ??= []).push({ id, name, aliases: aliases.get(id) ?? [] });
    }
    return values;
  }

  /** Items in the trash, most recently deleted first; all kinds when `kind` is null. */
  listTrash(token: string, kind: ItemKind | null): ItemSummary[] {
    const rows = this.db(token)
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM item ${COVER_JOIN}
         WHERE item.deleted_at IS NOT NULL AND (? IS NULL OR item.kind = ?)
         ORDER BY item.deleted_at DESC, item.id DESC`,
      )
      .all(kind, kind) as ItemSummaryRow[];
    return rows.map(toItemSummary);
  }

  get(token: string, id: number): ItemDetails {
    return this.read(this.db(token), id);
  }

  /**
   * Creates an item. `media`, when given, holds its cover and gallery, saved in the same
   * transaction: either everything is saved or nothing is.
   */
  create(token: string, kind: ItemKind, draft: ItemDraft, media: ItemMediaPlan = {}): ItemDetails {
    const db = this.db(token);
    const valid = validateItemDraft(kind, draft);
    const timestamp = this.deps.now().toISOString();

    const id = this.withMedia(token, media, (staged) =>
      db.transaction(() => {
        const placeholder = valid.title === null ? this.freePlaceholderNumber(db, kind) : null;
        const result = db
          .prepare(
            `INSERT INTO item (uuid, kind, title, title_norm, placeholder_no, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            this.deps.newId(),
            kind,
            valid.title,
            valid.title === null ? null : normalizeForSearch(valid.title),
            placeholder,
            timestamp,
            timestamp,
          );
        const newId = Number(result.lastInsertRowid);
        this.writeAttributes(db, newId, kind, valid, timestamp);
        staged?.write(db, newId);
        return newId;
      })(),
    );

    return this.read(db, id);
  }

  /**
   * Replaces all editable attributes. An untitled item keeps its placeholder number; an item
   * whose title is removed gets the lowest free number; giving it a title frees its number.
   * `media.cover` and `media.images`, when given, replace its cover and its gallery in the
   * same transaction; when left out, they do not change.
   */
  update(token: string, id: number, draft: ItemDraft, media: ItemMediaPlan = {}): ItemDetails {
    const db = this.db(token);
    const current = this.read(db, id);
    if (current.deletedAt !== null) {
      throw new ConflictError('item.in_trash', `Item ${id} is in the trash`);
    }
    const valid = validateItemDraft(current.kind, draft);
    const timestamp = this.deps.now().toISOString();

    this.withMedia(token, media, (staged) =>
      db.transaction(() => {
        const placeholder =
          valid.title !== null
            ? null
            : (current.placeholderNumber ?? this.freePlaceholderNumber(db, current.kind));
        db.prepare(
          'UPDATE item SET title = ?, title_norm = ?, placeholder_no = ? WHERE id = ?',
        ).run(
          valid.title,
          valid.title === null ? null : normalizeForSearch(valid.title),
          placeholder,
          id,
        );
        this.writeAttributes(db, id, current.kind, valid, timestamp);
        staged?.write(db, id);
      })(),
    );

    return this.read(db, id);
  }

  /**
   * Runs a save with the item's new cover and gallery already in place: if the save fails,
   * the files copied for it are removed; if it succeeds, the imports it used are released.
   */
  private withMedia<T>(
    token: string,
    media: ItemMediaPlan,
    save: (staged: StagedMedia | null) => T,
  ): T {
    const changes =
      media.cover !== undefined || media.images !== undefined || media.documents !== undefined;
    const staged = changes ? this.deps.media.stageMedia(token, media) : null;
    let result: T;
    try {
      result = save(staged);
    } catch (error) {
      staged?.abort();
      throw error;
    }
    staged?.finish();
    return result;
  }

  moveToTrash(token: string, id: number): void {
    const db = this.db(token);
    this.read(db, id);
    db.prepare('UPDATE item SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(
      this.deps.now().toISOString(),
      id,
    );
  }

  restore(token: string, id: number): void {
    const db = this.db(token);
    this.read(db, id);
    db.prepare('UPDATE item SET deleted_at = NULL WHERE id = ?').run(id);
  }

  /** Only items already in the trash can be deleted permanently. */
  deletePermanently(token: string, id: number): void {
    const db = this.db(token);
    if (this.read(db, id).deletedAt === null) {
      throw new ConflictError('item.not_in_trash', `Item ${id} is not in the trash`);
    }
    db.prepare('DELETE FROM item WHERE id = ?').run(id);
    this.deps.media.sweep(token);
  }

  /** Permanently deletes the trashed items of one kind, or all of them; returns how many. */
  emptyTrash(token: string, kind: ItemKind | null): number {
    const deleted = this.db(token)
      .prepare('DELETE FROM item WHERE deleted_at IS NOT NULL AND (? IS NULL OR kind = ?)')
      .run(kind, kind).changes;
    if (deleted > 0) this.deps.media.sweep(token);
    return deleted;
  }

  private db(token: string): SqliteDatabase {
    return this.deps.sessions.require(token).db;
  }

  // Items in the trash keep their number, so restoring one never collides.
  private freePlaceholderNumber(db: SqliteDatabase, kind: ItemKind): number {
    const used = db
      .prepare('SELECT placeholder_no FROM item WHERE kind = ? AND placeholder_no IS NOT NULL')
      .pluck()
      .all(kind) as number[];
    return lowestFreeNumber(used);
  }

  private writeAttributes(
    db: SqliteDatabase,
    id: number,
    kind: ItemKind,
    valid: ReturnType<typeof validateItemDraft>,
    timestamp: string,
  ): void {
    db.prepare(
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

    db.prepare('DELETE FROM item_alt_title WHERE item_id = ?').run(id);
    const insertAlternate = db.prepare(
      'INSERT INTO item_alt_title (item_id, title, title_norm, sort_order) VALUES (?, ?, ?, ?)',
    );
    valid.alternateTitles.forEach((title, index) =>
      insertAlternate.run(id, title, normalizeForSearch(title), index),
    );

    if (kind === 'series') {
      db.prepare(
        `INSERT INTO series_details (item_id, seasons_count, episodes_count) VALUES (?, ?, ?)
         ON CONFLICT (item_id) DO UPDATE SET
           seasons_count = excluded.seasons_count, episodes_count = excluded.episodes_count`,
      ).run(id, valid.seasonsCount, valid.episodesCount);
    }

    db.prepare('DELETE FROM item_entry WHERE item_id = ?').run(id);
    // A value referenced twice (e.g. as existing and as a new name) is linked once.
    const insertEntry = db.prepare(
      'INSERT OR IGNORE INTO item_entry (item_id, entry_id, role, sort_order) VALUES (?, ?, ?, ?)',
    );
    for (const [role, refs] of Object.entries(valid.relations) as [ItemRole, EntryRef[]][]) {
      // validateItemDraft only keeps roles that apply to the kind.
      const catalog = catalogForRole(kind, role)!;
      refs.forEach((ref, index) =>
        insertEntry.run(id, resolveEntry(db, catalog, kind, ref), role, index),
      );
    }

    db.prepare('DELETE FROM item_release WHERE item_id = ?').run(id);
    const insertRelease = db.prepare(
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

  private readRelations(db: SqliteDatabase, id: number): ItemDetails['relations'] {
    const rows = db
      .prepare(
        `SELECT ie.role, e.id, e.name FROM item_entry ie
         JOIN catalog_entry e ON e.id = ie.entry_id
         WHERE ie.item_id = ? ORDER BY ie.sort_order, e.name_key, e.name`,
      )
      .all(id) as (EntryName & { role: ItemRole })[];
    const relations: Partial<Record<ItemRole, EntryName[]>> = {};
    for (const { role, id: entryId, name } of rows) {
      (relations[role] ??= []).push({ id: entryId, name });
    }
    return relations;
  }

  private readReleases(db: SqliteDatabase, id: number): ItemRelease[] {
    const rows = db
      .prepare(
        `SELECT r.date, e.id, e.name FROM item_release r
         LEFT JOIN catalog_entry e ON e.id = r.region_id
         WHERE r.item_id = ? ORDER BY r.sort_order, r.id`,
      )
      .all(id) as { date: string; id: number | null; name: string | null }[];
    return rows.map((row) => ({
      region: row.id === null ? null : { id: row.id, name: row.name! },
      date: parseIsoPartialDate(row.date),
    }));
  }

  private read(db: SqliteDatabase, id: number): ItemDetails {
    const row = db
      .prepare(
        `SELECT item.*, series_details.seasons_count, series_details.episodes_count
         FROM item LEFT JOIN series_details ON series_details.item_id = item.id
         WHERE item.id = ?`,
      )
      .get(id) as DetailRow | undefined;
    if (!row) {
      throw new NotFoundError('item.not_found', `Item ${id} does not exist`);
    }
    const alternateTitles = db
      .prepare('SELECT title FROM item_alt_title WHERE item_id = ? ORDER BY sort_order, id')
      .pluck()
      .all(id) as string[];

    return {
      ...toSummary(row),
      alternateTitles,
      description: row.description,
      notes: row.notes,
      isReplay: row.is_replay === 1,
      ownsPhysical: row.owns_physical === 1,
      ownsDigital: row.owns_digital === 1,
      startedOn: storedDate(row.started_on),
      finishedOn: storedDate(row.finished_on),
      minutesPlayed: row.minutes_played,
      seasonsCount: row.seasons_count,
      episodesCount: row.episodes_count,
      relations: this.readRelations(db, id),
      releases: this.readReleases(db, id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * The id of the catalog value a reference points to. A new name is created, unless a value
 * with exactly that name already exists (e.g. created meanwhile in another window).
 */
function resolveEntry(db: SqliteDatabase, catalog: Catalog, kind: ItemKind, ref: EntryRef): number {
  const entry = (
    ref.kind === 'existing'
      ? db.prepare('SELECT id, catalog, scope FROM catalog_entry WHERE id = ?').get(ref.id)
      : db
          .prepare('SELECT id, catalog, scope FROM catalog_entry WHERE catalog = ? AND name = ?')
          .get(catalog, ref.name)
  ) as { id: number; catalog: Catalog; scope: GenreScope | null } | undefined;

  if (entry === undefined) {
    if (ref.kind === 'existing') {
      throw new NotFoundError('catalog.not_found', `Catalog value ${ref.id} does not exist`);
    }
    const result = db
      .prepare('INSERT INTO catalog_entry (catalog, name, name_key) VALUES (?, ?, ?)')
      .run(catalog, ref.name, normalizeForSearch(ref.name));
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
