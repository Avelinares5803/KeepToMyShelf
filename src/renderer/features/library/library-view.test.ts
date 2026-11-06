import { describe, expect, it } from 'vitest';
import { ITEM_SORT_FIELDS } from '../../../core/filters/item-sort';
import { addCondition, NO_ADVANCED_FILTERS, setField, setValue } from './advanced-filters';
import {
  activeFilterCount,
  activeFilterTree,
  clearedActiveFilter,
  INITIAL_LIBRARY_VIEW,
  libraryViewOf,
  reversedSort,
  sortByField,
} from './library-view';
import { NO_SIMPLE_FILTERS } from './simple-filters';

const rowAdded = addCondition(NO_ADVANCED_FILTERS, 0);

describe('library view', () => {
  it('starts empty, in title order', () => {
    expect(libraryViewOf({}, 'game')).toEqual({
      search: '',
      sort: { field: 'title', direction: 'asc' },
      filterMode: 'simple',
      filters: NO_SIMPLE_FILTERS,
      advanced: NO_ADVANCED_FILTERS,
      filtersOpen: false,
      anchor: null,
    });
  });

  describe('with both kinds of filters', () => {
    const advanced = setValue(
      setField(rowAdded, rowAdded.children[0]!.id, 'game', 'favorite'),
      rowAdded.children[0]!.id,
      true,
    );
    const view = {
      ...INITIAL_LIBRARY_VIEW,
      filters: { ...NO_SIMPLE_FILTERS, replay: true, status: ['completed' as const] },
      advanced,
    };

    it('applies only the mode in use, ignoring the other one', () => {
      expect(JSON.stringify(activeFilterTree('game', view))).toContain('"replay"');
      expect(JSON.stringify(activeFilterTree('game', view))).not.toContain('"favorite"');

      const usingAdvanced = { ...view, filterMode: 'advanced' as const };
      expect(JSON.stringify(activeFilterTree('game', usingAdvanced))).toContain('"favorite"');
      expect(JSON.stringify(activeFilterTree('game', usingAdvanced))).not.toContain('"replay"');
    });

    it('counts only the mode in use', () => {
      expect(activeFilterCount('game', view)).toBe(2);
      expect(activeFilterCount('game', { ...view, filterMode: 'advanced' })).toBe(1);
    });

    it('empties only the mode in use', () => {
      expect(clearedActiveFilter(view)).toEqual({ filters: NO_SIMPLE_FILTERS });
      expect(clearedActiveFilter({ ...view, filterMode: 'advanced' })).toEqual({
        advanced: NO_ADVANCED_FILTERS,
      });
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
