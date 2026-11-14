import { describe, expect, it } from 'vitest';
import {
  automaticBackupFileName,
  automaticBackupsToRemove,
  isAutomaticBackupFileName,
  manualBackupFileName,
} from './backup-file-name';

// Built from local parts, so the names do not depend on the machine's time zone.
const date = new Date(2026, 10, 13, 8, 5, 9);

describe('manualBackupFileName', () => {
  it('names the backup after the app, the profile and the local time', () => {
    expect(manualBackupFileName('Adrián', date)).toBe(
      'KeepToMyShelf - Adrián - 2026-11-13 08-05.zip',
    );
  });

  it('replaces the characters Windows does not allow', () => {
    expect(manualBackupFileName('A/B: "C"?', date)).toBe(
      'KeepToMyShelf - A_B_ _C__ - 2026-11-13 08-05.zip',
    );
  });
});

describe('automaticBackupFileName', () => {
  it('starts with the time, down to the second, and ends with the reason', () => {
    expect(automaticBackupFileName('Adrián', 'before-delete', date)).toBe(
      '2026-11-13 08-05-09 - Adrián - before-delete.zip',
    );
    expect(automaticBackupFileName('Adrián', 'before-delete', date, 2)).toBe(
      '2026-11-13 08-05-09 - Adrián - before-delete (2).zip',
    );
  });

  it('is recognized as automatic, unlike any other file', () => {
    expect(isAutomaticBackupFileName(automaticBackupFileName('Ana', 'before-delete', date))).toBe(
      true,
    );
    expect(isAutomaticBackupFileName(automaticBackupFileName('Ana', 'before-restore', date))).toBe(
      true,
    );
    expect(isAutomaticBackupFileName(manualBackupFileName('Ana', date))).toBe(false);
    expect(isAutomaticBackupFileName('2026-11-13 08-05-09 - Ana - before-other.zip')).toBe(false);
    expect(isAutomaticBackupFileName('app-v1-2026-10-21T15-02-18-123Z.db')).toBe(false);
    expect(
      isAutomaticBackupFileName('2026-11-13 08-05-09 - Ana - before-delete.zip.x.partial'),
    ).toBe(false);
  });
});

describe('automaticBackupsToRemove', () => {
  const at = (day: number, copy = 1) =>
    automaticBackupFileName('Ana', 'before-delete', new Date(2026, 10, day, 10, 0, 0), copy);

  it('keeps the most recent ones and never touches other files', () => {
    const names = ['mía.zip', at(3), at(1), at(2, 2), at(2)];

    expect(automaticBackupsToRemove(names, 2).sort()).toEqual([at(1), at(2)].sort());
  });

  it('counts the backups made before restoring together with the others', () => {
    const beforeRestore = automaticBackupFileName(
      'Ana',
      'before-restore',
      new Date(2026, 10, 4, 10, 0, 0),
    );

    expect(automaticBackupsToRemove([at(1), beforeRestore, at(3)], 2)).toEqual([at(1)]);
  });

  it('removes nothing while there are no more than it keeps', () => {
    expect(automaticBackupsToRemove([at(1), at(2)], 2)).toEqual([]);
  });
});
