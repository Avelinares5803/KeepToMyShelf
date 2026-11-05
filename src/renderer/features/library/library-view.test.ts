import { describe, expect, it } from 'vitest';
import { ITEM_SORT_FIELDS } from '../../../core/filters/item-sort';
import { INITIAL_LIBRARY_VIEW, libraryViewOf, reversedSort, sortByField } from './library-view';
import { NO_SIMPLE_FILTERS } from './simple-filters';

describe('library view', () => {
  it('starts empty, in title order', () => {
    expect(libraryViewOf({}, 'game')).toEqual({
      search: '',
      sort: { field: 'title', direction: 'asc' },
      filters: NO_SIMPLE_FILTERS,
      filtersOpen: false,
      anchor: null,
    });
  });

  it('keeps each kind apart', () => {
    const games = { ...INITIAL_LIBRARY_VIEW, search: 'zelda' };
    expect(libraryViewOf({ game: games }, 'game')).toBe(games);
    expect(libraryViewOf({ game: games }, 'movie')).toBe(INITIAL_LIBRARY_VIEW);
  });

  it('starts titles from A to Z and everything else from highest to lowest', () => {
    for (const field of ITEM_SORT_FIELDS) {
      expect(sortByField(field)).toEqual({
        field,
        direction: field === 'title' ? 'asc' : 'desc',
      });
    }
  });

  it('reverses the direction, keeping the field', () => {
    expect(reversedSort({ field: 'rating', direction: 'desc' })).toEqual({
      field: 'rating',
      direction: 'asc',
    });
    expect(reversedSort({ field: 'title', direction: 'asc' })).toEqual({
      field: 'title',
      direction: 'desc',
    });
  });
});
