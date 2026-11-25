import { replaceForbiddenFileNameCharacters } from '../files/file-name';

/** Why an automatic backup was made; it is part of its file name. */
export type AutomaticBackupReason = 'before-delete' | 'before-restore';

const pad = (value: number) => String(value).padStart(2, '0');

/** "2026-11-13 18-30-05", in local time, as the user reads it; never with ":". */
export function localStamp(date: Date, withSeconds: boolean): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `${day} ${time}${withSeconds ? `-${pad(date.getSeconds())}` : ''}`;
}

export function safeProfileName(profileName: string): string {
  return replaceForbiddenFileNameCharacters(profileName).trim() || 'profile';
}

/** The name offered when saving a backup: "KeepToMyShelf - Adrián - 2026-11-13 18-30.zip". */
export function manualBackupFileName(profileName: string, date: Date): string {
  return `KeepToMyShelf - ${safeProfileName(profileName)} - ${localStamp(date, false)}.zip`;
}

/**
 * The name of an automatic backup: "2026-11-13 18-30-05 - Adrián - before-delete.zip". It
 * starts with the time, so the folder lists them in order. `copy` (2, 3…) tells apart two
 * made in the same second.
 */
export function automaticBackupFileName(
  profileName: string,
  reason: AutomaticBackupReason,
  date: Date,
  copy = 1,
): string {
  const suffix = copy > 1 ? ` (${copy})` : '';
  return `${localStamp(date, true)} - ${safeProfileName(profileName)} - ${reason}${suffix}.zip`;
}

const AUTOMATIC_BACKUP =
  /^(\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}) - .+ - before-(?:delete|restore)(?: \((\d+)\))?\.zip$/;

/** Whether a file name is one of an automatic backup; nothing else is ever removed. */
export function isAutomaticBackupFileName(fileName: string): boolean {
  return AUTOMATIC_BACKUP.test(fileName);
}

const SCHEDULED_BACKUP =
  /^(\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}) - .+ - scheduled(?: \((\d+)\))?\.zip$/;

/** The name of a scheduled backup: "2026-11-25 18-30-05 - Adrián - scheduled.zip". */
export function scheduledBackupFileName(profileName: string, date: Date, copy = 1): string {
  const suffix = copy > 1 ? ` (${copy})` : '';
  return `${localStamp(date, true)} - ${safeProfileName(profileName)} - scheduled${suffix}.zip`;
}

export interface ScheduledBackupFile {
  readonly fileName: string;
  /** When it was made, from its name (in local time, down to the second). */
  readonly madeAt: Date;
}

/**
 * The most recent scheduled backup, or null if there is none. Those dated after `now` (the
 * clock was set back since) do not count: they would put off the next ones.
 */
export function latestScheduledBackup(
  fileNames: readonly string[],
  now: Date,
): ScheduledBackupFile | null {
  for (const { fileName, stamp } of mostRecentFirst(fileNames, SCHEDULED_BACKUP)) {
    const madeAt = dateOfStamp(stamp);
    if (madeAt <= now) return { fileName, madeAt };
  }
  return null;
}

/**
 * The scheduled backups to remove so that only the `keep` most recent remain. The one just
 * written always does, even if others are dated later (the clock was set back).
 */
export function scheduledBackupsToRemove(
  fileNames: readonly string[],
  keep: number,
  justWritten: string,
): string[] {
  return mostRecentFirst(fileNames, SCHEDULED_BACKUP)
    .map(({ fileName }) => fileName)
    .filter((fileName) => fileName !== justWritten)
    .slice(keep - 1);
}

/** Without a zone, an ISO date and time is in local time. */
function dateOfStamp(stamp: string): Date {
  const [day, time] = stamp.split(' ') as [string, string];
  return new Date(`${day}T${time.replaceAll('-', ':')}`);
}

/**
 * The automatic backups to remove so that only the `keep` most recent remain, by the time in
 * their names (and, within the same second, by their copy number).
 */
export function automaticBackupsToRemove(fileNames: readonly string[], keep: number): string[] {
  return mostRecentFirst(fileNames, AUTOMATIC_BACKUP)
    .slice(keep)
    .map(({ fileName }) => fileName);
}

/** The files whose name matches `pattern`, by the time in it and then by their copy number. */
function mostRecentFirst(
  fileNames: readonly string[],
  pattern: RegExp,
): { fileName: string; stamp: string; copy: number }[] {
  const dated = fileNames.flatMap((fileName) => {
    const match = pattern.exec(fileName);
    return match ? [{ fileName, stamp: match[1] as string, copy: Number(match[2] ?? 1) }] : [];
  });
  dated.sort((a, b) => b.stamp.localeCompare(a.stamp) || b.copy - a.copy);
  return dated;
}
