import type { ItemRole } from '../../../core/catalogs/catalogs';
import type { ItemStatus } from '../../../core/items/item-draft';
import type { ItemKind } from '../../../shared/content';
import type {
  ExportedCatalogEntry,
  ExportedCollection,
  ExportedItem,
  ExportedLibrary,
} from '../../../shared/exports';
import type { SqliteDatabase } from './connection';

interface ItemRow {
  id: number;
  uuid: string;
  kind: ItemKind;
  title: string | null;
  placeholder_no: number | null;
  description: string | null;
  notes: string | null;
  is_favorite: number;
  rating: number | null;
  status: ItemStatus | null;
  is_replay: number;
  owns_physical: number;
  owns_digital: number;
  started_on: string | null;
  finished_on: string | null;
  minutes_played: number | null;
  seasons_count: number | null;
  episodes_count: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Everything in an open library except its files, with the items in the trash (they have
 * `deletedAt`). One query per table, not per item, and all of them in one transaction.
 */
export function readLibraryForExport(db: SqliteDatabase): ExportedLibrary {
  return db.transaction(() => ({
    catalogs: readCatalogs(db),
    items: readItems(db),
    collections: readCollections(db),
  }))();
}

function readCatalogs(db: SqliteDatabase): ExportedCatalogEntry[] {
  const aliases = groupBy(
    db.prepare('SELECT entry_id AS owner, name FROM catalog_entry_alias ORDER BY id').all() as {
      owner: number;
      name: string;
    }[],
  );
  const rows = db
    .prepare(
      `SELECT id, catalog, name, scope FROM catalog_entry
       ORDER BY catalog, natural_key(name_key), name_key, name`,
    )
    .all() as (Omit<ExportedCatalogEntry, 'aliases'> & { id: number })[];
  return rows.map(({ id, catalog, name, scope }) => ({
    catalog,
    name,
    aliases: (aliases.get(id) ?? []).map((alias) => alias.name),
    scope,
  }));
}

/** By kind and title, as the libraries show them; the untitled ones last. */
function readItems(db: SqliteDatabase): ExportedItem[] {
  const alternateTitles = groupBy(
    db
      .prepare('SELECT item_id AS owner, title FROM item_alt_title ORDER BY sort_order, id')
      .all() as { owner: number; title: string }[],
  );
  const relations = groupBy(
    db
      .prepare(
        `SELECT ie.item_id AS owner, ie.role, e.name FROM item_entry ie
         JOIN catalog_entry e ON e.id = ie.entry_id
         ORDER BY ie.sort_order, natural_key(e.name_key), e.name_key, e.name`,
      )
      .all() as { owner: number; role: ItemRole; name: string }[],
  );
  const releases = groupBy(
    db
      .prepare(
        `SELECT r.item_id AS owner, r.date, e.name AS region FROM item_release r
         LEFT JOIN catalog_entry e ON e.id = r.region_id
         ORDER BY r.sort_order, r.id`,
      )
      .all() as { owner: number; date: string; region: string | null }[],
  );
  const rows = db
    .prepare(
      `SELECT item.*, series_details.seasons_count, series_details.episodes_count
       FROM item LEFT JOIN series_details ON series_details.item_id = item.id
       ORDER BY item.kind, item.title IS NULL, natural_key(item.title_norm), item.title_norm,
         item.placeholder_no, item.id`,
    )
    .all() as ItemRow[];

  return rows.map((row) => {
    const byRole: Partial<Record<ItemRole, string[]>> = {};
    for (const { role, name } of relations.get(row.id) ?? []) (byRole[role] ??= []).push(name);
    return {
      uuid: row.uuid,
      kind: row.kind,
      title: row.title,
      placeholderNumber: row.placeholder_no,
      alternateTitles: (alternateTitles.get(row.id) ?? []).map(({ title }) => title),
      description: row.description,
      notes: row.notes,
      isFavorite: row.is_favorite === 1,
      rating: row.rating,
      status: row.status,
      isReplay: row.is_replay === 1,
      ownsPhysical: row.owns_physical === 1,
      ownsDigital: row.owns_digital === 1,
      startedOn: row.started_on,
      finishedOn: row.finished_on,
      minutesPlayed: row.minutes_played,
      seasonsCount: row.seasons_count,
      episodesCount: row.episodes_count,
      relations: byRole,
      releases: (releases.get(row.id) ?? []).map(({ region, date }) => ({ region, date })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  });
}

function readCollections(db: SqliteDatabase): ExportedCollection[] {
  const members = groupBy(
    db
      .prepare(
        `SELECT ci.collection_id AS owner, item.uuid, ci.added_at FROM collection_item ci
         JOIN item ON item.id = ci.item_id
         ORDER BY ci.added_at, ci.item_id`,
      )
      .all() as { owner: number; uuid: string; added_at: string }[],
  );
  const rows = db
    .prepare(
      `SELECT id, uuid, name, created_at, updated_at FROM collection
       ORDER BY natural_key(name_key), name_key`,
    )
    .all() as { id: number; uuid: string; name: string; created_at: string; updated_at: string }[];
  return rows.map((row) => ({
    uuid: row.uuid,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (members.get(row.id) ?? []).map(({ uuid, added_at }) => ({ uuid, addedAt: added_at })),
  }));
}

/** The rows of each owner, in their order. */
function groupBy<T extends { owner: number }>(rows: readonly T[]): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const row of rows) {
    const group = groups.get(row.owner);
    if (group === undefined) groups.set(row.owner, [row]);
    else group.push(row);
  }
  return groups;
}
