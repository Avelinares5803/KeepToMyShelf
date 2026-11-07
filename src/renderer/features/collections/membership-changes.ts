/**
 * What the user marks in a window of memberships: the ids that were members when it opened
 * and those marked now. Ids are items (in a collection's window) or collections (in an item's).
 * Only the difference is saved, so members the window does not show (items in the trash, or
 * of another kind) are never touched.
 */
export interface MembershipMarks {
  readonly initial: ReadonlySet<number>;
  readonly current: ReadonlySet<number>;
}

export const marksFrom = (members: readonly number[]): MembershipMarks => ({
  initial: new Set(members),
  current: new Set(members),
});

/** Marks or unmarks one id. */
export function toggleMark(marks: MembershipMarks, id: number): MembershipMarks {
  const current = new Set(marks.current);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  return { ...marks, current };
}

export interface MembershipChangeList {
  /** Marked now, not a member before. */
  readonly added: readonly number[];
  /** A member before, not marked now. */
  readonly removed: readonly number[];
}

/** Marking and unmarking the same id again is no change at all. */
export function changesOf({ initial, current }: MembershipMarks): MembershipChangeList {
  return {
    added: [...current].filter((id) => !initial.has(id)),
    removed: [...initial].filter((id) => !current.has(id)),
  };
}

export const hasChanges = (marks: MembershipMarks): boolean => {
  const { added, removed } = changesOf(marks);
  return added.length > 0 || removed.length > 0;
};
