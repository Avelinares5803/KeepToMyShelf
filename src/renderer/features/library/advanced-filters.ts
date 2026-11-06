import { rolesForKind, type ItemRole } from '../../../core/catalogs/catalogs';
import {
  filterFieldFor,
  isValidFilterValue,
  operatorsFor,
  type FilterOperator,
  type FilterSource,
} from '../../../core/filters/filter-fields';
import type { FilterCondition, FilterNode } from '../../../core/filters/filter-tree';
import type { ItemKind } from '../../../shared/content';
import type { ItemFilterValues } from '../../../shared/items';

/** Groups inside groups, counting the main one. The engine allows more, but it gets unreadable. */
export const MAX_GROUP_LEVELS = 3;

/** A row of the builder, which may still be half filled in. */
export interface AdvancedCondition {
  /** Only tells the rows apart on screen. */
  readonly id: number;
  readonly type: 'condition';
  readonly field: string | null;
  readonly operator: FilterOperator;
  readonly value: FilterCondition['value'];
}

export interface AdvancedGroup {
  readonly id: number;
  readonly type: 'group';
  readonly op: 'and' | 'or';
  readonly children: readonly AdvancedNode[];
}

export type AdvancedNode = AdvancedCondition | AdvancedGroup;

export const NO_ADVANCED_FILTERS: AdvancedGroup = { id: 0, type: 'group', op: 'and', children: [] };

let lastId = 0;
const newId = () => (lastId += 1);

const newCondition = (): AdvancedCondition => ({
  id: newId(),
  type: 'condition',
  field: null,
  operator: 'is',
  value: null,
});

const newGroup = (): AdvancedGroup => ({ id: newId(), type: 'group', op: 'or', children: [] });

/** Applies `change` to the node `id`, wherever it is; a null result takes the node out. */
function changeNode(
  group: AdvancedGroup,
  id: number,
  change: (node: AdvancedNode) => AdvancedNode | null,
): AdvancedGroup {
  if (group.id === id) return change(group) as AdvancedGroup;
  return {
    ...group,
    children: group.children.flatMap((child) => {
      if (child.id === id) return change(child) ?? [];
      return child.type === 'group' ? changeNode(child, id, change) : child;
    }),
  };
}

const withChild = (root: AdvancedGroup, groupId: number, child: AdvancedNode) =>
  changeNode(root, groupId, (group) => ({
    ...(group as AdvancedGroup),
    children: [...(group as AdvancedGroup).children, child],
  }));

export const addCondition = (root: AdvancedGroup, groupId: number) =>
  withChild(root, groupId, newCondition());

export const addGroup = (root: AdvancedGroup, groupId: number) =>
  withChild(root, groupId, newGroup());

export const removeNode = (root: AdvancedGroup, id: number) => changeNode(root, id, () => null);

export const setGroupOp = (root: AdvancedGroup, id: number, op: 'and' | 'or') =>
  changeNode(root, id, (group) => ({ ...(group as AdvancedGroup), op }));

/** A new field starts over: its operators and values may mean nothing for the old one. */
export function setField(
  root: AdvancedGroup,
  id: number,
  kind: ItemKind,
  field: string | null,
): AdvancedGroup {
  const source = field === null ? null : filterFieldFor(kind, field)?.source;
  return changeNode(root, id, (node) => ({
    ...(node as AdvancedCondition),
    field,
    operator: source ? operatorsFor(source)[0]! : 'is',
    value: null,
  }));
}

/** "Not rated" takes no value, so going to or from it leaves the value empty. */
export const setOperator = (root: AdvancedGroup, id: number, operator: FilterOperator) =>
  changeNode(root, id, (node) => {
    const condition = node as AdvancedCondition;
    const keepsValue = operator !== 'isEmpty' && condition.operator !== 'isEmpty';
    return { ...condition, operator, value: keepsValue ? condition.value : null };
  });

export const setValue = (root: AdvancedGroup, id: number, value: FilterCondition['value']) =>
  changeNode(root, id, (node) => ({ ...(node as AdvancedCondition), value }));

function isComplete(kind: ItemKind, condition: AdvancedCondition): boolean {
  const source = condition.field === null ? null : filterFieldFor(kind, condition.field)?.source;
  return (
    !!source &&
    operatorsFor(source).includes(condition.operator) &&
    isValidFilterValue(source, condition.operator, condition.value)
  );
}

/** What the builder means. Half-filled rows and empty groups count for nothing yet. */
export function toAdvancedTree(kind: ItemKind, root: AdvancedGroup): FilterNode | undefined {
  const visit = (node: AdvancedNode): FilterNode | null => {
    if (node.type === 'condition') {
      const { field, operator, value } = node;
      return isComplete(kind, node) ? { type: 'condition', field: field!, operator, value } : null;
    }
    const children = node.children.map(visit).filter((child) => child !== null);
    return children.length === 0 ? null : { type: 'group', op: node.op, children };
  };
  return visit(root) ?? undefined;
}

/** How many rows apply, for the "Filters (3)" button. */
export function countConditions(kind: ItemKind, root: AdvancedGroup): number {
  return root.children.reduce(
    (total, child) =>
      total +
      (child.type === 'group' ? countConditions(kind, child) : Number(isComplete(kind, child))),
    0,
  );
}

/**
 * Takes out the rows with values no item uses any more (e.g. deleted from its catalog). "Is
 * not" included: it would keep applying a value nobody can see or choose. Returns the same
 * object if none is missing.
 */
export function withoutMissingAdvancedValues(
  kind: ItemKind,
  root: AdvancedGroup,
  values: ItemFilterValues,
): AdvancedGroup {
  const isMissing = (condition: AdvancedCondition) => {
    const source = condition.field === null ? null : filterFieldFor(kind, condition.field)?.source;
    return (
      source?.type === 'role' &&
      condition.value !== null &&
      !(values[source.role] ?? []).some(({ id }) => id === condition.value)
    );
  };
  const visit = (group: AdvancedGroup): AdvancedGroup => {
    let changed = false;
    const children = group.children.flatMap((child) => {
      if (child.type === 'condition') {
        if (!isMissing(child)) return child;
        changed = true;
        return [];
      }
      const kept = visit(child);
      if (kept !== child) changed = true;
      return kept;
    });
    return changed ? { ...group, children } : group;
  };
  return visit(root);
}

/** The fields to offer, in the form's order; catalog fields only if the library uses them. */
export function fieldsToOffer(kind: ItemKind, values: ItemFilterValues | null): string[] {
  const hasValues = (role: ItemRole) => (values?.[role]?.length ?? 0) > 0;
  return [
    'favorite',
    'replay',
    'status',
    'rating',
    'format',
    ...rolesForKind(kind).filter(hasValues),
  ];
}

/** What a <select> holds, always text, as the value of a condition. */
export function parseValue(source: FilterSource, text: string): FilterCondition['value'] {
  if (text === '') return null;
  switch (source.type) {
    case 'role':
    case 'rating':
      return Number(text);
    case 'flag':
      return text === 'true';
    case 'choice':
    case 'flags':
      return text;
  }
}
