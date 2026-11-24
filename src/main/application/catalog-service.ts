import {
  CATALOGS,
  normalizeAliases,
  normalizeCatalogName,
  type Catalog,
  type GenreScope,
} from '../../core/catalogs/catalogs';
import { splitCopy, type CopySplit } from '../../core/catalogs/copy';
import { mergeAliases, mergeScope } from '../../core/catalogs/merge';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import { normalizeForSearch } from '../../core/text/normalize';
import type {
  CatalogCopyPreview,
  CatalogCopyResult,
  CatalogEntrySummary,
} from '../../shared/catalogs';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import {
  readLibraryCatalogs,
  type LibraryCatalogEntry,
} from '../infrastructure/db/library-catalogs-reader';
import type { DataPaths } from '../infrastructure/paths';
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
  /** Other names the value is also known by (e.g. "Genesis" for "Mega Drive"). */
  readonly aliases: readonly string[];
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

const toSummary = (row: EntryRow, aliases: string[]): CatalogEntrySummary => ({
  id: row.id,
  catalog: row.catalog,
  name: row.name,
  aliases,
  scope: row.scope,
  usage: { total: row.total, game: row.game, movie: row.movie, series: row.series },
});

export interface CatalogServiceDeps {
  readonly appDb: SqliteDatabase;
  readonly paths: DataPaths;
  readonly sessions: SessionManager;
}

/** The reusable values (catalogs) of the open profile. */
export class CatalogService {
  constructor(private readonly deps: CatalogServiceDeps) {}

  /** Values of one catalog, ordered by name ignoring case and accents, numbers by value. */
  list(token: string, catalog: Catalog): CatalogEntrySummary[] {
    const db = this.db(token);
    const rows = db
      .prepare(
        `${USAGE_QUERY} WHERE e.catalog = ? GROUP BY e.id
         ORDER BY natural_key(e.name_key), e.name_key, e.name`,
      )
      .all(catalog) as EntryRow[];

    const aliases = new Map<number, string[]>();
    const aliasRows = db
      .prepare(
        `SELECT a.entry_id, a.name FROM catalog_entry_alias a
         JOIN catalog_entry e ON e.id = a.entry_id
         WHERE e.catalog = ? ORDER BY a.id`,
      )
      .all(catalog) as { entry_id: number; name: string }[];
    for (const { entry_id, name } of aliasRows) {
      aliases.set(entry_id, [...(aliases.get(entry_id) ?? []), name]);
    }

    return rows.map((row) => toSummary(row, aliases.get(row.id) ?? []));
  }

  create(token: string, catalog: Catalog, input: CatalogEntryInput): CatalogEntrySummary {
    const db = this.db(token);
    const name = normalizeCatalogName(input.name);
    const aliases = normalizeAliases(name, input.aliases);
    assertScopeAllowed(catalog, input.scope);
    this.assertNameFree(db, catalog, name, null);

    const id = db.transaction(() =>
      insertEntry(db, { catalog, name, aliases, scope: input.scope }),
    )();
    return this.read(db, id);
  }

