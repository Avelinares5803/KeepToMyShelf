import { describe, expect, it } from 'vitest';
import type { Catalog } from '../../../core/catalogs/catalogs';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import { CATALOG_ORDER, initialCatalog, usageCount, visibleEntries } from './catalog-view';

const entry = (
  name: string,
  aliases: string[] = [],
  usage: Partial<CatalogEntrySummary['usage']> = {},
  catalog: Catalog = 'platform',
): CatalogEntrySummary => {
  const counts = { game: 0, movie: 0, series: 0, ...usage };
  return {
    id: name.length,
    catalog,
    name,
    aliases,
    scope: null,
    usage: { total: counts.game + counts.movie + counts.series, ...counts },
  };
};

const names = (entries: CatalogEntrySummary[]) => entries.map((e) => e.name);

describe('catalog view', () => {
  it('lists every catalog once', () => {
    expect(new Set(CATALOG_ORDER).size).toBe(8);
  });

  it('starts with platforms for video games and with genres for movies and series', () => {
    expect(initialCatalog('game')).toBe('platform');
    expect(initialCatalog(null)).toBe('platform');
    expect(initialCatalog('movie')).toBe('screen_genre');
    expect(initialCatalog('series')).toBe('screen_genre');
  });

  describe('search', () => {
    const platforms = [
      entry('Mega Drive', ['Sega Genesis']),
      entry('Nintendo DS', ['NDS']),
      entry('Pokémon Mini'),
    ];

    it('shows everything with an empty or blank query', () => {
      expect(visibleEntries(platforms, 'platform', null, '  ')).toHaveLength(3);
    });

    it('finds text anywhere in the name, ignoring case and accents', () => {
      expect(names(visibleEntries(platforms, 'platform', null, 'POKEMON'))).toEqual([
        'Pokémon Mini',
      ]);
      expect(names(visibleEntries(platforms, 'platform', null, 'drive'))).toEqual(['Mega Drive']);
    });

    it('finds values by their other names', () => {
      expect(names(visibleEntries(platforms, 'platform', null, 'genesis'))).toEqual(['Mega Drive']);
    });
  });

  describe('kind filter', () => {
    const people = [
      entry('Nobuo Uematsu', [], { game: 3 }, 'person'),
      entry('Ana de Armas', [], { movie: 2 }, 'person'),
      entry('Sin usar', [], {}, 'person'),
    ];

    it('shows only the values used by the chosen kind in shared catalogs', () => {
      expect(names(visibleEntries(people, 'person', 'game', ''))).toEqual(['Nobuo Uematsu']);
      expect(names(visibleEntries(people, 'person', null, ''))).toHaveLength(3);
    });

    it('does not filter catalogs that are not shared', () => {
      const platforms = [entry('SNES'), entry('PC', [], { game: 1 })];
      expect(visibleEntries(platforms, 'platform', 'movie', '')).toHaveLength(2);
    });

    it('counts the uses of the chosen kind, or all of them', () => {
      const composer = entry('Joe Hisaishi', [], { game: 1, movie: 4 }, 'person');
      expect(usageCount(composer, 'movie')).toBe(4);
      expect(usageCount(composer, null)).toBe(5);
    });
  });
});
