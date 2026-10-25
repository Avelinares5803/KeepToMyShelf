import { ValidationError } from '../errors';
import { characterCount, cleanSingleLine } from '../text/clean-text';
import { normalizeForSearch } from '../text/normalize';

export const PROFILE_NAME_MAX_LENGTH = 40;

/**
 * Cleans and validates a profile name typed by the user: trims and collapses whitespace,
 * and rejects empty names, names longer than 40 characters and control characters.
 */
export function normalizeProfileName(raw: string): string {
  const name = cleanSingleLine(raw);
  if (name === null) {
    throw new ValidationError(
      'profile.name_invalid_characters',
      'Profile name has control characters',
    );
  }
  if (name.length === 0) {
    throw new ValidationError('profile.name_empty', 'Profile name is empty');
  }
  if (characterCount(name) > PROFILE_NAME_MAX_LENGTH) {
    throw new ValidationError(
      'profile.name_too_long',
      `Profile name exceeds ${PROFILE_NAME_MAX_LENGTH} characters`,
    );
  }
  return name;
}

/** Two names are the same profile name if they differ only in case, accents or spacing. */
export function profileNameKey(name: string): string {
  return normalizeForSearch(name);
}

export interface UniqueNameResult {
  readonly name: string;
  /** True when a suffix was added because the name was taken; the UI warns the user. */
  readonly renamed: boolean;
}

/**
 * Returns `desired` if no existing profile uses it; otherwise appends the lowest free
 * suffix: "Carlos" → "Carlos (1)" → "Carlos (2)". When renaming, callers must leave the
 * profile's own current name out of `existingNames`.
 */
export function resolveUniqueProfileName(
  desired: string,
  existingNames: Iterable<string>,
): UniqueNameResult {
  const taken = new Set([...existingNames].map(profileNameKey));
  if (!taken.has(profileNameKey(desired))) {
    return { name: desired, renamed: false };
  }
  let suffix = 1;
  while (taken.has(profileNameKey(`${desired} (${suffix})`))) {
    suffix += 1;
  }
  return { name: `${desired} (${suffix})`, renamed: true };
}
