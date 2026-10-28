import type { ItemKind } from '../../shared/content';
import { normalizeCatalogName, rolesForKind, type ItemRole } from '../catalogs/catalogs';
import { createPartialDate, type PartialDate } from '../dates/partial-date';
import { ValidationError } from '../errors';

/**
 * A catalog value chosen in the item form: one that already exists, or a new name that is
 * created when the item is saved.
 */
export type EntryRef =
  | { readonly kind: 'existing'; readonly id: number }
  | { readonly kind: 'new'; readonly name: string };

/** The values of each role, in the order chosen by the user (e.g. main cast first). */
export type ItemRelationsDraft = Readonly<Partial<Record<ItemRole, readonly EntryRef[]>>>;

/** A release date, optionally for a region. */
export interface ReleaseDraft {
  readonly region: EntryRef | null;
  readonly date: PartialDate;
}

/** Sanity limits that protect against absurd input; they are not business limits. */
export const RELATION_LIMITS = {
  valuesPerRole: 500,
  releases: 100,
} as const;

/** Cleans a reference: new names are normalized like any catalog value. */
function cleanRef(ref: EntryRef): EntryRef {
  return ref.kind === 'new' ? { kind: 'new', name: normalizeCatalogName(ref.name) } : ref;
}

const sameRef = (a: EntryRef, b: EntryRef) =>
  a.kind === 'existing'
    ? b.kind === 'existing' && a.id === b.id
    : b.kind === 'new' && a.name === b.name;

/**
 * Validates the relations of an item of `kind`: every role must apply to the kind, and
 * repeated values in a role are dropped, keeping the first one.
 */
export function validateRelations(kind: ItemKind, raw: ItemRelationsDraft): ItemRelationsDraft {
  const allowed = rolesForKind(kind);
  const relations: Partial<Record<ItemRole, EntryRef[]>> = {};
  for (const [role, refs] of Object.entries(raw) as [ItemRole, readonly EntryRef[]][]) {
    if (refs.length === 0) continue;
    if (!allowed.includes(role)) {
      throw new ValidationError('item.role_not_allowed', `"${role}" does not apply to ${kind}`);
    }
    const unique: EntryRef[] = [];
    for (const ref of refs.map(cleanRef)) {
      if (!unique.some((other) => sameRef(other, ref))) unique.push(ref);
    }
    if (unique.length > RELATION_LIMITS.valuesPerRole) {
      throw new ValidationError('item.too_many_values', `Too many values for "${role}"`);
    }
    relations[role] = unique;
  }
  return relations;
}

/** Validates release dates; dates may come from outside, so each one is checked again. */
export function validateReleases(raw: readonly ReleaseDraft[]): ReleaseDraft[] {
  if (raw.length > RELATION_LIMITS.releases) {
    throw new ValidationError('item.too_many_releases', 'Too many release dates');
  }
  return raw.map(({ region, date }) => ({
    region: region === null ? null : cleanRef(region),
    date: createPartialDate(date.year, date.month, date.day),
  }));
}
