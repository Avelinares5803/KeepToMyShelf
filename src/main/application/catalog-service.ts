import { normalizeCatalogName, type Catalog, type GenreScope } from '../../core/catalogs/catalogs';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { normalizeForSearch } from '../../core/text/normalize';
import type { CatalogEntrySummary } from '../../shared/catalogs';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import type { SessionManager } from './session-manager';

interface EntryRow {
  id: number;
  catalog: Catalog;
  name: string;
  scope: GenreScope | null;
  total: number;
  game: number;
  movie: number;
  series: number;
}

export interface CatalogEntryInput {
  readonly name: string;
  /** Only for movie/series genres; null means both. */
  readonly scope: GenreScope | null;
}

// Items that use each value, by kind. A value can be used through item_entry (any catalog)
// or as the region of a release date. Items in the trash are counted too.
const USAGE_QUERY = `
  WITH usage AS (
    SELECT entry_id, item_id FROM item_entry
    UNION
    SELECT region_id, item_id FROM item_release WHERE region_id IS NOT NULL
  )
  SELECT e.id, e.catalog, e.name, e.scope,
         COUNT(DISTINCT i.id) AS total,
         COUNT(DISTINCT CASE WHEN i.kind = 'game' THEN i.id END) AS game,
         COUNT(DISTINCT CASE WHEN i.kind = 'movie' THEN i.id END) AS movie,
         COUNT(DISTINCT CASE WHEN i.kind = 'series' THEN i.id END) AS series
  FROM catalog_entry e
  LEFT JOIN usage u ON u.entry_id = e.id
  LEFT JOIN item i ON i.id = u.item_id`;

const toSummary = (row: EntryRow): CatalogEntrySummary => ({
  id: row.id,
  catalog: row.catalog,
  name: row.name,
  scope: row.scope,
  usage: { total: row.total, game: row.game, movie: row.movie, series: row.series },
});

/** The reusable values (catalogs) of the open profile. */
export class CatalogService {
  constructor(private readonly deps: { readonly sessions: SessionManager }) {}

  /** Values of one catalog, ordered by name ignoring case and accents. */
  list(token: string, catalog: Catalog): CatalogEntrySummary[] {
    const rows = this.db(token)
      .prepare(`${USAGE_QUERY} WHERE e.catalog = ? GROUP BY e.id ORDER BY e.name_key, e.name`)
      .all(catalog) as EntryRow[];
    return rows.map(toSummary);
  }

  create(token: string, catalog: Catalog, input: CatalogEntryInput): CatalogEntrySummary {
    const db = this.db(token);
    const name = normalizeCatalogName(input.name);
    assertScopeAllowed(catalog, input.scope);
    this.assertNameFree(db, catalog, name, null);

    const result = db
      .prepare('INSERT INTO catalog_entry (catalog, name, name_key, scope) VALUES (?, ?, ?, ?)')
      .run(catalog, name, normalizeForSearch(name), input.scope);
    return this.read(db, Number(result.lastInsertRowid));
  }

  /** Renames a value (all items that use it show the new name) and/or changes its scope. */
  update(token: string, id: number, input: CatalogEntryInput): CatalogEntrySummary {
    const db = this.db(token);
    const current = this.read(db, id);
    const name = normalizeCatalogName(input.name);
    assertScopeAllowed(current.catalog, input.scope);
    this.assertNameFree(db, current.catalog, name, id);

    db.prepare('UPDATE catalog_entry SET name = ?, name_key = ?, scope = ? WHERE id = ?').run(
      name,
      normalizeForSearch(name),
      input.scope,
      id,
    );
    return this.read(db, id);
  }

  /**
   * Deletes a value. It disappears from the items that used it (the items are kept); release
   * dates of a deleted region are kept without a region.
   */
  delete(token: string, id: number): void {
    const db = this.db(token);
    this.read(db, id);
    db.prepare('DELETE FROM catalog_entry WHERE id = ?').run(id);
  }

  /** Deletes the values of a catalog that no item uses; returns how many were deleted. */
  deleteUnused(token: string, catalog: Catalog): number {
    return this.db(token)
      .prepare(
        `DELETE FROM catalog_entry
         WHERE catalog = ?
           AND id NOT IN (SELECT entry_id FROM item_entry)
           AND id NOT IN (SELECT region_id FROM item_release WHERE region_id IS NOT NULL)`,
      )
      .run(catalog).changes;
  }

  private db(token: string): SqliteDatabase {
    return this.deps.sessions.require(token).db;
  }

  private read(db: SqliteDatabase, id: number): CatalogEntrySummary {
    const row = db.prepare(`${USAGE_QUERY} WHERE e.id = ? GROUP BY e.id`).get(id) as
      EntryRow | undefined;
    if (!row) {
      throw new NotFoundError('catalog.not_found', `Catalog value ${id} does not exist`);
    }
    return toSummary(row);
  }

  // Exact text comparison: values that differ in case or accents can coexist.
  private assertNameFree(
    db: SqliteDatabase,
    catalog: Catalog,
    name: string,
    exceptId: number | null,
  ): void {
    const existing = db
      .prepare('SELECT id FROM catalog_entry WHERE catalog = ? AND name = ?')
      .pluck()
      .get(catalog, name) as number | undefined;
    if (existing !== undefined && existing !== exceptId) {
      throw new ConflictError('catalog.duplicate_name', `"${name}" already exists in ${catalog}`);
    }
  }
}

function assertScopeAllowed(catalog: Catalog, scope: GenreScope | null): void {
  if (scope !== null && catalog !== 'screen_genre') {
    throw new ValidationError('catalog.scope_not_allowed', 'Only movie/series genres have a scope');
  }
}
