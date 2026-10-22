import { ValidationError } from '../errors';
import { normalizeForSearch } from '../text/normalize';

export const PROFILE_NAME_MAX_LENGTH = 40;

const CONTROL_CHARACTERS = /\p{Cc}/u;
const WHITESPACE_RUNS = /\s+/g;

/**
 * Cleans and validates a profile name typed by the user: trims and collapses whitespace,
 * and rejects empty names, names longer than 40 characters and control characters.
 */
export function normalizeProfileName(raw: string): string {
  if (CONTROL_CHARACTERS.test(raw.replace(WHITESPACE_RUNS, ' '))) {
    throw new ValidationError(
      'profile.name_invalid_characters',
      'Profile name has control characters',
    );
  }
  const name = raw.normalize('NFC').replace(WHITESPACE_RUNS, ' ').trim();
  if (name.length === 0) {
    throw new ValidationError('profile.name_empty', 'Profile name is empty');
  }
  // Count characters (code points), not UTF-16 units, so emoji count as one.
  if ([...name].length > PROFILE_NAME_MAX_LENGTH) {
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
