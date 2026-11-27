import type { ItemStatus } from '../core/items/item-draft';
import type { ItemKind } from './content';

/** A catalog value and how many items have it. */
export interface CountedValue {
  readonly name: string;
  readonly count: number;
}

export interface FinishedYear {
  readonly year: number;
  readonly count: number;
}

/**
 * A summary of a profile's library, of one kind or of every kind. Items in the trash are never
 * counted. A section that does not apply to the kind asked for is null.
 */
export interface LibraryStats {
  readonly total: number;
  readonly byKind: Readonly<Record<ItemKind, number>>;
  readonly favorites: number;
  readonly replays: number;
  /** Items owned in each format; one owned in both counts in both. */
  readonly physical: number;
  readonly digital: number;
  /** `none`: items with no status. */
  readonly statuses: Readonly<Record<ItemStatus | 'none', number>>;
  readonly ratings: {
    /** `counts[n - 1]` is how many items are rated n (half stars, 1..10). */
    readonly counts: readonly number[];
    readonly unrated: number;
    /** Average of the rated items, in half stars (1..10); null when none is rated. */
    readonly average: number | null;
  };
  /** Games only: minutes played in all, and how many games have more than none. */
  readonly played: { readonly minutes: number; readonly games: number } | null;
  /** Items completed, by the year they were finished, the latest year first. */
  readonly finishedByYear: readonly FinishedYear[];
  /** Items completed whose end date is missing or unknown. */
  readonly finishedWithoutDate: number;
  /** Every value used, the most used first. */
  readonly gameGenres: readonly CountedValue[] | null;
  readonly screenGenres: readonly CountedValue[] | null;
  /** "My platforms" of the games. */
  readonly platforms: readonly CountedValue[] | null;
}
