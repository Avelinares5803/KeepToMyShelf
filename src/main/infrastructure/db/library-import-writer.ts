import type { Catalog, GenreScope } from '../../../core/catalogs/catalogs';
import { collectionNameKey } from '../../../core/collections/collection-name';
import {
  catalogEntryKey,
  type ExistingLibrary,
  type LibraryImportPlan,
} from '../../../core/import/library-import';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { ItemKind } from '../../../shared/content';
import type { SqliteDatabase } from './connection';
import { writeItemAttributes } from './item-writer';

/** What an open library has that an import must respect. One query per table. */
export function readExistingLibrary(db: SqliteDatabase): ExistingLibrary {
  const items = db.prepare('SELECT uuid, kind, placeholder_no FROM item').all() as {
    uuid: string;
    kind: ItemKind;
    placeholder_no: number | null;
  }[];
  const placeholders: Record<ItemKind, Set<number>> = {
    game: new Set(),
    movie: new Set(),
    series: new Set(),
  };
  for (const { kind, placeholder_no } of items) {
    if (placeholder_no !== null) placeholders[kind].add(placeholder_no);
  }

  const entries = db.prepare('SELECT catalog, name, scope FROM catalog_entry').all() as {
    catalog: Catalog;
    name: string;
    scope: GenreScope | null;
  }[];

  const collectionRows = db.prepare('SELECT uuid, name_key FROM collection').all() as {
    uuid: string;
    name_key: string;
  }[];
  const collections = new Map<string, Set<string>>();
  for (const { uuid } of collectionRows) collections.set(uuid, new Set());
  const members = db
    .prepare(
      `SELECT c.uuid AS collection, item.uuid AS item FROM collection_item ci
       JOIN collection c ON c.id = ci.collection_id
       JOIN item ON item.id = ci.item_id`,
    )
    .all() as { collection: string; item: string }[];
  for (const { collection, item } of members) collections.get(collection)?.add(item);

  return {
    itemUuids: new Set(items.map(({ uuid }) => uuid)),
    placeholders,
    catalogEntries: new Map(
      entries.map(({ catalog, name, scope }) => [catalogEntryKey(catalog, name), scope]),
    ),
    collections,
    collectionsByNameKey: new Map(collectionRows.map(({ uuid, name_key }) => [name_key, uuid])),
  };
}

/**
 * The titles of the items of `kind` (also those in the trash), by their search key: the ones
 * a CSV row would duplicate. Untitled items have none.
 */
export function readItemTitles(db: SqliteDatabase, kind: ItemKind): Map<string, string> {
  const rows = db
    .prepare('SELECT title, title_norm FROM item WHERE kind = ? AND title IS NOT NULL ORDER BY id')
    .all(kind) as { title: string; title_norm: string }[];
  const titles = new Map<string, string>();
  for (const { title, title_norm } of rows)
    if (!titles.has(title_norm)) titles.set(title_norm, title);
  return titles;
}

/**
 * Writes what `planLibraryImport` decided. The caller runs it in the same transaction in
 * which it read the library for the plan.
 */
export function writeLibraryImport(db: SqliteDatabase, plan: LibraryImportPlan): void {
  const insertEntry = db.prepare(
    'INSERT INTO catalog_entry (catalog, name, name_key, scope) VALUES (?, ?, ?, ?)',
  );
  const insertAlias = db.prepare(
    'INSERT INTO catalog_entry_alias (entry_id, name, name_key) VALUES (?, ?, ?)',
  );
  for (const { catalog, name, aliases, scope } of plan.catalogEntries) {
    const id = insertEntry.run(catalog, name, normalizeForSearch(name), scope).lastInsertRowid;
    for (const alias of aliases) insertAlias.run(id, alias, normalizeForSearch(alias));
  }

  const widen = db.prepare(
    "UPDATE catalog_entry SET scope = NULL WHERE catalog = 'screen_genre' AND name = ?",
  );
  for (const name of plan.widenedGenres) widen.run(name);

  // The rest of its attributes are written like the item form does, with its own dates.
  const insertItem = db.prepare(
    `INSERT INTO item (uuid, kind, title, title_norm, placeholder_no, created_at, updated_at,
       deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const item of plan.items) {
    const { title } = item.draft;
    const id = Number(
      insertItem.run(
        item.uuid,
        item.kind,
        title,
        title === null ? null : normalizeForSearch(title),
        item.placeholderNumber,
        item.createdAt,
        item.updatedAt,
        item.deletedAt,
      ).lastInsertRowid,
    );
    writeItemAttributes(db, id, item.kind, item.draft, item.updatedAt);
  }

  const insertCollection = db.prepare(
    `INSERT INTO collection (uuid, name, name_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const collectionId = db.prepare('SELECT id FROM collection WHERE uuid = ?').pluck();
  const addMember = db.prepare(
    `INSERT OR IGNORE INTO collection_item (collection_id, item_id, added_at)
     SELECT ?, id, ? FROM item WHERE uuid = ?`,
  );
  for (const { uuid, create, members } of plan.collections) {
    const id =
      create === null
        ? (collectionId.get(uuid) as number)
        : insertCollection.run(
            uuid,
            create.name,
            collectionNameKey(create.name),
            create.createdAt,
            create.updatedAt,
          ).lastInsertRowid;
    for (const member of members) addMember.run(id, member.addedAt, member.uuid);
  }
}
