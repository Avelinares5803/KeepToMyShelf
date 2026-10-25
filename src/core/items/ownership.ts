/**
 * Format chosen by the user. Stored as two flags so that filtering by "physical" also finds
 * items owned in both formats.
 */
export type OwnershipFormat = 'physical' | 'digital' | 'both';

export interface OwnershipFlags {
  readonly ownsPhysical: boolean;
  readonly ownsDigital: boolean;
}

export function toOwnershipFlags(format: OwnershipFormat | null): OwnershipFlags {
  return {
    ownsPhysical: format === 'physical' || format === 'both',
    ownsDigital: format === 'digital' || format === 'both',
  };
}

export function toOwnershipFormat({
  ownsPhysical,
  ownsDigital,
}: OwnershipFlags): OwnershipFormat | null {
  if (ownsPhysical && ownsDigital) return 'both';
  if (ownsPhysical) return 'physical';
  if (ownsDigital) return 'digital';
  return null;
}
