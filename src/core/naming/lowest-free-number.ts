/**
 * Smallest positive integer not present in `used`.
 *
 * Used for placeholder titles ("Untitled 3"): numbers freed by deleting or renaming an item
 * are reused. Callers must include items in the trash, so restoring one never collides.
 */
export function lowestFreeNumber(used: Iterable<number>): number {
  const taken = new Set(used);
  let candidate = 1;
  while (taken.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}
