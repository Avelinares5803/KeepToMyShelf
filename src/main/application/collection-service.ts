import { collectionNameKey, normalizeCollectionName } from '../../core/collections/collection-name';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import type { ItemSort } from '../../core/filters/item-sort';
import type {
  CollectionDetails,
  CollectionMembership,
  CollectionName,
  CollectionSummary,
} from '../../shared/collections';
import type { ItemKind } from '../../shared/content';
import type { ItemSummary } from '../../shared/items';
import type { ImagePlanEntry } from '../../shared/media';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import { buildItemListQuery, type ItemSearch } from '../infrastructure/db/item-query';
import { toItemSummary, type ItemSummaryRow } from './item-service';
import type { MediaForCollections, StagedMedia } from './media-service';
import type { SessionManager } from './session-manager';

export interface CollectionServiceDeps {
  readonly sessions: SessionManager;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Saves a collection's cover with it; deleting it deletes the file if nothing else uses it. */
  readonly media: MediaForCollections;
}

export interface CollectionInput {
  readonly name: string;
  /** The new cover (null: none); left out, it does not change. */
  readonly cover?: ImagePlanEntry | null | undefined;
}

export interface CollectionItemsRequest {
  /** Only the items of this kind; null for every kind. */
  readonly kind: ItemKind | null;
  readonly search?: ItemSearch | undefined;
  readonly sort?: ItemSort | undefined;
}

/** The changes of one save of memberships: what to add and what to remove. */
export interface MembershipChanges {
  readonly add: readonly CollectionMembership[];
  readonly remove: readonly CollectionMembership[];
}

interface CollectionRow {
  id: number;
  name: string;
  item_count: number;
  cover_sha256: string | null;
  cover_width: number | null;
  cover_height: number | null;
  created_at: string;
  updated_at: string;
}

// Items in the trash are not in the library, so they are not counted.
const COLLECTION_QUERY = `
  SELECT c.id, c.name, c.created_at, c.updated_at,
         cover.sha256 AS cover_sha256, cover.width AS cover_width, cover.height AS cover_height,
         (SELECT COUNT(*) FROM collection_item ci JOIN item i ON i.id = ci.item_id
          WHERE ci.collection_id = c.id AND i.deleted_at IS NULL) AS item_count
  FROM collection c
  LEFT JOIN media_file cover ON cover.id = c.cover_media_id`;

const membershipKey = ({ collectionId, itemId }: CollectionMembership) =>
  `${collectionId}:${itemId}`;

/**
 * The collections of the open profile. They hold references to items, never copies: an item
 * in the trash keeps its memberships but is hidden from its collections until restored.
 */
export class CollectionService {
  constructor(private readonly deps: CollectionServiceDeps) {}

