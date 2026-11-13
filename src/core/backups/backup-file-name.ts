import { replaceForbiddenFileNameCharacters } from '../files/file-name';

/** Why an automatic backup was made; it is part of its file name. */
export type AutomaticBackupReason = 'before-delete';

const pad = (value: number) => String(value).padStart(2, '0');

/** "2026-11-13 18-30-05", in local time, as the user reads it; never with ":". */
function localStamp(date: Date, withSeconds: boolean): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `${day} ${time}${withSeconds ? `-${pad(date.getSeconds())}` : ''}`;
}

function safeProfileName(profileName: string): string {
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
  /^(\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}) - .+ - before-delete(?: \((\d+)\))?\.zip$/;

/** Whether a file name is one of an automatic backup; nothing else is ever removed. */
export function isAutomaticBackupFileName(fileName: string): boolean {
  return AUTOMATIC_BACKUP.test(fileName);
}

/**
 * The automatic backups to remove so that only the `keep` most recent remain, by the time in
 * their names (and, within the same second, by their copy number).
 */
export function automaticBackupsToRemove(fileNames: readonly string[], keep: number): string[] {
  const dated = fileNames.flatMap((fileName) => {
    const match = AUTOMATIC_BACKUP.exec(fileName);
    return match ? [{ fileName, stamp: match[1] as string, copy: Number(match[2] ?? 1) }] : [];
  });
  dated.sort((a, b) => b.stamp.localeCompare(a.stamp) || b.copy - a.copy);
  return dated.slice(keep).map(({ fileName }) => fileName);
}
