import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  FILTER_LIMITS,
  validateFilter,
  type FilterCondition,
  type FilterGroup,
  type FilterNode,
} from './filter-tree';

const genre = (value: number): FilterCondition => ({
  type: 'condition',
  field: 'genre',
  operator: 'is',
  value,
});
const group = (op: 'and' | 'or', ...children: FilterNode[]): FilterGroup => ({
  type: 'group',
  op,
  children,
});

function expectInvalid(filter: FilterNode) {
  expect(() => validateFilter('game', filter)).toThrow(ValidationError);
  expect(() => validateFilter('game', filter)).toThrow(
    expect.objectContaining({ code: 'filter.invalid' }),
  );
}

describe('validateFilter', () => {
  it('keeps a valid tree as it is', () => {
    const filter = group('and', genre(1), group('or', genre(2), genre(3)));
    expect(validateFilter('game', filter)).toEqual(filter);
  });

  it('treats a tree without conditions as no filter', () => {
    expect(validateFilter('game', group('and'))).toBeNull();
    expect(validateFilter('game', group('or', group('and'), group('or')))).toBeNull();
  });

  it('drops empty groups instead of letting them match everything', () => {
    const filter = group('or', genre(1), group('and'), genre(2));
    expect(validateFilter('game', filter)).toEqual(group('or', genre(1), genre(2)));
  });

  it('replaces a group of one rule with the rule', () => {
    expect(validateFilter('game', group('or', group('and', genre(1))))).toEqual(genre(1));
  });

  it('rejects a field the kind does not have', () => {
    expectInvalid({ type: 'condition', field: 'actor', operator: 'is', value: 1 });
    expectInvalid({ type: 'condition', field: 'item.title', operator: 'is', value: 1 });
  });

  it('rejects an operator the field does not allow', () => {
    expectInvalid({ type: 'condition', field: 'genre', operator: 'gte', value: 1 });
    expectInvalid({ type: 'condition', field: 'rating', operator: 'is', value: 8 });
  });

  it('rejects a value of the wrong type', () => {
    expectInvalid({ type: 'condition', field: 'genre', operator: 'is', value: '1 OR 1=1' });
    expectInvalid({ type: 'condition', field: 'status', operator: 'is', value: 'finished' });
  });

  it('rejects invalid conditions inside groups', () => {
    expectInvalid(group('or', genre(1), group('and', genre(0))));
  });

  it('rejects trees deeper than the limit', () => {
    const atLimit = Array.from({ length: FILTER_LIMITS.depth - 1 }).reduce<FilterNode>(
      (child) => group('and', child),
      genre(1),
    );
    expect(validateFilter('game', atLimit)).toEqual(genre(1));
    expectInvalid(group('and', atLimit));
  });

  it('rejects trees with more conditions than the limit', () => {
    const conditions = Array.from({ length: FILTER_LIMITS.conditions }, () => genre(1));
    expect(validateFilter('game', group('or', ...conditions))).not.toBeNull();
    expectInvalid(group('or', ...conditions, genre(1)));
  });
});
