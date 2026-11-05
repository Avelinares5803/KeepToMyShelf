import { describe, expect, it } from 'vitest';
import { validateFilter } from '../../../core/filters/filter-tree';
import {
  countMarks,
  NO_SIMPLE_FILTERS,
  toFilterTree,
  toggled,
  withoutMissingValues,
  type SimpleFilters,
} from './simple-filters';

const filters = (change: Partial<SimpleFilters>): SimpleFilters => ({
  ...NO_SIMPLE_FILTERS,
  ...change,
});
const is = (field: string, value: string | number | boolean) => ({
  type: 'condition',
  field,
  operator: 'is',
  value,
});
const or = (...children: object[]) => ({ type: 'group', op: 'or', children });
const and = (...children: object[]) => ({ type: 'group', op: 'and', children });

describe('toFilterTree', () => {
  it('means nothing when nothing is marked', () => {
    expect(toFilterTree(NO_SIMPLE_FILTERS)).toBeUndefined();
    expect(toFilterTree(filters({ roles: { genre: [] } }))).toBeUndefined();
  });

  it('uses OR inside an attribute', () => {
    expect(toFilterTree(filters({ roles: { genre: [1, 2] } }))).toEqual(
      and(or(is('genre', 1), is('genre', 2))),
    );
  });

  it('uses AND between attributes', () => {
    expect(toFilterTree(filters({ status: ['completed'], roles: { tag: [7] } }))).toEqual(
      and(or(is('status', 'completed')), or(is('tag', 7))),
    );
  });

  it('treats each role apart, even with the same catalog', () => {
    expect(toFilterTree(filters({ roles: { owned_on: [3], released_on: [4] } }))).toEqual(
      and(or(is('owned_on', 3)), or(is('released_on', 4))),
    );
  });

  it('keeps "at least" and "not rated" as alternatives of one attribute', () => {
    expect(toFilterTree(filters({ minRating: 8, unrated: true }))).toEqual(
      and(
        or(
          { type: 'condition', field: 'rating', operator: 'gte', value: 8 },
          { type: 'condition', field: 'rating', operator: 'isEmpty', value: null },
        ),
      ),
    );
  });

  it('turns the yes/no marks into rules only when marked', () => {
    expect(toFilterTree(filters({ favorite: true, replay: true }))).toEqual(
      and(or(is('favorite', true)), or(is('replay', true))),
    );
  });

  it('builds what the engine accepts, with every kind of mark', () => {
    const tree = toFilterTree({
      favorite: true,
      replay: true,
      status: ['completed', 'abandoned'],
      format: ['physical', 'digital'],
      minRating: 8,
      unrated: true,
      roles: { genre: [1], owned_on: [2] },
    });
    expect(validateFilter('game', tree!)).not.toBeNull();
  });
});

describe('countMarks', () => {
  it('counts every mark', () => {
    expect(countMarks(NO_SIMPLE_FILTERS)).toBe(0);
    expect(
      countMarks({
        favorite: true,
        replay: false,
        status: ['completed', 'abandoned'],
        format: ['digital'],
        minRating: 8,
        unrated: true,
        roles: { genre: [1, 2], tag: [3] },
      }),
    ).toBe(9);
  });
});

describe('toggled', () => {
  it('adds what is missing and takes out what is there', () => {
    expect(toggled([1, 2], 3)).toEqual([1, 2, 3]);
    expect(toggled([1, 2], 1)).toEqual([2]);
  });
});

describe('withoutMissingValues', () => {
  const genre = (id: number) => ({ id, name: `Género ${id}`, aliases: [] });

  it('takes out marks of values that no item uses', () => {
    const current = filters({ favorite: true, roles: { genre: [1, 2], tag: [9] } });
    expect(withoutMissingValues(current, { genre: [genre(1)] })).toEqual(
      filters({ favorite: true, roles: { genre: [1] } }),
    );
  });

  it('returns the same object when nothing is missing', () => {
    const current = filters({ roles: { genre: [1] } });
    expect(withoutMissingValues(current, { genre: [genre(1)] })).toBe(current);
    expect(withoutMissingValues(NO_SIMPLE_FILTERS, {})).toBe(NO_SIMPLE_FILTERS);
  });
});