  /** Renames a value (all items that use it show the new name), its other names and scope. */
  update(token: string, id: number, input: CatalogEntryInput): CatalogEntrySummary {
    const db = this.db(token);
    const current = this.read(db, id);
    const name = normalizeCatalogName(input.name);
    const aliases = normalizeAliases(name, input.aliases);
    assertScopeAllowed(current.catalog, input.scope);
    this.assertNameFree(db, current.catalog, name, id);

    db.transaction(() => {
      db.prepare('UPDATE catalog_entry SET name = ?, name_key = ?, scope = ? WHERE id = ?').run(
        name,
        normalizeForSearch(name),
        input.scope,
        id,
      );
      writeAliases(db, id, aliases);
    })();
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

  /**
   * Merges `sourceId` into `targetId`, of the same catalog: its items, release dates and names
   * pass to the kept value, and it disappears. All or nothing.
   */
  merge(token: string, sourceId: number, targetId: number): CatalogEntrySummary {
    const db = this.db(token);
    if (sourceId === targetId) {
      throw new ValidationError('catalog.merge_same_value', 'Cannot merge a value with itself');
    }
    db.transaction(() => {
      const source = this.read(db, sourceId);
      const target = this.read(db, targetId);
      if (source.catalog !== target.catalog) {
        throw new ValidationError(
          'catalog.merge_other_catalog',
          `Value ${sourceId} is in ${source.catalog} and ${targetId} in ${target.catalog}`,
        );
      }
      const aliases = mergeAliases(target, source);

      // An item with both values in a role keeps the link, and the position, of the target:
      // the link that cannot move is deleted with the source.
      db.prepare('UPDATE OR IGNORE item_entry SET entry_id = ? WHERE entry_id = ?').run(
        targetId,
        sourceId,
      );
      // Two releases that would become identical are kept once.
      db.prepare(
        `DELETE FROM item_release
         WHERE region_id = ? AND EXISTS (
           SELECT 1 FROM item_release kept
           WHERE kept.item_id = item_release.item_id
             AND kept.date = item_release.date
             AND kept.region_id = ?
         )`,
      ).run(sourceId, targetId);
      db.prepare('UPDATE item_release SET region_id = ? WHERE region_id = ?').run(
        targetId,
        sourceId,
      );

      db.prepare('UPDATE catalog_entry SET scope = ? WHERE id = ?').run(
        mergeScope(target.scope, source.scope),
        targetId,
      );
      writeAliases(db, targetId, aliases);
      db.prepare('DELETE FROM catalog_entry WHERE id = ?').run(sourceId);
    })();
    return this.read(db, targetId);
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

  /** How many values of each catalog of another profile are new here, and how many exist. */
  previewCopy(token: string, sourceProfileId: string): CatalogCopyPreview[] {
    const db = this.db(token);
    const source = this.readOtherProfile(token, sourceProfileId);
    return CATALOGS.map((catalog) => {
      const { added, existing } = splitCatalog(db, source, catalog);
      return { catalog, added: added.length, existing };
    });
  }

  /**
   * Adds the values of some catalogs of another profile, with their other names and scope but
   * without links to items. Values that already exist with exactly the same name are left as
   * they are. All or nothing; the other profile is only read.
   */
  copyFrom(
    token: string,
    sourceProfileId: string,
    catalogs: readonly Catalog[],
  ): CatalogCopyResult {
    const db = this.db(token);
    const source = this.readOtherProfile(token, sourceProfileId);
    return db.transaction(() => {
      let copied = 0;
      let existing = 0;
      for (const catalog of new Set(catalogs)) {
        const split = splitCatalog(db, source, catalog);
        for (const entry of split.added) insertEntry(db, entry);
        copied += split.added.length;
        existing += split.existing;
      }
      return { copied, existing };
    })();
  }

  private readOtherProfile(token: string, profileId: string): LibraryCatalogEntry[] {
    if (this.deps.sessions.require(token).profileId === profileId) {
      throw new ValidationError('catalog.copy_same_profile', 'The source is the open profile');
    }
    if (!this.deps.appDb.prepare('SELECT 1 FROM profile WHERE id = ?').get(profileId)) {
      throw new NotFoundError('profile.not_found', `Profile ${profileId} does not exist`);
    }
    return readLibraryCatalogs(this.deps.paths.libraryDatabase(profileId));
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
    const aliases = db
      .prepare('SELECT name FROM catalog_entry_alias WHERE entry_id = ? ORDER BY id')
      .pluck()
      .all(id) as string[];
    return toSummary(row, aliases);
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

/** The values of one catalog of another library, against those of the open one. */
function splitCatalog(
  db: SqliteDatabase,
  source: readonly LibraryCatalogEntry[],
  catalog: Catalog,
): CopySplit<LibraryCatalogEntry> {
  const names = db
    .prepare('SELECT name FROM catalog_entry WHERE catalog = ?')
    .pluck()
    .all(catalog) as string[];
  return splitCopy(
    source.filter((entry) => entry.catalog === catalog),
    new Set(names),
  );
}

/** Adds a value with its other names; returns its id. */
function insertEntry(db: SqliteDatabase, entry: LibraryCatalogEntry): number {
  const result = db
    .prepare('INSERT INTO catalog_entry (catalog, name, name_key, scope) VALUES (?, ?, ?, ?)')
    .run(entry.catalog, entry.name, normalizeForSearch(entry.name), entry.scope);
  const id = Number(result.lastInsertRowid);
  writeAliases(db, id, entry.aliases);
  return id;
}

/** Replaces the other names of a value. */
function writeAliases(db: SqliteDatabase, entryId: number, aliases: readonly string[]): void {
  db.prepare('DELETE FROM catalog_entry_alias WHERE entry_id = ?').run(entryId);
  const insert = db.prepare(
    'INSERT INTO catalog_entry_alias (entry_id, name, name_key) VALUES (?, ?, ?)',
  );
  for (const alias of aliases) insert.run(entryId, alias, normalizeForSearch(alias));
}
