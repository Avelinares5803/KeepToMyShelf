import { isBackupDue } from '../../core/backups/backup-schedule';
import type { ScheduledBackupFailure } from '../../shared/backups';
import type { BackupLock } from './backup-lock';
import type { BackupService } from './backup-service';
import type { ProfileService } from './profile-service';
import type { ProfileSession, SessionManager } from './session-manager';
import type { SettingsService } from './settings-service';

export interface ScheduledBackupServiceDeps {
  readonly sessions: Pick<SessionManager, 'currentSession'>;
  readonly settings: Pick<SettingsService, 'getForProfile'>;
  readonly profiles: Pick<ProfileService, 'get'>;
  readonly backups: Pick<BackupService, 'writeScheduled' | 'lastScheduledAt'>;
  readonly lock: BackupLock;
  readonly now: () => Date;
  /** Nobody waits for a scheduled backup, so a failure is reported here. */
  readonly onFailure: (failure: ScheduledBackupFailure) => void;
}

/**
 * Scheduled backups: the app makes them itself, in the background, just after a profile is
 * opened. They give way to whatever backup or restore the user asks for, and then they are
 * tried again the next time the profile is opened.
 */
export class ScheduledBackupService {
  constructor(private readonly deps: ScheduledBackupServiceDeps) {}

  /**
   * Saves a backup of the open profile if one is due. If another profile was opened while it
   * was being written, that one is looked at next. Never rejects.
   */
  async runDue(): Promise<void> {
    for (;;) {
      const session = this.deps.sessions.currentSession();
      if (session === null) return;
      const finished = await this.runFor(session);
      const current = this.deps.sessions.currentSession();
      if (!finished || current === null || current.profileId === session.profileId) return;
    }
  }

  /** False if it did not run to its end: something else was running, or it gave way. */
  private async runFor({ profileId, db }: ProfileSession): Promise<boolean> {
    const { profiles, settings, backups, lock, now, onFailure } = this.deps;
    const profile = profiles.get(profileId);
    try {
      const { backupSchedule } = settings.getForProfile(profileId);
      const since = backups.lastScheduledAt(profileId) ?? new Date(profile.createdAt);
      if (!isBackupDue(backupSchedule, since, now())) return true;
      const outcome = await lock.runInBackground((signal) =>
        backups.writeScheduled(profileId, db, signal),
      );
      return outcome === 'done';
    } catch (error) {
      console.error('Scheduled backup failed', error);
      onFailure({ profileName: profile.name });
      return true;
    }
  }
}
