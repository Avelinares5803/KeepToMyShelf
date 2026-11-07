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
