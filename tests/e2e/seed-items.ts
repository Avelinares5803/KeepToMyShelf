import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { normalizeForSearch } from '../../src/core/text/normalize';

export interface SeedItem {
  readonly title?: string;
  readonly placeholder?: number;
  readonly kind?: string;
  readonly rating?: number;
  readonly startedOn?: string;
  readonly finishedOn?: string;
  readonly createdAt?: string;
  readonly alternateTitle?: string;
  readonly releaseDate?: string;
  readonly status?: string;
  readonly favorite?: boolean;
  readonly replay?: boolean;
  readonly physical?: boolean;
  readonly digital?: boolean;
  /** Catalog values, created if they do not exist yet. */
  readonly entries?: readonly SeedEntry[];
}

export interface SeedEntry {
  readonly role: string;
  readonly catalog: string;
  readonly name: string;
  readonly aliases?: readonly string[];
}

/**
 * Writes items straight into the open profile's database, which is much faster than filling
 * in the form for each one. The screen reads them the next time it asks for the list.
 */
export function seedItems(dataDir: string, items: readonly SeedItem[]): void {
  const profilesDir = join(dataDir, 'profiles');
  const [profileId] = readdirSync(profilesDir);
  const db = new Database(join(profilesDir, profileId!, 'library.db'));
  const insert = db.prepare(
    `INSERT INTO item (uuid, kind, title, title_norm, placeholder_no, rating, started_on,
       finished_on, status, is_favorite, is_replay, owns_physical, owns_digital, created_at,
       updated_at)
     VALUES (@uuid, @kind, @title, @titleNorm, @placeholder, @rating, @startedOn, @finishedOn,
       @status, @favorite, @replay, @physical, @digital, @createdAt, @createdAt)`,
  );
  const entryId = (entry: SeedEntry): number => {
    const found = db
      .prepare('SELECT id FROM catalog_entry WHERE catalog = ? AND name = ?')
      .get(entry.catalog, entry.name) as { id: number } | undefined;
    if (found) return found.id;
    const id = Number(
      db
        .prepare('INSERT INTO catalog_entry (catalog, name, name_key) VALUES (?, ?, ?)')
        .run(entry.catalog, entry.name, normalizeForSearch(entry.name)).lastInsertRowid,
    );
    for (const alias of entry.aliases ?? []) {
      db.prepare('INSERT INTO catalog_entry_alias (entry_id, name, name_key) VALUES (?, ?, ?)').run(
        id,
        alias,
        normalizeForSearch(alias),
      );
    }
    return id;
  };
  db.transaction(() => {
    items.forEach((item, index) => {
      const id = insert.run({
        uuid: `seed-${index}-${Math.random()}`,
        kind: item.kind ?? 'game',
        title: item.title ?? null,
        titleNorm: item.title === undefined ? null : normalizeForSearch(item.title),
        placeholder: item.placeholder ?? null,
        rating: item.rating ?? null,
        startedOn: item.startedOn ?? null,
        finishedOn: item.finishedOn ?? null,
        status: item.status ?? null,
        favorite: item.favorite ? 1 : 0,
        replay: item.replay ? 1 : 0,
        physical: item.physical ? 1 : 0,
        digital: item.digital ? 1 : 0,
        createdAt: item.createdAt ?? '2026-01-01T00:00:00.000Z',
      }).lastInsertRowid;
      for (const entry of item.entries ?? []) {
        db.prepare('INSERT INTO item_entry (item_id, entry_id, role) VALUES (?, ?, ?)').run(
          id,
          entryId(entry),
          entry.role,
        );
      }
      if (item.alternateTitle !== undefined) {
        db.prepare('INSERT INTO item_alt_title (item_id, title, title_norm) VALUES (?, ?, ?)').run(
          id,
          item.alternateTitle,
          normalizeForSearch(item.alternateTitle),
        );
      }
      if (item.releaseDate !== undefined) {
        db.prepare('INSERT INTO item_release (item_id, date) VALUES (?, ?)').run(
          id,
          item.releaseDate,
        );
      }
    });
  })();
  db.close();
}
