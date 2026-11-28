import { describe, expect, it } from 'vitest';
import { filterFieldFor } from '../../../core/filters/filter-fields';
import { validateFilter } from '../../../core/filters/filter-tree';
import type { ItemFilterValues } from '../../../shared/items';
import {
  addCondition,
  addGroup,
  countConditions,
  fieldsToOffer,
  NO_ADVANCED_FILTERS,
  parseValue,
  removeNode,
  setField,
  setGroupOp,
  setOperator,
  setValue,
  toAdvancedTree,
  withoutMissingAdvancedValues,
  type AdvancedCondition,
  type AdvancedGroup,
  type AdvancedNode,
} from './advanced-filters';

const lastChild = (group: AdvancedGroup): AdvancedNode => group.children.at(-1)!;
const valuesOf = (
  roles: ItemFilterValues['roles'],
  collections: ItemFilterValues['collections'] = [],
): ItemFilterValues => ({ roles, ranges: {}, collections });

/** Adds a filled-in row to the group. */
function withRow(
  root: AdvancedGroup,
  groupId: number,
  field: string,
  value: AdvancedCondition['value'],
  operator?: AdvancedCondition['operator'],
): AdvancedGroup {
  const added = addCondition(root, groupId);
  const group = find(added, groupId) as AdvancedGroup;
  const { id } = lastChild(group);
  const withFieldSet = setField(added, id, 'game', field);
  const withOperatorSet = operator ? setOperator(withFieldSet, id, operator) : withFieldSet;
  return setValue(withOperatorSet, id, value);
}

