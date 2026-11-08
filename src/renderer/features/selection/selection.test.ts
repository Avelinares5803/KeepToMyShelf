import { describe, expect, it } from 'vitest';
import {
  cardClassName,
  EMPTY_SELECTION,
  isAllSelected,
  selectableProps,
  selectedAmong,
  toggled,
  toggledAll,
} from './selection';

describe('selection', () => {
  it('marks an id and unmarks it again', () => {
    const marked = toggled(EMPTY_SELECTION, 3);
    expect([...marked]).toEqual([3]);
    expect([...toggled(marked, 3)]).toEqual([]);
    // The previous selection is never changed.
    expect([...marked]).toEqual([3]);
  });

  it('acts only on the marked ids that are shown, in the order shown', () => {
    const selection = new Set([5, 1, 9]);
    expect(selectedAmong(selection, [1, 2, 5])).toEqual([1, 5]);
  });

  it('selects every shown id, and clears them once all are marked', () => {
    const shown = [1, 2, 3];
    const all = toggledAll(new Set([2]), shown);
    expect([...all]).toEqual(shown);
    expect(isAllSelected(all, shown)).toBe(true);
    expect([...toggledAll(all, shown)]).toEqual([]);
  });

  it('is never "all selected" when nothing is shown', () => {
    expect(isAllSelected(EMPTY_SELECTION, [])).toBe(false);
    expect(isAllSelected(new Set([1]), [1, 2])).toBe(false);
  });

  it('makes a card a checkbox only in "Select" mode', () => {
    expect(cardClassName(true, null)).toBe('item-card item-card--cover');
    expect(selectableProps(null)).toEqual({});
    expect(cardClassName(false, false)).toBe('item-card item-card--selectable');
    expect(cardClassName(false, true)).toBe('item-card item-card--selectable item-card--selected');
    expect(selectableProps(true)).toEqual({ role: 'checkbox', 'aria-checked': true });
  });
});
