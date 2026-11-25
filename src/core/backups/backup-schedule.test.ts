import { describe, expect, it } from 'vitest';
import { isBackupDue } from './backup-schedule';

// Built from local parts, so the results do not depend on the machine's time zone.
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour);

describe('isBackupDue', () => {
  it('is never due with "never"', () => {
    expect(isBackupDue('never', at(2020, 1, 1), at(2026, 11, 25))).toBe(false);
  });

  it('counts calendar days, not 24 hours', () => {
    const since = at(2026, 11, 25, 20);
    expect(isBackupDue('daily', since, at(2026, 11, 25, 23))).toBe(false);
    expect(isBackupDue('daily', since, at(2026, 11, 26, 0))).toBe(true);
  });

  it('is due on the same day of the next week', () => {
    const since = at(2026, 12, 28, 20);
    expect(isBackupDue('weekly', since, at(2027, 1, 3, 23))).toBe(false);
    expect(isBackupDue('weekly', since, at(2027, 1, 4, 0))).toBe(true);
  });

  it('counts whole days when the clocks change', () => {
    // Late March and late October, when most of Europe changes the time.
    for (const [month, day] of [
      [3, 28],
      [10, 24],
    ] as const) {
      const since = at(2026, month, day, 23);
      expect(isBackupDue('daily', since, at(2026, month, day + 1, 0))).toBe(true);
      expect(isBackupDue('weekly', since, at(2026, month, day + 6, 23))).toBe(false);
      expect(isBackupDue('weekly', since, at(2026, month, day + 7, 0))).toBe(true);
    }
  });

  it.each([
    ['the same day of the next month', at(2026, 11, 25), at(2026, 12, 24), at(2026, 12, 25, 0)],
    ['the same day across the year', at(2026, 12, 31), at(2027, 1, 30), at(2027, 1, 31, 0)],
    ['the last day of a shorter month', at(2026, 1, 31), at(2026, 2, 27), at(2026, 2, 28, 0)],
    ['February 29 of a leap year', at(2028, 1, 31), at(2028, 2, 28), at(2028, 2, 29, 0)],
  ])('is due monthly on %s', (_name, since, dayBefore, due) => {
    expect(isBackupDue('monthly', since, dayBefore)).toBe(false);
    expect(isBackupDue('monthly', since, due)).toBe(true);
  });
});
