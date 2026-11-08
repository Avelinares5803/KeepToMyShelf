/** The ids marked in "Select" mode. Kept by id, so it works with the virtualized grid. */
export type Selection = ReadonlySet<number>;

export const EMPTY_SELECTION: Selection = new Set();

/** Marks the id, or unmarks it if it was marked. */
export function toggled(selection: Selection, id: number): Selection {
  const next = new Set(selection);
  if (!next.delete(id)) next.add(id);
  return next;
}

/** The marked ids among those shown, in the order shown: only these are acted on. */
export function selectedAmong(selection: Selection, shownIds: readonly number[]): number[] {
  return shownIds.filter((id) => selection.has(id));
}

/** True when every shown id is marked (and there is at least one). */
export function isAllSelected(selection: Selection, shownIds: readonly number[]): boolean {
  return shownIds.length > 0 && shownIds.every((id) => selection.has(id));
}

/** "Select all" marks every shown id; once all are marked, it becomes "Clear selection". */
export function toggledAll(selection: Selection, shownIds: readonly number[]): Selection {
  return isAllSelected(selection, shownIds) ? EMPTY_SELECTION : new Set(shownIds);
}

/**
 * The classes of a card (an item or a collection): with or without a cover, and in "Select"
 * mode, marked or not. `selected` is null outside the mode.
 */
export function cardClassName(hasCover: boolean, selected: boolean | null): string {
  return [
    'item-card',
    hasCover && 'item-card--cover',
    selected !== null && 'item-card--selectable',
    selected === true && 'item-card--selected',
  ]
    .filter(Boolean)
    .join(' ');
}

/** In "Select" mode a card is a checkbox, so screen readers tell whether it is marked. */
export function selectableProps(selected: boolean | null): {
  role?: 'checkbox';
  'aria-checked'?: boolean;
} {
  return selected === null ? {} : { role: 'checkbox', 'aria-checked': selected };
}
