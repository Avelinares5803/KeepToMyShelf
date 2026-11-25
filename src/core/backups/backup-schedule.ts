/** How often a profile saves a scheduled backup when it is opened. */
export const BACKUP_SCHEDULES = ['never', 'daily', 'weekly', 'monthly'] as const;
export type BackupSchedule = (typeof BACKUP_SCHEDULES)[number];

/**
 * Whether a scheduled backup is due, counting calendar days in local time from `since` (the
 * last one, or when the profile was created). A month ends on the same day of the next one,
 * or on its last day if it is shorter.
 */
export function isBackupDue(schedule: BackupSchedule, since: Date, now: Date): boolean {
  if (schedule === 'never') return false;
  return now >= dueDay(schedule, since);
}

function dueDay(schedule: Exclude<BackupSchedule, 'never'>, since: Date): Date {
  const year = since.getFullYear();
  const month = since.getMonth();
  const day = since.getDate();
  switch (schedule) {
    case 'daily':
      return new Date(year, month, day + 1);
    case 'weekly':
      return new Date(year, month, day + 7);
    case 'monthly': {
      const daysInNextMonth = new Date(year, month + 2, 0).getDate();
      return new Date(year, month + 1, Math.min(day, daysInNextMonth));
    }
  }
}