  /** Every collection, ordered by name ignoring case and accents. */
  list(token: string): CollectionSummary[] {
    const rows = this.db(token)
      .prepare(`${COLLECTION_QUERY} ORDER BY c.name_key, c.name`)
      .all() as CollectionRow[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      itemCount: row.item_count,
      cover:
        row.cover_sha256 === null
          ? null
          : { sha256: row.cover_sha256, width: row.cover_width!, height: row.cover_height! },
    }));
  }

  get(token: string, id: number): CollectionDetails {
    return this.read(token, this.db(token), id);
  }

  /** Creates a collection; its cover, when given, is saved in the same transaction. */
  create(token: string, input: CollectionInput): CollectionDetails {
    const db = this.db(token);
    const name = normalizeCollectionName(input.name);
    assertNameFree(db, name, null);
    const timestamp = this.deps.now().toISOString();

    const id = this.withCover(token, input.cover, (staged) =>
      db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO collection (uuid, name, name_key, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(this.deps.newId(), name, collectionNameKey(name), timestamp, timestamp);
        const newId = Number(result.lastInsertRowid);
        staged?.write(db, newId);
        return newId;
      })(),
    );
    return this.read(token, db, id);
  }

  /** Renames a collection and, when `cover` is given, replaces or removes its cover. */
  update(token: string, id: number, input: CollectionInput): CollectionDetails {
    const db = this.db(token);
    assertCollectionExists(db, id);
    const name = normalizeCollectionName(input.name);
    assertNameFree(db, name, id);
    const timestamp = this.deps.now().toISOString();

    this.withCover(token, input.cover, (staged) =>
      db.transaction(() => {
        db.prepare('UPDATE collection SET name = ?, name_key = ?, updated_at = ? WHERE id = ?').run(
          name,
          collectionNameKey(name),
          timestamp,
          id,
        );
        staged?.write(db, id);
      })(),
    );
    return this.read(token, db, id);
  }

  /** Deletes a collection for good. Its items are not touched; its cover goes if unused. */
  delete(token: string, id: number): void {
    const db = this.db(token);
    assertCollectionExists(db, id);
    const hadCover =
      db.prepare('SELECT cover_media_id FROM collection WHERE id = ?').pluck().get(id) !== null;
    db.prepare('DELETE FROM collection WHERE id = ?').run(id);
    if (hadCover) this.deps.media.sweep(token);
  }

  /**
   * Deletes several collections in one transaction and returns how many. Their items are not
   * touched. If one does not exist, nothing changes. One sweep removes the unused covers.
   */
  deleteMany(token: string, ids: readonly number[]): number {
    const db = this.db(token);
    const coverOf = db.prepare('SELECT cover_media_id FROM collection WHERE id = ?').pluck();
    const remove = db.prepare('DELETE FROM collection WHERE id = ?');
    let hadCover = false;
    const deleted = db.transaction(() => {
      let count = 0;
      for (const id of new Set(ids)) {
        assertCollectionExists(db, id);
        if (coverOf.get(id) !== null) hadCover = true;
        count += remove.run(id).changes;
      }
      return count;
    })();
    if (hadCover) this.deps.media.sweep(token);
    return deleted;
  }

  /** The items of a collection, without those in the trash, narrowed and sorted. */
  listItems(token: string, id: number, request: CollectionItemsRequest): ItemSummary[] {
    const db = this.db(token);
    assertCollectionExists(db, id);
    const query = buildItemListQuery(request.kind, {
      search: request.search,
      sort: request.sort,
      collectionId: id,
    });
    const rows = db.prepare(query.sql).all(...query.parameters) as ItemSummaryRow[];
    return rows.map(toItemSummary);
  }

  /** The ids of the items in a collection, without those in the trash. */
  memberIds(token: string, id: number): number[] {
    const db = this.db(token);
    assertCollectionExists(db, id);
    return db
      .prepare(
        `SELECT ci.item_id FROM collection_item ci JOIN item i ON i.id = ci.item_id
         WHERE ci.collection_id = ? AND i.deleted_at IS NULL ORDER BY ci.item_id`,
      )
      .pluck()
      .all(id) as number[];
  }

  /** The collections an item belongs to, by name. */
  forItem(token: string, itemId: number): CollectionName[] {
    const db = this.db(token);
    if (db.prepare('SELECT 1 FROM item WHERE id = ?').get(itemId) === undefined) {
      throw new NotFoundError('item.not_found', `Item ${itemId} does not exist`);
    }
    return db
      .prepare(
        `SELECT c.id, c.name FROM collection_item ci JOIN collection c ON c.id = ci.collection_id
         WHERE ci.item_id = ? ORDER BY c.name_key, c.name`,
      )
      .all(itemId) as CollectionName[];
  }

  /**
   * Adds and removes items, in one transaction. Only the changes are sent, never the whole
   * list: a list would drop the memberships of items in the trash, which the UI does not show.
   * Adding an item already in a collection, or removing one that is not, changes nothing.
   */
  changeMemberships(token: string, changes: MembershipChanges): void {
    const db = this.db(token);
    const added = new Set(changes.add.map(membershipKey));
    if (changes.remove.some((membership) => added.has(membershipKey(membership)))) {
      throw new ValidationError(
        'collection.invalid_change',
        'The same item is both added to and removed from a collection',
      );
    }
    const all = [...changes.add, ...changes.remove];
    for (const collectionId of new Set(all.map((change) => change.collectionId))) {
      assertCollectionExists(db, collectionId);
    }
    // An item in the trash is not in the library, so it cannot be added to anything.
    for (const itemId of new Set(changes.add.map((change) => change.itemId))) {
      const item = db.prepare('SELECT deleted_at FROM item WHERE id = ?').get(itemId) as
        { deleted_at: string | null } | undefined;
      if (item === undefined) {
        throw new NotFoundError('item.not_found', `Item ${itemId} does not exist`);
      }
      if (item.deleted_at !== null) {
        throw new ConflictError('item.in_trash', `Item ${itemId} is in the trash`);
      }
    }

    const timestamp = this.deps.now().toISOString();
    db.transaction(() => {
      const insert = db.prepare(
        'INSERT OR IGNORE INTO collection_item (collection_id, item_id, added_at) VALUES (?, ?, ?)',
      );
      const remove = db.prepare(
        'DELETE FROM collection_item WHERE collection_id = ? AND item_id = ?',
      );
      const touch = db.prepare('UPDATE collection SET updated_at = ? WHERE id = ?');
      const touched = new Set<number>();
      for (const { collectionId, itemId } of changes.add) {
        if (insert.run(collectionId, itemId, timestamp).changes > 0) touched.add(collectionId);
      }
      for (const { collectionId, itemId } of changes.remove) {
        if (remove.run(collectionId, itemId).changes > 0) touched.add(collectionId);
      }
      for (const collectionId of touched) touch.run(timestamp, collectionId);
    })();
  }

  /**
   * Runs a save with the collection's new cover already in place: if the save fails, the
   * files copied for it are removed; if it succeeds, the import it used is released.
   */
  private withCover<T>(
    token: string,
    cover: ImagePlanEntry | null | undefined,
    save: (staged: StagedMedia | null) => T,
  ): T {
    const staged = cover === undefined ? null : this.deps.media.stageCollectionCover(token, cover);
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

  private db(token: string): SqliteDatabase {
    return this.deps.sessions.require(token).db;
  }

  private read(token: string, db: SqliteDatabase, id: number): CollectionDetails {
    const row = db.prepare(`${COLLECTION_QUERY} WHERE c.id = ?`).get(id) as
      CollectionRow | undefined;
    if (row === undefined) {
      throw new NotFoundError('collection.not_found', `Collection ${id} does not exist`);
    }
    return {
      id: row.id,
      name: row.name,
      itemCount: row.item_count,
      cover: this.deps.media.collectionCover(token, id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

function assertCollectionExists(db: SqliteDatabase, id: number): void {
  if (db.prepare('SELECT 1 FROM collection WHERE id = ?').get(id) === undefined) {
    throw new NotFoundError('collection.not_found', `Collection ${id} does not exist`);
  }
}

// Names that differ only in case or accents could not be told apart.
function assertNameFree(db: SqliteDatabase, name: string, exceptId: number | null): void {
  const existing = db
    .prepare('SELECT id FROM collection WHERE name_key = ?')
    .pluck()
    .get(collectionNameKey(name)) as number | undefined;
  if (existing !== undefined && existing !== exceptId) {
    throw new ConflictError('collection.duplicate_name', `A collection "${name}" already exists`);
  }
}
