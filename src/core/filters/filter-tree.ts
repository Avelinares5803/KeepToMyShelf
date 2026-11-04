import type { ItemKind } from '../../shared/content';
import { ValidationError } from '../errors';
import {
  filterFieldFor,
  isValidFilterValue,
  operatorsFor,
  type FilterOperator,
} from './filter-fields';

/** One rule, such as "genre is RPG". */
export interface FilterCondition {
  readonly type: 'condition';
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: string | number | boolean | null;
}

/** Rules combined with AND or OR. Groups can contain groups. */
export interface FilterGroup {
  readonly type: 'group';
  readonly op: 'and' | 'or';
  readonly children: readonly FilterNode[];
}

export type FilterNode = FilterCondition | FilterGroup;

/** Sanity limits that protect against absurd input; no real filter gets close to them. */
export const FILTER_LIMITS = { depth: 8, conditions: 500 } as const;

const invalid = (reason: string) =>
  new ValidationError('filter.invalid', `Invalid filter: ${reason}`);

/**
 * Checks a filter against the fields of `kind` and drops its empty groups, which mean "no
 * rule" instead of matching everything or nothing. Null means there is nothing to filter by.
 */
export function validateFilter(kind: ItemKind, filter: FilterNode): FilterNode | null {
  let conditions = 0;

  const visit = (node: FilterNode, depth: number): FilterNode | null => {
    if (depth > FILTER_LIMITS.depth) throw invalid('too deep');
    if (node.type === 'condition') {
      conditions += 1;
      if (conditions > FILTER_LIMITS.conditions) throw invalid('too many conditions');
      assertValidCondition(kind, node);
      return node;
    }
    const children = node.children
      .map((child) => visit(child, depth + 1))
      .filter((child) => child !== null);
    if (children.length === 0) return null;
    return children.length === 1 ? children[0]! : { ...node, children };
  };

  return visit(filter, 1);
}

function assertValidCondition(kind: ItemKind, condition: FilterCondition): void {
  const field = filterFieldFor(kind, condition.field);
  if (field === null) throw invalid(`no field ${condition.field} for ${kind}`);
  if (!operatorsFor(field.source).includes(condition.operator)) {
    throw invalid(`operator ${condition.operator} not allowed for ${field.id}`);
  }
  if (!isValidFilterValue(field.source, condition.operator, condition.value)) {
    throw invalid(`wrong value for ${field.id}`);
  }
}
