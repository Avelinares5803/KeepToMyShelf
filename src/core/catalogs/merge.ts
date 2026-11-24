import { ValidationError } from '../errors';
import { normalizeForSearch } from '../text/normalize';
import { CATALOG_MAX_ALIASES, type GenreScope } from './catalogs';

interface NamedEntry {
  readonly name: string;
  readonly aliases: readonly string[];
}

/**
 * The other names `target` gets when `source` is merged into it: the name of `source` and its
 * other names, without those that only differ in case or accents from one already there (the
 * search finds them anyway).
 */
export function aliasesGained(target: NamedEntry, source: NamedEntry): string[] {
  const keys = new Set([target.name, ...target.aliases].map(normalizeForSearch));
  const gained: string[] = [];
  for (const name of [source.name, ...source.aliases]) {
    const key = normalizeForSearch(name);
    if (keys.has(key)) continue;
    keys.add(key);
    gained.push(name);
  }
  return gained;
}

/** Every other name of `target` after the merge; fails rather than dropping any. */
export function mergeAliases(target: NamedEntry, source: NamedEntry): string[] {
  const aliases = [...target.aliases, ...aliasesGained(target, source)];
  if (aliases.length > CATALOG_MAX_ALIASES) {
    throw new ValidationError(
      'catalog.merge_too_many_aliases',
      'The merged value would have too many other names',
    );
  }
  return aliases;
}

/** Different scopes become "both", so no item is left with a genre that is not for its kind. */
export function mergeScope(a: GenreScope | null, b: GenreScope | null): GenreScope | null {
  return a === b ? a : null;
}

interface CountedEntry extends NamedEntry {
  readonly id: number;
  readonly usage: { readonly total: number };
}

export interface DuplicateSuggestion<T> {
  /** The value that would disappear. */
  readonly source: T;
  /** The value that would be kept. */
  readonly target: T;
  /** The names only differ in case or accents, or the source is another name of the target. */
  readonly by: 'name' | 'alias';
}

/**
 * Probable duplicates among the values of one catalog. Values whose names match are each paired
 * with the most used one; a value that is another name of a second value is paired with it.
 */
export function findDuplicates<T extends CountedEntry>(
  entries: readonly T[],
): DuplicateSuggestion<T>[] {
  const byName = new Map<string, T[]>();
  const byAlias = new Map<string, T[]>();
  const add = (map: Map<string, T[]>, key: string, entry: T) => {
    const group = map.get(key);
    if (group === undefined) map.set(key, [entry]);
    else if (!group.includes(entry)) group.push(entry);
  };
  for (const entry of entries) {
    add(byName, normalizeForSearch(entry.name), entry);
    for (const alias of entry.aliases) add(byAlias, normalizeForSearch(alias), entry);
  }

  const suggestions: DuplicateSuggestion<T>[] = [];
  for (const group of byName.values()) {
    const target = group.reduce((best, entry) =>
      entry.usage.total > best.usage.total ? entry : best,
    );
    for (const source of group) {
      if (source !== target) suggestions.push({ source, target, by: 'name' });
    }
  }

  const paired = new Set<string>();
  for (const source of entries) {
    const key = normalizeForSearch(source.name);
    for (const target of byAlias.get(key) ?? []) {
      // Values with the same name are already paired above.
      if (normalizeForSearch(target.name) === key) continue;
      // Each can be another name of the other: one suggestion is enough.
      const pair = [source.id, target.id].sort((a, b) => a - b).join('-');
      if (paired.has(pair)) continue;
      paired.add(pair);
      suggestions.push({ source, target, by: 'alias' });
    }
  }
  return suggestions;
}
