/**
 * What importing a library exported to JSON adds to a profile. Pure: it gets what the file
 * holds and what the profile already has, and decides; writing it is someone else's job.
 *
 * It only adds. An item or a collection whose UUID exists is never changed (a collection
 * only gains items), and a catalog value with exactly the same name is used as it is.
 */
import type { ItemKind } from '../../shared/content';
import type { ExportedCatalogEntry, ExportedItem, ExportedLibrary } from '../../shared/exports';
import type { ImportCounts } from '../../shared/imports';
import {
  catalogForRole,
  isScopeCompatible,
  normalizeAliases,
  normalizeCatalogName,
  type Catalog,
  type GenreScope,
  type ItemRole,
} from '../catalogs/catalogs';
import {
  collectionNameKey,
  normalizeCollectionName,
  uniqueCollectionName,
} from '../collections/collection-name';
import { parseIsoPartialDate } from '../dates/partial-date';
import { parseStoredUsageDate } from '../dates/usage-period';
import { AppError, ValidationError } from '../errors';
import { checkItemDraft, type ItemDraft, type ValidItemDraft } from '../items/item-draft';
import type { EntryRef } from '../items/item-relations';

/** What the profile already has, as far as an import is concerned. */
export interface ExistingLibrary {
  /** Of every item, also those in the trash. */
  readonly itemUuids: ReadonlySet<string>;
  /** The "Untitled" numbers in use, per kind (also in the trash). */
  readonly placeholders: Readonly<Record<ItemKind, ReadonlySet<number>>>;
  /** The scope of each catalog value, by `catalogEntryKey`. */
  readonly catalogEntries: ReadonlyMap<string, GenreScope | null>;
  /** The UUIDs of the items of each collection, by the collection's UUID. */
  readonly collections: ReadonlyMap<string, ReadonlySet<string>>;
  readonly collectionNameKeys: ReadonlySet<string>;
}

