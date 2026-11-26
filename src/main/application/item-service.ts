import type { ItemRole } from '../../core/catalogs/catalogs';
import { parseIsoPartialDate } from '../../core/dates/partial-date';
import { parseStoredUsageDate } from '../../core/dates/usage-period';
import { ConflictError, NotFoundError } from '../../core/errors';
import { filterFieldsFor, type NumberMeasure } from '../../core/filters/filter-fields';
import { validateFilter, type FilterNode } from '../../core/filters/filter-tree';
import type { ItemSort } from '../../core/filters/item-sort';
import { validateItemDraft, type ItemDraft, type ItemStatus } from '../../core/items/item-draft';
import { lowestFreeNumber } from '../../core/naming/lowest-free-number';
import { normalizeForSearch } from '../../core/text/normalize';
import type { ItemKind } from '../../shared/content';
import type {
  EntryName,
  ItemDetails,
  ItemFilterRange,
  ItemFilterValue,
  ItemFilterValues,
  ItemRelease,
  ItemSummary,
} from '../../shared/items';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import {
  buildItemListQuery,
  buildMeasureRangeQuery,
  type ItemSearch,
} from '../infrastructure/db/item-query';
import { writeItemAttributes } from '../infrastructure/db/item-writer';
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
   * What the filters of a library can offer: per role, the values its items use, and the range
   * of each number. Items in the trash do not count, because they are not in the library: their
   * values would find nothing.
   */
  filterValues(token: string, kind: ItemKind): ItemFilterValues {
    const db = this.db(token);
    const used = `SELECT DISTINCT item_entry.role, entry.id, entry.name, entry.name_key
      FROM item_entry
      JOIN item ON item.id = item_entry.item_id
      JOIN catalog_entry entry ON entry.id = item_entry.entry_id
      WHERE item.kind = ? AND item.deleted_at IS NULL`;
    const order = 'ORDER BY natural_key(entry.name_key), entry.name_key, entry.name';
    const rows = db.prepare(`${used} ${order}`).all(kind) as {
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
    const roles: Partial<Record<ItemRole, ItemFilterValue[]>> = {};
    for (const { role, id, name } of rows) {
      (roles[role] ??= []).push({ id, name, aliases: aliases.get(id) ?? [] });
    }

    const ranges: Partial<Record<NumberMeasure, ItemFilterRange>> = {};
    for (const field of filterFieldsFor(kind)) {
      if (field.source.type !== 'number') continue;
      const { measure } = field.source;
      const query = buildMeasureRangeQuery(kind, measure);
      const { min, max } = db.prepare(query.sql).get(...query.parameters) as {
        min: number | null;
        max: number | null;
      };
      if (min === null || max === null) continue;
      // The filter takes whole hours: 10:30 is between 10 and 11.
      ranges[measure] =
        measure === 'hoursPlayed'
          ? { min: Math.floor(min / 60), max: Math.ceil(max / 60) }
          : { min, max };
    }

    // Collections have no aliases: only their name is searched.
    const collections = (
      db
        .prepare(
          `SELECT c.id, c.name FROM collection c
           WHERE EXISTS (SELECT 1 FROM collection_item ci JOIN item ON item.id = ci.item_id
                         WHERE ci.collection_id = c.id AND item.kind = ?
                           AND item.deleted_at IS NULL)
           ORDER BY natural_key(c.name_key), c.name_key, c.name`,
        )
        .all(kind) as EntryName[]
    ).map(({ id, name }) => ({ id, name, aliases: [] }));
    return { roles, ranges, collections };
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
        writeItemAttributes(db, newId, kind, valid, timestamp);
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
        writeItemAttributes(db, id, current.kind, valid, timestamp);
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

  /**
   * Moves several items to the trash in one transaction and returns how many were moved.
   * Items already in the trash are left as they are. If one does not exist, nothing changes.
   * Their files stay: an item in the trash keeps them, so there is nothing to sweep.
   */
  moveManyToTrash(token: string, ids: readonly number[]): number {
    const db = this.db(token);
    const exists = db.prepare('SELECT 1 FROM item WHERE id = ?');
    const trash = db.prepare('UPDATE item SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL');
    const timestamp = this.deps.now().toISOString();
    return db.transaction(() => {
      let moved = 0;
      for (const id of new Set(ids)) {
        if (exists.get(id) === undefined) {
          throw new NotFoundError('item.not_found', `Item ${id} does not exist`);
        }
        moved += trash.run(timestamp, id).changes;
      }
      return moved;
    })();
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

  private readRelations(db: SqliteDatabase, id: number): ItemDetails['relations'] {
    const rows = db
      .prepare(
        `SELECT ie.role, e.id, e.name FROM item_entry ie
         JOIN catalog_entry e ON e.id = ie.entry_id
         WHERE ie.item_id = ?
         ORDER BY ie.sort_order, natural_key(e.name_key), e.name_key, e.name`,
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
