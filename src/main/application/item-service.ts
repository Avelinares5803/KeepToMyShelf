import { parseStoredUsageDate, toStoredUsageDate } from '../../core/dates/usage-period';
import { ConflictError, NotFoundError } from '../../core/errors';
import { validateItemDraft, type ItemDraft, type ItemStatus } from '../../core/items/item-draft';
import { lowestFreeNumber } from '../../core/naming/lowest-free-number';
import { normalizeForSearch } from '../../core/text/normalize';
import type { ItemKind } from '../../shared/content';
import type { ItemDetails, ItemSummary } from '../../shared/items';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import type { SessionManager } from './session-manager';

export interface ItemServiceDeps {
  readonly sessions: SessionManager;
  readonly now: () => Date;
  readonly newId: () => string;
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

const SUMMARY_COLUMNS = 'id, kind, title, placeholder_no, is_favorite, rating, status, deleted_at';

// Titled items first, alphabetically ignoring case and accents; untitled ones after, by number.
const LIBRARY_ORDER = 'ORDER BY title IS NULL, title_norm, placeholder_no, id';

const toSummary = (row: SummaryRow): ItemSummary => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  placeholderNumber: row.placeholder_no,
  isFavorite: row.is_favorite === 1,
  rating: row.rating,
  status: row.status,
  deletedAt: row.deleted_at,
});

const storedDate = (value: string | null) => (value === null ? null : parseStoredUsageDate(value));

/**
 * Library items of the open profile. Every method receives the session token, so data is
 * always read from and written to the profile the UI believes is open.
 */
export class ItemService {
  constructor(private readonly deps: ItemServiceDeps) {}

  list(token: string, kind: ItemKind): ItemSummary[] {
    const rows = this.db(token)
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM item WHERE kind = ? AND deleted_at IS NULL ${LIBRARY_ORDER}`,
      )
      .all(kind) as SummaryRow[];
    return rows.map(toSummary);
  }

  /** Items in the trash, most recently deleted first; all kinds when `kind` is null. */
  listTrash(token: string, kind: ItemKind | null): ItemSummary[] {
    const rows = this.db(token)
      .prepare(
        `SELECT ${SUMMARY_COLUMNS} FROM item
         WHERE deleted_at IS NOT NULL AND (? IS NULL OR kind = ?)
         ORDER BY deleted_at DESC, id DESC`,
      )
      .all(kind, kind) as SummaryRow[];
    return rows.map(toSummary);
  }

  get(token: string, id: number): ItemDetails {
    return this.read(this.db(token), id);
  }

  create(token: string, kind: ItemKind, draft: ItemDraft): ItemDetails {
    const db = this.db(token);
    const valid = validateItemDraft(kind, draft);
    const timestamp = this.deps.now().toISOString();

    const id = db.transaction(() => {
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
      return newId;
    })();

    return this.read(db, id);
  }

  /**
   * Replaces all editable attributes. An untitled item keeps its placeholder number; an item
   * whose title is removed gets the lowest free number; giving it a title frees its number.
   */
  update(token: string, id: number, draft: ItemDraft): ItemDetails {
    const db = this.db(token);
    const current = this.read(db, id);
    if (current.deletedAt !== null) {
      throw new ConflictError('item.in_trash', `Item ${id} is in the trash`);
    }
    const valid = validateItemDraft(current.kind, draft);
    const timestamp = this.deps.now().toISOString();

    db.transaction(() => {
      const placeholder =
        valid.title !== null
          ? null
          : (current.placeholderNumber ?? this.freePlaceholderNumber(db, current.kind));
      db.prepare('UPDATE item SET title = ?, title_norm = ?, placeholder_no = ? WHERE id = ?').run(
        valid.title,
        valid.title === null ? null : normalizeForSearch(valid.title),
        placeholder,
        id,
      );
      this.writeAttributes(db, id, current.kind, valid, timestamp);
    })();

    return this.read(db, id);
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
  }

  /** Permanently deletes the trashed items of one kind, or all of them; returns how many. */
  emptyTrash(token: string, kind: ItemKind | null): number {
    return this.db(token)
      .prepare('DELETE FROM item WHERE deleted_at IS NOT NULL AND (? IS NULL OR kind = ?)')
      .run(kind, kind).changes;
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
