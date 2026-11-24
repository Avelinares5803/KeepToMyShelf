export interface CopySplit<T> {
  /** Values to add. */
  readonly added: readonly T[];
  /** How many are left out because a value with exactly the same name already exists. */
  readonly existing: number;
}

/**
 * Which values of one catalog are copied to another profile. Names are compared exactly, like
 * everywhere in the catalogs: those that only differ in case or accents, or that are another
 * name of an existing value, are copied, and merging them is suggested later.
 */
export function splitCopy<T extends { readonly name: string }>(
  source: readonly T[],
  existingNames: ReadonlySet<string>,
): CopySplit<T> {
  const added = source.filter((value) => !existingNames.has(value.name));
  return { added, existing: source.length - added.length };
}
