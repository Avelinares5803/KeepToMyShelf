import { ITEM_STATUSES, type ItemStatus } from '../../../core/items/item-draft';
import { RATING_MAX } from '../../../core/items/rating';
import { ITEM_KINDS, type ItemKind } from '../../../shared/content';
import type { CountedValue, FinishedYear, LibraryStats } from '../../../shared/stats';
import type { SqliteDatabase } from './connection';

// Every query reads the items of the kind asked for (`@kind`, null for every kind), never those
// in the trash.
const ITEMS = 'item.deleted_at IS NULL AND (@kind IS NULL OR item.kind = @kind)';

interface TotalsRow {
  total: number;
  favorites: number;
  replays: number;
  physical: number;
  digital: number;
  unrated: number;
  average: number | null;
}

/** The statistics of a library, of one kind or (null) of every kind. */
export function readLibraryStats(db: SqliteDatabase, kind: ItemKind | null): LibraryStats {
  const totals = db
    .prepare(
      `SELECT count(*) AS total,
         coalesce(sum(is_favorite), 0) AS favorites,
         coalesce(sum(is_replay), 0) AS replays,
         coalesce(sum(owns_physical), 0) AS physical,
         coalesce(sum(owns_digital), 0) AS digital,
         count(*) - count(rating) AS unrated,
         avg(rating) AS average
       FROM item WHERE ${ITEMS}`,
    )
    .get({ kind }) as TotalsRow;

  const showsGames = kind === null || kind === 'game';
  const showsScreen = kind !== 'game';
  return {
    total: totals.total,
    byKind: countByKind(db, kind),
    favorites: totals.favorites,
    replays: totals.replays,
    physical: totals.physical,
    digital: totals.digital,
    statuses: countStatuses(db, kind),
    ratings: {
      counts: countRatings(db, kind),
      unrated: totals.unrated,
      average: totals.average,
    },
    played: showsGames ? readPlayed(db) : null,
    finishedByYear: countFinishedByYear(db, kind),
    finishedWithoutDate: countFinishedWithoutDate(db, kind),
    gameGenres: showsGames ? countValues(db, 'game', 'genre', 'game_genre') : null,
    screenGenres: showsScreen ? countValues(db, kind, 'genre', 'screen_genre') : null,
    platforms: showsGames ? countValues(db, 'game', 'owned_on', 'platform') : null,
  };
}

function countByKind(db: SqliteDatabase, kind: ItemKind | null): Record<ItemKind, number> {
  const counts = Object.fromEntries(ITEM_KINDS.map((each) => [each, 0])) as Record<
    ItemKind,
    number
  >;
  const rows = db
    .prepare(`SELECT kind, count(*) AS count FROM item WHERE ${ITEMS} GROUP BY kind`)
    .all({ kind }) as { kind: ItemKind; count: number }[];
  for (const row of rows) counts[row.kind] = row.count;
  return counts;
}

function countStatuses(
  db: SqliteDatabase,
  kind: ItemKind | null,
): Record<ItemStatus | 'none', number> {
  const counts = Object.fromEntries(
    [...ITEM_STATUSES, 'none'].map((status) => [status, 0]),
  ) as Record<ItemStatus | 'none', number>;
  const rows = db
    .prepare(`SELECT status, count(*) AS count FROM item WHERE ${ITEMS} GROUP BY status`)
    .all({ kind }) as { status: ItemStatus | null; count: number }[];
  for (const row of rows) counts[row.status ?? 'none'] = row.count;
  return counts;
}

function countRatings(db: SqliteDatabase, kind: ItemKind | null): number[] {
  const counts = Array.from({ length: RATING_MAX }, () => 0);
  const rows = db
    .prepare(
      `SELECT rating, count(*) AS count FROM item
       WHERE ${ITEMS} AND rating IS NOT NULL GROUP BY rating`,
    )
    .all({ kind }) as { rating: number; count: number }[];
  for (const row of rows) counts[row.rating - 1] = row.count;
  return counts;
}

// Games with 00:00 played are left out, so they do not lower the average.
function readPlayed(db: SqliteDatabase): { minutes: number; games: number } {
  return db
    .prepare(
      `SELECT coalesce(sum(minutes_played), 0) AS minutes, count(*) AS games FROM item
       WHERE ${ITEMS} AND minutes_played > 0`,
    )
    .get({ kind: 'game' }) as { minutes: number; games: number };
}

// An end date is "2021", "2021-03" or "2021-03-14": its year is its first four characters.
function countFinishedByYear(db: SqliteDatabase, kind: ItemKind | null): FinishedYear[] {
  return db
    .prepare(
      `SELECT CAST(substr(finished_on, 1, 4) AS INTEGER) AS year, count(*) AS count FROM item
       WHERE ${ITEMS} AND status = 'completed' AND finished_on GLOB '[0-9][0-9][0-9][0-9]*'
       GROUP BY year ORDER BY year DESC`,
    )
    .all({ kind }) as FinishedYear[];
}

function countFinishedWithoutDate(db: SqliteDatabase, kind: ItemKind | null): number {
  const row = db
    .prepare(
      `SELECT count(*) AS count FROM item
       WHERE ${ITEMS} AND status = 'completed'
         AND (finished_on IS NULL OR finished_on = 'unknown')`,
    )
    .get({ kind }) as { count: number };
  return row.count;
}

/** The values of a catalog the items have in a role, the most used first. */
function countValues(
  db: SqliteDatabase,
  kind: ItemKind | null,
  role: 'genre' | 'owned_on',
  catalog: 'game_genre' | 'screen_genre' | 'platform',
): CountedValue[] {
  return db
    .prepare(
      `SELECT entry.name AS name, count(*) AS count
       FROM item_entry
       JOIN item ON item.id = item_entry.item_id
       JOIN catalog_entry entry ON entry.id = item_entry.entry_id
       WHERE ${ITEMS} AND item_entry.role = @role AND entry.catalog = @catalog
       GROUP BY entry.id
       ORDER BY count DESC, entry.name_key, entry.name`,
    )
    .all({ kind, role, catalog }) as CountedValue[];
}
