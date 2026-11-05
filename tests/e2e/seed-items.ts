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
       finished_on, created_at, updated_at)
     VALUES (@uuid, @kind, @title, @titleNorm, @placeholder, @rating, @startedOn, @finishedOn,
       @createdAt, @createdAt)`,
  );
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
        createdAt: item.createdAt ?? '2026-01-01T00:00:00.000Z',
      }).lastInsertRowid;
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