export interface PlannedItem {
  readonly uuid: string;
  readonly kind: ItemKind;
  readonly draft: ValidItemDraft;
  /** Only for untitled items: theirs if it is free here, otherwise the lowest free one. */
  readonly placeholderNumber: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface PlannedCollection {
  readonly uuid: string;
  /** Null for one that exists here, which keeps its name. */
  readonly create: {
    readonly name: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  } | null;
  /** The items it gains, by UUID. */
  readonly members: readonly { readonly uuid: string; readonly addedAt: string }[];
}

export interface LibraryImportPlan {
  readonly catalogEntries: readonly ExportedCatalogEntry[];
  /** Movie/series genres that exist here and must cover both kinds. */
  readonly widenedGenres: readonly string[];
  readonly items: readonly PlannedItem[];
  readonly collections: readonly PlannedCollection[];
  readonly counts: ImportCounts;
}

/** An item of the file breaks a rule of the app (`code`), so nothing can be imported. */
export class InvalidImportItemError extends ValidationError {
  constructor(
    code: string,
    message: string,
    /** Its position in the file, from 1. */
    readonly position: number,
    readonly title: string | null,
  ) {
    super(code, message);
  }
}

/** Identifies a catalog value: its names are unique within its catalog. */
export function catalogEntryKey(catalog: Catalog, name: string): string {
  return `${catalog}\u0000${name}`;
}

/** The file is not a library export the app can read. */
function invalidFile(message: string, cause?: unknown): AppError {
  return new AppError('import.invalid_file', message, cause === undefined ? {} : { cause });
}

/**
 * Decides what importing `file` adds to a profile that has `existing`. Throws
 * `InvalidImportItemError` for the first item to add that breaks a rule of the app, and
 * `import.invalid_file` when the file contradicts itself (a UUID twice, an invalid name…).
 */
export function planLibraryImport(
  file: ExportedLibrary,
  existing: ExistingLibrary,
): LibraryImportPlan {
  const entries = readCatalogEntries(file.catalogs);
  const { items, existingItems } = planItems(file.items, existing);

  // A value the items use but the file does not list (edited by hand) is created bare.
  const widened = new Set<string>();
  for (const item of items) {
    forEachEntryRef(item, (catalog, name) => {
      const key = catalogEntryKey(catalog, name);
      if (!existing.catalogEntries.has(key) && !entries.has(key)) {
        entries.set(key, { catalog, name, aliases: [], scope: null });
      }
      if (catalog !== 'screen_genre') return;
      // A genre limited to the other kind comes to cover both, as when merging two values.
      if (existing.catalogEntries.has(key)) {
        if (!isScopeCompatible(existing.catalogEntries.get(key) ?? null, item.kind)) {
          widened.add(name);
        }
      } else {
        const entry = entries.get(key)!;
        if (!isScopeCompatible(entry.scope, item.kind)) entries.set(key, { ...entry, scope: null });
      }
    });
  }
  const catalogEntries = [...entries].flatMap(([key, entry]) =>
    existing.catalogEntries.has(key) ? [] : [entry],
  );

  const { collections, counts: collectionCounts } = planCollections(file, existing, items);
  return {
    catalogEntries,
    widenedGenres: [...widened],
    items,
    collections,
    counts: {
      items: items.length,
      itemsInTrash: items.filter((item) => item.deletedAt !== null).length,
      existingItems,
      catalogValues: catalogEntries.length,
      ...collectionCounts,
      widenedGenres: widened.size,
    },
  };
}

/** The file's catalog values, cleaned like typed ones; the first of two equal names wins. */
function readCatalogEntries(
  raw: readonly ExportedCatalogEntry[],
): Map<string, ExportedCatalogEntry> {
  const entries = new Map<string, ExportedCatalogEntry>();
  for (const entry of raw) {
    let name: string;
    let aliases: string[];
    try {
      name = normalizeCatalogName(entry.name);
      aliases = normalizeAliases(name, entry.aliases);
    } catch (error) {
      throw invalidFile(`Invalid catalog value "${entry.name}" in ${entry.catalog}`, error);
    }
    if (entry.scope !== null && entry.catalog !== 'screen_genre') {
      throw invalidFile(`"${name}" of ${entry.catalog} cannot have a scope`);
    }
    const key = catalogEntryKey(entry.catalog, name);
    if (!entries.has(key))
      entries.set(key, { catalog: entry.catalog, name, aliases, scope: entry.scope });
  }
  return entries;
}

/** The items to add, checked with the rules of the item form, and how many already exist. */
function planItems(
  raw: readonly ExportedItem[],
  existing: ExistingLibrary,
): { items: PlannedItem[]; existingItems: number } {
  const seen = new Set<string>();
  const checked: { item: ExportedItem; draft: ValidItemDraft }[] = [];
  let existingItems = 0;
  raw.forEach((item, index) => {
    if (seen.has(item.uuid)) throw invalidFile(`Item ${item.uuid} appears twice`);
    seen.add(item.uuid);
    if (existing.itemUuids.has(item.uuid)) {
      existingItems++;
      return;
    }
    checked.push({ item, draft: checkItem(item, index + 1) });
  });

  // Numbers kept first, so a number given to another item never takes one that was free.
  const used: Record<ItemKind, Set<number>> = {
    game: new Set(existing.placeholders.game),
    movie: new Set(existing.placeholders.movie),
    series: new Set(existing.placeholders.series),
  };
  const kept = checked.map(({ item, draft }) => {
    const number = item.placeholderNumber;
    if (draft.title !== null || number === null || used[item.kind].has(number)) return null;
    used[item.kind].add(number);
    return number;
  });
  const nextFree: Record<ItemKind, number> = { game: 1, movie: 1, series: 1 };
  const items = checked.map(({ item, draft }, index): PlannedItem => {
    let placeholderNumber = kept[index] ?? null;
    if (draft.title === null && placeholderNumber === null) {
      // Numbers are only ever taken, so the lowest free one never goes down.
      while (used[item.kind].has(nextFree[item.kind])) nextFree[item.kind]++;
      placeholderNumber = nextFree[item.kind];
      used[item.kind].add(placeholderNumber);
    }
    return {
      uuid: item.uuid,
      kind: item.kind,
      draft,
      placeholderNumber,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      deletedAt: item.deletedAt,
    };
  });
  return { items, existingItems };
}

/** The item as the form would save it, or the first rule it breaks. */
function checkItem(item: ExportedItem, position: number): ValidItemDraft {
  const fail = (code: string, message: string) =>
    new InvalidImportItemError(
      code,
      `Item ${position} (${item.uuid}): ${message}`,
      position,
      item.title,
    );
  let draft: ItemDraft;
  try {
    draft = toItemDraft(item);
  } catch (error) {
    if (error instanceof ValidationError) throw fail(error.code, error.message);
    throw error;
  }
  const result = checkItemDraft(item.kind, draft);
  if (result.ok) return result.value;
  const [first] = result.errors;
  if (first === undefined) throw new Error('An item draft check failed without an error');
  throw fail(first.code, first.message);
}

/** The exported item as the item form would send it; dates are read here. */
function toItemDraft(item: ExportedItem): ItemDraft {
  const named = (name: string): EntryRef => ({ kind: 'new', name });
  return {
    title: item.title ?? '',
    alternateTitles: item.alternateTitles,
    description: item.description ?? '',
    notes: item.notes ?? '',
    isFavorite: item.isFavorite,
    rating: item.rating,
    status: item.status,
    isReplay: item.isReplay,
    ownsPhysical: item.ownsPhysical,
    ownsDigital: item.ownsDigital,
    startedOn: item.startedOn === null ? null : parseStoredUsageDate(item.startedOn),
    finishedOn: item.finishedOn === null ? null : parseStoredUsageDate(item.finishedOn),
    minutesPlayed: item.minutesPlayed,
    seasonsCount: item.seasonsCount,
    episodesCount: item.episodesCount,
    relations: Object.fromEntries(
      Object.entries(item.relations).map(([role, names]) => [role, (names ?? []).map(named)]),
    ),
    releases: item.releases.map(({ region, date }) => ({
      region: region === null ? null : named(region),
      date: parseIsoPartialDate(date),
    })),
  };
}

/** Calls `visit` with the catalog and the name of every value the item uses. */
function forEachEntryRef(item: PlannedItem, visit: (catalog: Catalog, name: string) => void): void {
  for (const [role, refs] of Object.entries(item.draft.relations) as [ItemRole, EntryRef[]][]) {
    // checkItemDraft only keeps roles that apply to the kind.
    const catalog = catalogForRole(item.kind, role)!;
    for (const ref of refs) if (ref.kind === 'new') visit(catalog, ref.name);
  }
  for (const { region } of item.draft.releases) {
    if (region?.kind === 'new') visit('region', region.name);
  }
}

/**
 * The collections to create and the items each one gains. Only items that exist after the
 * import count; the others (left out of the file by hand) are ignored.
 */
function planCollections(
  file: ExportedLibrary,
  existing: ExistingLibrary,
  items: readonly PlannedItem[],
): {
  collections: PlannedCollection[];
  counts: Pick<ImportCounts, 'collections' | 'updatedCollections' | 'renamedCollections'>;
} {
  const known = new Set([...existing.itemUuids, ...items.map((item) => item.uuid)]);
  const takenNames = new Set(existing.collectionNameKeys);
  const seen = new Set<string>();
  const collections: PlannedCollection[] = [];
  const counts = { collections: 0, updatedCollections: 0, renamedCollections: 0 };

  for (const collection of file.collections) {
    if (seen.has(collection.uuid)) throw invalidFile(`Collection ${collection.uuid} appears twice`);
    seen.add(collection.uuid);
    const current = existing.collections.get(collection.uuid);
    const added = new Set<string>();
    const members = collection.items.filter(({ uuid }) => {
      if (!known.has(uuid) || current?.has(uuid) === true || added.has(uuid)) return false;
      added.add(uuid);
      return true;
    });

    if (current !== undefined) {
      if (members.length === 0) continue;
      collections.push({ uuid: collection.uuid, create: null, members });
      counts.updatedCollections++;
      continue;
    }
    let desired: string;
    try {
      desired = normalizeCollectionName(collection.name);
    } catch (error) {
      throw invalidFile(`Invalid name of collection ${collection.uuid}`, error);
    }
    const { name, renamed } = uniqueCollectionName(desired, takenNames);
    takenNames.add(collectionNameKey(name));
    collections.push({
      uuid: collection.uuid,
      create: { name, createdAt: collection.createdAt, updatedAt: collection.updatedAt },
      members,
    });
    counts.collections++;
    if (renamed) counts.renamedCollections++;
  }
  return { collections, counts };
}
