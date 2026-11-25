import { describe, expect, it } from 'vitest';
import {
  automaticBackupFileName,
  automaticBackupsToRemove,
  isAutomaticBackupFileName,
  latestScheduledBackup,
  manualBackupFileName,
  scheduledBackupFileName,
  scheduledBackupsToRemove,
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

describe('scheduled backups', () => {
  const at = (day: number, copy = 1) =>
    scheduledBackupFileName('Ana', new Date(2026, 10, day, 10, 20, 30), copy);

  it('are named by their time and their reason, and are not automatic ones', () => {
    expect(at(3)).toBe('2026-11-03 10-20-30 - Ana - scheduled.zip');
    expect(at(3, 2)).toBe('2026-11-03 10-20-30 - Ana - scheduled (2).zip');
    expect(isAutomaticBackupFileName(at(3))).toBe(false);
    expect(automaticBackupsToRemove([at(3)], 0)).toEqual([]);
  });

  it('finds the most recent one, in local time, leaving out those in the future', () => {
    const names = ['mía.zip', at(3), at(9), at(5), `${at(6)}.x.partial`];

    expect(latestScheduledBackup(names, new Date(2026, 10, 8))).toEqual({
      fileName: at(5),
      madeAt: new Date(2026, 10, 5, 10, 20, 30),
    });
    expect(latestScheduledBackup(names, new Date(2026, 10, 1))).toBeNull();
    expect(latestScheduledBackup(['mía.zip'], new Date())).toBeNull();
  });

  it('keeps the most recent ones and always the one just written', () => {
    const names = ['mía.zip', at(1), at(2), at(3), at(4)];

    expect(scheduledBackupsToRemove(names, 2, at(4)).sort()).toEqual([at(1), at(2)]);
    expect(scheduledBackupsToRemove(names, 2, at(1)).sort()).toEqual([at(2), at(3)]);
  });
});
