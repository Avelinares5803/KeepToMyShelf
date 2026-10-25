import { describe, expect, it } from 'vitest';
import { toOwnershipFlags, toOwnershipFormat, type OwnershipFormat } from './ownership';

describe('ownership format', () => {
  it.each<[OwnershipFormat | null, boolean, boolean]>([
    ['physical', true, false],
    ['digital', false, true],
    ['both', true, true],
    [null, false, false],
  ])('%s ↔ physical=%s digital=%s', (format, ownsPhysical, ownsDigital) => {
    expect(toOwnershipFlags(format)).toEqual({ ownsPhysical, ownsDigital });
    expect(toOwnershipFormat({ ownsPhysical, ownsDigital })).toBe(format);
  });
});
