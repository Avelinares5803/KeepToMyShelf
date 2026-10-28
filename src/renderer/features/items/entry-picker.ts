import { isScopeCompatible } from '../../../core/catalogs/catalogs';
import { cleanSingleLine } from '../../../core/text/clean-text';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import type { ItemKind } from '../../../shared/content';
import { matchEntry, type SearchMatch } from '../catalogs/catalog-view';

/** A value chosen in the form: an existing one (with its name, to show it) or a new name. */
export type EntryChoice =
  | { readonly kind: 'existing'; readonly id: number; readonly name: string }
  | { readonly kind: 'new'; readonly name: string };

export interface Suggestion {
  readonly entry: CatalogEntrySummary;
  readonly match: SearchMatch;
}

/** How many suggestions are listed at most. */
export const MAX_SUGGESTIONS = 50;

/** Text typed in the picker, cleaned like a catalog name; null if it cannot be one. */
function cleanTyped(text: string): string | null {
  const clean = cleanSingleLine(text);
  return clean === null || clean === '' ? null : clean;
}

const isChosen = (chosen: readonly EntryChoice[], entry: CatalogEntrySummary) =>
  chosen.some((choice) => choice.kind === 'existing' && choice.id === entry.id);

/**
 * Values to suggest for the typed text: not chosen yet, available for the item's kind (movie
 * and series genres can be limited to one of them), matching by name or by other name.
 * Values whose name starts with the text come first; the rest keep the catalog's order.
 */
export function suggestionsFor(
  entries: readonly CatalogEntrySummary[],
  chosen: readonly EntryChoice[],
  kind: ItemKind,
  text: string,
): Suggestion[] {
  const key = normalizeForSearch(text);
  const suggestions: Suggestion[] = [];
  for (const entry of entries) {
    if (isChosen(chosen, entry) || !isScopeCompatible(entry.scope, kind)) continue;
    const match = matchEntry(entry, key);
    if (match) suggestions.push({ entry, match });
  }
  const startsWithKey = (s: Suggestion) =>
    normalizeForSearch(s.entry.name).startsWith(key) ? 0 : 1;
  return suggestions.sort((a, b) => startsWithKey(a) - startsWithKey(b)).slice(0, MAX_SUGGESTIONS);
}

/**
 * The name "Create «…»" would create, or null when there is nothing to create: the text is
 * empty, a value with exactly that name exists, or it is already chosen as a new value.
 */
export function nameToCreate(
  entries: readonly CatalogEntrySummary[],
  chosen: readonly EntryChoice[],
  text: string,
): string | null {
  const name = cleanTyped(text);
  if (name === null || entries.some((entry) => entry.name === name)) return null;
  return chosen.some((choice) => choice.name === name) ? null : name;
}

/**
 * What pressing Enter without a highlighted suggestion adds: only a value whose name is
 * exactly the typed text. A similar suggestion is never chosen, and nothing is created.
 */
export function exactChoice(
  entries: readonly CatalogEntrySummary[],
  chosen: readonly EntryChoice[],
  text: string,
): EntryChoice | null {
  const name = cleanTyped(text);
  const entry = entries.find((candidate) => candidate.name === name);
  return entry === undefined || isChosen(chosen, entry)
    ? null
    : { kind: 'existing', id: entry.id, name: entry.name };
}

/** Moves the choice at `index` one place earlier (-1) or later (+1). */
export function moveChoice<T>(choices: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= choices.length) return [...choices];
  const moved = [...choices];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];
  return moved;
}
