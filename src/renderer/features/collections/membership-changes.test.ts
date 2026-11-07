import { describe, expect, it } from 'vitest';
import { changesOf, hasChanges, marksFrom, toggleMark } from './membership-changes';

describe('membership marks', () => {
  it('start with the members marked and nothing to save', () => {
    const marks = marksFrom([1, 2]);

    expect([...marks.current]).toEqual([1, 2]);
    expect(changesOf(marks)).toEqual({ added: [], removed: [] });
    expect(hasChanges(marks)).toBe(false);
  });

  it('save only what changed: added and removed ids', () => {
    const marks = toggleMark(toggleMark(marksFrom([1, 2]), 2), 7);

    expect(changesOf(marks)).toEqual({ added: [7], removed: [2] });
    expect(hasChanges(marks)).toBe(true);
  });

  it('count marking and unmarking the same id again as no change', () => {
    const marks = toggleMark(toggleMark(toggleMark(toggleMark(marksFrom([1]), 1), 1), 5), 5);

    expect(changesOf(marks)).toEqual({ added: [], removed: [] });
    expect(hasChanges(marks)).toBe(false);
  });

  it('never touch members that were not toggled, shown or not', () => {
    // 3 may be in the trash or of another kind: the window never shows it.
    const marks = toggleMark(marksFrom([1, 3]), 9);

    expect(changesOf(marks)).toEqual({ added: [9], removed: [] });
  });
});
