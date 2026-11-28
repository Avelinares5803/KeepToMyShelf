import { describe, expect, it } from 'vitest';
import { ITEM_ROLES } from '../catalogs/catalogs';
import { MAX_HOURS_PLAYED } from '../items/duration';
import {
  FILTER_FIELDS,
  filterFieldFor,
  filterFieldsFor,
  isValidFilterValue,
  operatorsFor,
  type FilterSource,
} from './filter-fields';

const COMMON = [
  'status',
  'replay',
  'format',
  'rating',
  'favorite',
  'releaseYear',
  'finishedYear',
  'collection',
];
const statusSource = filterFieldFor('game', 'status')!.source;
const formatSource = filterFieldFor('game', 'format')!.source;
const ratingSource: FilterSource = { type: 'rating' };

describe('filter fields', () => {
  it('have unique ids', () => {
    const ids = FILTER_FIELDS.map((field) => field.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('include every role that items can have', () => {
    expect(FILTER_FIELDS.map((field) => field.id)).toEqual(expect.arrayContaining([...ITEM_ROLES]));
  });

  it('offer each kind its own fields', () => {
    const ids = (kind: 'game' | 'movie' | 'series') =>
      filterFieldsFor(kind).map((field) => field.id);

    expect(ids('game').sort()).toEqual(
      [
        ...COMMON,
        'hoursPlayed',
        'franchise',
        'owned_on',
        'released_on',
        'genre',
        'publisher',
        'developer',
        'composer',
        'origin_country',
        'tag',
      ].sort(),
    );
    const screen = [
      ...COMMON,
      'franchise',
      'genre',
      'producer',
      'director',
      'actor',
      'composer',
      'origin_country',
      'tag',
    ].sort();
    expect(ids('movie').sort()).toEqual(screen);
    expect(ids('series').sort()).toEqual([...screen, 'seasons'].sort());
  });

  it('do not offer a field to a kind that does not have it', () => {
    expect(filterFieldFor('game', 'actor')).toBeNull();
    expect(filterFieldFor('movie', 'owned_on')).toBeNull();
    expect(filterFieldFor('movie', 'hoursPlayed')).toBeNull();
    expect(filterFieldFor('game', 'seasons')).toBeNull();
    expect(filterFieldFor('game', 'no_such_field')).toBeNull();
  });

  it('define at least one operator per field', () => {
    for (const field of FILTER_FIELDS) {
      expect(operatorsFor(field.source).length).toBeGreaterThan(0);
    }
  });
});

describe('filter values', () => {
  it('accept only positive whole ids for roles', () => {
    const source = filterFieldFor('game', 'genre')!.source;
    expect(isValidFilterValue(source, 'is', 7)).toBe(true);
    for (const value of [0, -1, 1.5, '7', null, true]) {
      expect(isValidFilterValue(source, 'is', value)).toBe(false);
    }
  });

  it('accept only the listed values for choices', () => {
    expect(isValidFilterValue(statusSource, 'is', 'completed')).toBe(true);
    expect(isValidFilterValue(statusSource, 'is', 'finished')).toBe(false);
    expect(isValidFilterValue(statusSource, 'is', null)).toBe(false);
  });

  it('allow asking for items without a status, with no value', () => {
    expect(operatorsFor(statusSource)).toEqual(['is', 'isNot', 'isEmpty']);
    expect(isValidFilterValue(statusSource, 'isEmpty', null)).toBe(true);
    expect(isValidFilterValue(statusSource, 'isEmpty', 'completed')).toBe(false);
  });

  it('accept only booleans for flags', () => {
    const source = filterFieldFor('game', 'favorite')!.source;
    expect(isValidFilterValue(source, 'is', true)).toBe(true);
    expect(isValidFilterValue(source, 'is', 1)).toBe(false);
  });

  it('accept only named options for several flags, ignoring inherited names', () => {
    expect(isValidFilterValue(formatSource, 'is', 'physical')).toBe(true);
    expect(isValidFilterValue(formatSource, 'is', 'digital')).toBe(true);
    expect(isValidFilterValue(formatSource, 'is', 'toString')).toBe(false);
    expect(isValidFilterValue(formatSource, 'is', 'owns_physical')).toBe(false);
  });

  it('accept stored ratings for comparisons and nothing for "not rated"', () => {
    expect(isValidFilterValue(ratingSource, 'gte', 8)).toBe(true);
    expect(isValidFilterValue(ratingSource, 'lte', 11)).toBe(false);
    expect(isValidFilterValue(ratingSource, 'gte', null)).toBe(false);
    expect(isValidFilterValue(ratingSource, 'isEmpty', null)).toBe(true);
    expect(isValidFilterValue(ratingSource, 'isEmpty', 8)).toBe(false);
  });

  it('accept whole numbers within what items can store, and nothing for "not set"', () => {
    const year: FilterSource = { type: 'number', measure: 'releaseYear' };
    const hours: FilterSource = { type: 'number', measure: 'hoursPlayed' };
    const seasons: FilterSource = { type: 'number', measure: 'seasons' };

    for (const value of [1, 1998, 9999]) expect(isValidFilterValue(year, 'gte', value)).toBe(true);
    for (const value of [0, 10_000, 1998.5, '1998', null, Number.NaN]) {
      expect(isValidFilterValue(year, 'lte', value)).toBe(false);
    }
    expect(isValidFilterValue(hours, 'gte', 0)).toBe(true);
    expect(isValidFilterValue(hours, 'gte', MAX_HOURS_PLAYED)).toBe(true);
    expect(isValidFilterValue(hours, 'gte', MAX_HOURS_PLAYED + 1)).toBe(false);
    expect(isValidFilterValue(hours, 'lte', -1)).toBe(false);
    expect(isValidFilterValue(seasons, 'gte', 0)).toBe(true);
    expect(isValidFilterValue(seasons, 'isEmpty', null)).toBe(true);
    expect(isValidFilterValue(seasons, 'isEmpty', 3)).toBe(false);
    const finished: FilterSource = { type: 'number', measure: 'finishedYear' };
    expect(isValidFilterValue(finished, 'gte', 2025)).toBe(true);
    expect(isValidFilterValue(finished, 'lte', 0)).toBe(false);
    expect(isValidFilterValue(finished, 'isEmpty', null)).toBe(true);
  });

  it('allow comparing numbers and asking for those not set', () => {
    expect(operatorsFor({ type: 'number', measure: 'seasons' })).toEqual(['gte', 'lte', 'isEmpty']);
  });

  it('accept only positive whole ids for collections, which an item is in or not', () => {
    const source = filterFieldFor('series', 'collection')!.source;
    expect(operatorsFor(source)).toEqual(['is', 'isNot']);
    expect(isValidFilterValue(source, 'isNot', 4)).toBe(true);
    for (const value of [0, -1, 1.5, '4', null]) {
      expect(isValidFilterValue(source, 'is', value)).toBe(false);
    }
  });
});
