import { ValidationError } from '../errors';
import { characterCount, cleanSingleLine } from '../text/clean-text';
import { normalizeForSearch } from '../text/normalize';

export const COLLECTION_NAME_MAX_LENGTH = 100;

/**
 * Cleans and validates a collection name typed by the user: trims and collapses whitespace,
 * and rejects empty names, names longer than 100 characters and control characters.
 */
export function normalizeCollectionName(raw: string): string {
  const name = cleanSingleLine(raw);
  if (name === null) {
    throw new ValidationError(
      'collection.name_invalid_characters',
      'Collection name has control characters',
    );
  }
  if (name.length === 0) {
    throw new ValidationError('collection.name_empty', 'Collection name is empty');
  }
  if (characterCount(name) > COLLECTION_NAME_MAX_LENGTH) {
    throw new ValidationError(
      'collection.name_too_long',
      `Collection name exceeds ${COLLECTION_NAME_MAX_LENGTH} characters`,
    );
  }
  return name;
}

/**
 * Two names are the same collection name if they differ only in case or accents: they could
 * not be told apart when choosing a collection.
 */
export function collectionNameKey(name: string): string {
  return normalizeForSearch(name);
}

/**
 * `desired` if no collection uses that name yet (by `collectionNameKey`); otherwise the name
 * with the lowest free suffix, "Favoritas (1)", "Favoritas (2)"… shortened if needed so it
 * still fits in 100 characters.
 */
export function uniqueCollectionName(
  desired: string,
  takenKeys: ReadonlySet<string>,
): { readonly name: string; readonly renamed: boolean } {
  if (!takenKeys.has(collectionNameKey(desired))) return { name: desired, renamed: false };
  const characters = [...desired];
  for (let number = 1; ; number++) {
    const suffix = ` (${number})`;
    const base = characters
      .slice(0, COLLECTION_NAME_MAX_LENGTH - suffix.length)
      .join('')
      .trimEnd();
    const name = `${base}${suffix}`;
    if (!takenKeys.has(collectionNameKey(name))) return { name, renamed: true };
  }
}
