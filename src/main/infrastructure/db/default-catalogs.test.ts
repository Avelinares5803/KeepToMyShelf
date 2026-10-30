import { describe, expect, it } from 'vitest';
import { normalizeAliases, normalizeCatalogName } from '../../../core/catalogs/catalogs';
import { normalizeForSearch } from '../../../core/text/normalize';
import { DEFAULT_CATALOGS, DEFAULT_PLATFORM_ALIASES } from './default-catalogs';

describe('default catalogs', () => {
  it.each(Object.entries(DEFAULT_CATALOGS))(
    'have no repeated or unclean names (%s)',
    (_, lists) => {
      const all = [
        lists.platform,
        lists.game_genre,
        lists.screen_genre.map((e) => e.name),
        lists.region,
      ];
      for (const names of all) {
        expect(new Set(names).size).toBe(names.length);
        for (const name of names) expect(normalizeCatalogName(name)).toBe(name);
      }
    },
  );

  it('give aliases only to values of their list, in every language', () => {
    for (const lists of Object.values(DEFAULT_CATALOGS)) {
      const screenGenres = lists.screen_genre.map((e) => e.name);
      for (const name of Object.keys(DEFAULT_PLATFORM_ALIASES)) {
        expect(lists.platform).toContain(name);
      }
      for (const name of Object.keys(lists.game_genre_aliases)) {
        expect(lists.game_genre).toContain(name);
      }
      for (const name of Object.keys(lists.screen_genre_aliases)) {
        expect(screenGenres).toContain(name);
      }
    }
  });

  const allAliases = [
    DEFAULT_PLATFORM_ALIASES,
    ...Object.values(DEFAULT_CATALOGS).flatMap((lists) => [
      lists.game_genre_aliases,
      lists.screen_genre_aliases,
    ]),
  ];

  it('have clean aliases that are not contained in the name or another alias', () => {
    for (const [name, aliases] of allAliases.flatMap((list) => Object.entries(list))) {
      expect(normalizeAliases(name, aliases)).toEqual(aliases);

      const keys = [name, ...aliases].map(normalizeForSearch);
      keys.forEach((alias, i) => {
        if (i === 0) return;
        const others = keys.filter((_, j) => j !== i);
        expect(
          others.some((other) => other.includes(alias)),
          `"${aliases[i - 1]}" (${name}) adds nothing to the search`,
        ).toBe(false);
      });
    }
  });
});