function find(root: AdvancedGroup, id: number): AdvancedNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) {
    if (child.id === id) return child;
    if (child.type === 'group') {
      const found = find(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

const genre = (value: number) => ({ type: 'condition', field: 'genre', operator: 'is', value });

describe('toAdvancedTree', () => {
  it('means nothing without rows', () => {
    expect(toAdvancedTree('game', NO_ADVANCED_FILTERS)).toBeUndefined();
  });

  it('asks for both values with "all", not for either', () => {
    const root = withRow(withRow(NO_ADVANCED_FILTERS, 0, 'genre', 1), 0, 'genre', 2);
    expect(toAdvancedTree('game', root)).toEqual({
      type: 'group',
      op: 'and',
      children: [genre(1), genre(2)],
    });
  });

  it('keeps groups inside groups, each with its own way to combine', () => {
    const withGroup = addGroup(withRow(NO_ADVANCED_FILTERS, 0, 'genre', 1), 0);
    const group = lastChild(withGroup) as AdvancedGroup;
    const root = withRow(withRow(withGroup, group.id, 'genre', 2), group.id, 'genre', 3);
    expect(toAdvancedTree('game', root)).toEqual({
      type: 'group',
      op: 'and',
      children: [genre(1), { type: 'group', op: 'or', children: [genre(2), genre(3)] }],
    });
  });

  it('ignores half-filled rows, so that they neither fail nor find nothing', () => {
    const noField = addCondition(NO_ADVANCED_FILTERS, 0);
    expect(toAdvancedTree('game', noField)).toBeUndefined();

    const noValue = setField(noField, lastChild(noField).id, 'game', 'genre');
    expect(toAdvancedTree('game', noValue)).toBeUndefined();

    expect(toAdvancedTree('game', withRow(noValue, 0, 'genre', 1))).toEqual({
      type: 'group',
      op: 'and',
      children: [genre(1)],
    });
  });

  it('ignores groups without complete rows', () => {
    const root = addGroup(NO_ADVANCED_FILTERS, 0);
    expect(toAdvancedTree('game', root)).toBeUndefined();
    expect(toAdvancedTree('game', withRow(root, 0, 'genre', 1))).toEqual({
      type: 'group',
      op: 'and',
      children: [genre(1)],
    });
  });

  it('says "not favorite" with the value, and "not rated" without one', () => {
    const root = withRow(
      withRow(NO_ADVANCED_FILTERS, 0, 'favorite', false),
      0,
      'rating',
      null,
      'isEmpty',
    );
    expect(toAdvancedTree('game', root)).toEqual({
      type: 'group',
      op: 'and',
      children: [
        { type: 'condition', field: 'favorite', operator: 'is', value: false },
        { type: 'condition', field: 'rating', operator: 'isEmpty', value: null },
      ],
    });
  });

  it('builds what the engine accepts, with every operator, at the deepest level', () => {
    const level2 = addGroup(NO_ADVANCED_FILTERS, 0);
    const level2Id = lastChild(level2).id;
    const level3 = addGroup(level2, level2Id);
    const level3Id = lastChild(find(level3, level2Id) as AdvancedGroup).id;
    let root = setGroupOp(level3, level3Id, 'and');
    root = withRow(root, level3Id, 'genre', 1, 'isNot');
    root = withRow(root, level3Id, 'status', 'completed', 'isNot');
    root = withRow(root, level2Id, 'format', 'digital');
    root = withRow(root, 0, 'rating', 8);
    root = withRow(root, 0, 'rating', 4, 'lte');
    root = withRow(root, 0, 'replay', false);
    root = withRow(root, 0, 'collection', 5, 'isNot');

    expect(validateFilter('game', toAdvancedTree('game', root)!)).not.toBeNull();
  });
});

describe('editing the builder', () => {
  it('starts a new group as "any", which is what it is usually added for', () => {
    const root = addGroup(NO_ADVANCED_FILTERS, 0);
    expect(lastChild(root)).toMatchObject({ type: 'group', op: 'or', children: [] });
  });

  it('gives every new row its own id', () => {
    const root = addCondition(addCondition(NO_ADVANCED_FILTERS, 0), 0);
    expect(root.children[0]!.id).not.toBe(root.children[1]!.id);
  });

  it('takes out the row asked for, and a whole group', () => {
    const withGroup = addGroup(withRow(NO_ADVANCED_FILTERS, 0, 'genre', 1), 0);
    const group = lastChild(withGroup) as AdvancedGroup;
    const root = withRow(withGroup, group.id, 'genre', 2);
    const inner = lastChild(lastChild(root) as AdvancedGroup);

    expect(countConditions('game', removeNode(root, inner.id))).toBe(1);
    expect(removeNode(root, group.id).children).toHaveLength(1);
  });

  it('never changes the original', () => {
    const root = addCondition(NO_ADVANCED_FILTERS, 0);
    expect(NO_ADVANCED_FILTERS.children).toEqual([]);
    expect(root.children).toHaveLength(1);
  });

  it('starts over when the field changes', () => {
    const root = withRow(NO_ADVANCED_FILTERS, 0, 'genre', 1, 'isNot');
    const { id } = lastChild(root);

    expect(lastChild(setField(root, id, 'game', 'rating'))).toMatchObject({
      field: 'rating',
      operator: 'gte',
      value: null,
    });
    expect(lastChild(setField(root, id, 'game', null))).toMatchObject({
      field: null,
      operator: 'is',
      value: null,
    });
  });

  it('keeps the value between comparisons, but not with "not rated"', () => {
    const root = withRow(NO_ADVANCED_FILTERS, 0, 'rating', 8);
    const { id } = lastChild(root);

    const atMost = setOperator(root, id, 'lte');
    expect(lastChild(atMost)).toMatchObject({ operator: 'lte', value: 8 });

    const notRated = setOperator(atMost, id, 'isEmpty');
    expect(lastChild(notRated)).toMatchObject({ operator: 'isEmpty', value: null });
    expect(lastChild(setOperator(notRated, id, 'gte'))).toMatchObject({
      operator: 'gte',
      value: null,
    });
  });

  it('asks for items without a status, dropping the status chosen', () => {
    const root = withRow(NO_ADVANCED_FILTERS, 0, 'status', 'completed');
    const { id } = lastChild(root);
    const noStatus = setOperator(root, id, 'isEmpty');

    expect(lastChild(noStatus)).toMatchObject({ operator: 'isEmpty', value: null });
    expect(toAdvancedTree('game', noStatus)).toEqual({
      type: 'group',
      op: 'and',
      children: [{ type: 'condition', field: 'status', operator: 'isEmpty', value: null }],
    });
  });
});

describe('countConditions', () => {
  it('counts complete rows at every level, and nothing else', () => {
    const withGroup = addGroup(withRow(NO_ADVANCED_FILTERS, 0, 'genre', 1), 0);
    const group = lastChild(withGroup) as AdvancedGroup;
    const root = addCondition(withRow(withGroup, group.id, 'genre', 2), group.id);
    expect(countConditions('game', root)).toBe(2);
  });
});

describe('withoutMissingAdvancedValues', () => {
  const value = (id: number) => ({ id, name: `Valor ${id}`, aliases: [] });

  it('takes out rows with values no item uses, at every level, "is not" included', () => {
    const withGroup = addGroup(withRow(NO_ADVANCED_FILTERS, 0, 'genre', 1, 'isNot'), 0);
    const group = lastChild(withGroup) as AdvancedGroup;
    const root = withRow(withRow(withGroup, group.id, 'genre', 2), group.id, 'genre', 3);

    const kept = withoutMissingAdvancedValues('game', root, valuesOf({ genre: [value(3)] }));
    expect(toAdvancedTree('game', kept)).toEqual({
      type: 'group',
      op: 'and',
      children: [{ type: 'group', op: 'or', children: [genre(3)] }],
    });
  });

  it('keeps half-filled rows and rows without catalog values', () => {
    const halfFilled = addCondition(NO_ADVANCED_FILTERS, 0);
    const root = withRow(
      setField(halfFilled, lastChild(halfFilled).id, 'game', 'genre'),
      0,
      'status',
      'completed',
    );
    expect(withoutMissingAdvancedValues('game', root, valuesOf({}))).toBe(root);
  });

  it('returns the same object when nothing is missing', () => {
    const root = withRow(NO_ADVANCED_FILTERS, 0, 'genre', 1);
    expect(withoutMissingAdvancedValues('game', root, valuesOf({ genre: [value(1)] }))).toBe(root);
  });

  it('takes out rows with collections deleted or without items of the library', () => {
    const root = withRow(withRow(NO_ADVANCED_FILTERS, 0, 'collection', 4), 0, 'collection', 5);
    const kept = withoutMissingAdvancedValues('game', root, valuesOf({}, [value(5)]));
    expect(toAdvancedTree('game', kept)).toEqual({
      type: 'group',
      op: 'and',
      children: [{ type: 'condition', field: 'collection', operator: 'is', value: 5 }],
    });
  });

  it('keeps number rows, even when no item has the number', () => {
    const root = withRow(NO_ADVANCED_FILTERS, 0, 'releaseYear', 1995);
    expect(withoutMissingAdvancedValues('game', root, valuesOf({}))).toBe(root);
  });
});

describe('fieldsToOffer', () => {
  const ITEM_FIELDS = [
    'favorite',
    'replay',
    'status',
    'rating',
    'format',
    'releaseYear',
    'finishedYear',
  ];

  it('always offers the fields of the item, and catalogs only with values', () => {
    const genreValue = [{ id: 1, name: 'RPG', aliases: [] }];
    expect(fieldsToOffer('game', null)).toEqual([...ITEM_FIELDS, 'hoursPlayed']);
    expect(fieldsToOffer('game', valuesOf({ genre: genreValue, actor: genreValue }))).toEqual([
      ...ITEM_FIELDS,
      'hoursPlayed',
      'genre',
    ]);
  });

  it('offers collections, last, only when some have items of the library', () => {
    const collections = [{ id: 4, name: 'Favoritos', aliases: [] }];
    expect(fieldsToOffer('movie', valuesOf({}, collections))).toEqual([
      ...ITEM_FIELDS,
      'collection',
    ]);
    expect(fieldsToOffer('movie', valuesOf({}))).toEqual(ITEM_FIELDS);
  });

  it('offers each kind its own numbers', () => {
    expect(fieldsToOffer('movie', null)).toEqual(ITEM_FIELDS);
    expect(fieldsToOffer('series', null)).toEqual([...ITEM_FIELDS, 'seasons']);
  });
});

describe('a number row', () => {
  const inMainGroup = (condition: object) => ({ type: 'group', op: 'and', children: [condition] });

  it('applies only with a whole number the measure can have', () => {
    const tree = (value: AdvancedCondition['value']) =>
      toAdvancedTree('game', withRow(NO_ADVANCED_FILTERS, 0, 'releaseYear', value));
    expect(tree(1995)).toEqual(
      inMainGroup({ type: 'condition', field: 'releaseYear', operator: 'gte', value: 1995 }),
    );
    expect(tree(0)).toBeUndefined();
    expect(tree(1995.5)).toBeUndefined();
    expect(tree(Number.NaN)).toBeUndefined();
  });

  it('asks for items without the number with "not set"', () => {
    const root = withRow(NO_ADVANCED_FILTERS, 0, 'hoursPlayed', null, 'isEmpty');
    expect(toAdvancedTree('game', root)).toEqual(
      inMainGroup({ type: 'condition', field: 'hoursPlayed', operator: 'isEmpty', value: null }),
    );
  });
});

describe('parseValue', () => {
  const source = (field: string) => filterFieldFor('game', field)!.source;

  it('reads each kind of value', () => {
    expect(parseValue(source('genre'), '7')).toBe(7);
    expect(parseValue(source('rating'), '8')).toBe(8);
    expect(parseValue(source('favorite'), 'false')).toBe(false);
    expect(parseValue(source('favorite'), 'true')).toBe(true);
    expect(parseValue(source('status'), 'completed')).toBe('completed');
    expect(parseValue(source('format'), 'digital')).toBe('digital');
    expect(parseValue(source('releaseYear'), '1995')).toBe(1995);
    expect(parseValue(source('collection'), '4')).toBe(4);
  });

  it('reads the empty choice as no value', () => {
    expect(parseValue(source('genre'), '')).toBeNull();
    expect(parseValue(source('favorite'), '')).toBeNull();
    expect(parseValue(source('hoursPlayed'), ' ')).toBeNull();
  });
});
