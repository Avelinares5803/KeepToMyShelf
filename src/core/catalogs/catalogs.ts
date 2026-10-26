import type { ItemKind } from '../../shared/content';
import { ValidationError } from '../errors';
import { characterCount, cleanSingleLine } from '../text/clean-text';

/** Lists of reusable values shared by the items of a profile. */
export const CATALOGS = [
  'platform',
  'game_genre',
  'screen_genre',
  'tag',
  'region',
  'company',
  'person',
  'franchise',
] as const;
export type Catalog = (typeof CATALOGS)[number];

/** Movie/series genres can be limited to one of the two kinds; null means both. */
export type GenreScope = 'movie' | 'series';

/** Roles a catalog value can play in an item. */
export const ITEM_ROLES = [
  'released_on',
  'owned_on',
  'genre',
  'franchise',
  'developer',
  'publisher',
  'producer',
  'director',
  'composer',
  'actor',
  'tag',
] as const;
export type ItemRole = (typeof ITEM_ROLES)[number];

/** Which catalog provides the values of each role, per item kind (in form order). */
const ROLE_CATALOGS: Record<ItemKind, Partial<Record<ItemRole, Catalog>>> = {
  game: {
    franchise: 'franchise',
    owned_on: 'platform',
    released_on: 'platform',
    genre: 'game_genre',
    developer: 'company',
    publisher: 'company',
    composer: 'person',
    tag: 'tag',
  },
  movie: {
    franchise: 'franchise',
    genre: 'screen_genre',
    director: 'person',
    actor: 'person',
    composer: 'person',
    producer: 'company',
    tag: 'tag',
  },
  series: {
    franchise: 'franchise',
    genre: 'screen_genre',
    director: 'person',
    actor: 'person',
    composer: 'person',
    producer: 'company',
    tag: 'tag',
  },
};

/** The roles an item of `kind` can have, in the order the form shows them. */
export function rolesForKind(kind: ItemKind): ItemRole[] {
  return Object.keys(ROLE_CATALOGS[kind]) as ItemRole[];
}

/** The catalog that provides the values of `role` for items of `kind`, or null if not allowed. */
export function catalogForRole(kind: ItemKind, role: ItemRole): Catalog | null {
  return ROLE_CATALOGS[kind][role] ?? null;
}

/** Whether a movie/series genre limited to `scope` can be used for an item of `kind`. */
export function isScopeCompatible(scope: GenreScope | null, kind: ItemKind): boolean {
  return scope === null || scope === kind;
}

export const CATALOG_NAME_MAX_LENGTH = 200;

/** Cleans a catalog value typed by the user. Case and accents are kept as typed. */
export function normalizeCatalogName(raw: string): string {
  const name = cleanSingleLine(raw);
  if (name === null) {
    throw new ValidationError('catalog.name_invalid_characters', 'Name has control characters');
  }
  if (name.length === 0) {
    throw new ValidationError('catalog.name_empty', 'Name is empty');
  }
  if (characterCount(name) > CATALOG_NAME_MAX_LENGTH) {
    throw new ValidationError('catalog.name_too_long', 'Name is too long');
  }
  return name;
}
