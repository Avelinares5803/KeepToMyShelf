import type { Catalog } from '../../../core/catalogs/catalogs';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import type { ItemKind } from '../../../shared/content';

/** Order of the catalogs in the screen's side list. */
export const CATALOG_ORDER: readonly Catalog[] = [
  'platform',
  'game_genre',
  'screen_genre',
  'franchise',
  'company',
  'person',
  'tag',
  'region',
];

/** Catalogs shared by every kind, which can show only the values used by one kind. */
export const KIND_FILTERED_CATALOGS: readonly Catalog[] = ['franchise', 'company', 'person', 'tag'];

/** The kind whose values are shown, or null for all values (used or not). */
export type KindFilter = ItemKind | null;

/** The first catalog to show: platforms for video games, genres for movies and series. */
export function initialCatalog(kind: KindFilter): Catalog {
  return kind === 'movie' || kind === 'series' ? 'screen_genre' : 'platform';
}

/** Items that use a value: of the chosen kind, or of every kind. */
export function usageCount(entry: CatalogEntrySummary, kind: KindFilter): number {
  return kind === null ? entry.usage.total : entry.usage[kind];
}

export type SearchMatch =
  { readonly by: 'name' } | { readonly by: 'alias'; readonly alias: string };

/**
 * How a value matches a search key (already normalized with normalizeForSearch): by its
 * name, by one of its other names, or not at all (null). An empty key matches every value.
 */
export function matchEntry(entry: CatalogEntrySummary, key: string): SearchMatch | null {
  if (normalizeForSearch(entry.name).includes(key)) return { by: 'name' };
  const alias = entry.aliases.find((name) => normalizeForSearch(name).includes(key));
  return alias === undefined ? null : { by: 'alias', alias };
}

/**
 * The values to show. The search ignores case and accents and also looks in other names;
 * with a kind chosen, shared catalogs only show the values used by items of that kind.
 */
export function visibleEntries(
  entries: readonly CatalogEntrySummary[],
  catalog: Catalog,
  kind: KindFilter,
  query: string,
): CatalogEntrySummary[] {
  const key = normalizeForSearch(query);
  const byKind = kind !== null && KIND_FILTERED_CATALOGS.includes(catalog);
  return entries.filter(
    (entry) => (!byKind || entry.usage[kind] > 0) && matchEntry(entry, key) !== null,
  );
}
