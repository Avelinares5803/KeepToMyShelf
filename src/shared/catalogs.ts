import type { Catalog, GenreScope } from '../core/catalogs/catalogs';

/** A catalog value with how many items use it (items in the trash included). */
export interface CatalogEntrySummary {
  readonly id: number;
  readonly catalog: Catalog;
  readonly name: string;
  /** Other names the value is also known by, found when searching. */
  readonly aliases: readonly string[];
  readonly scope: GenreScope | null;
  readonly usage: {
    readonly total: number;
    readonly game: number;
    readonly movie: number;
    readonly series: number;
  };
}
