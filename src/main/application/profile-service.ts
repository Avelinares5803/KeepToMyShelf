import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { AppError, ConflictError, NotFoundError } from '../../core/errors';
import {
  normalizeProfileName,
  profileNameKey,
  resolveUniqueProfileName,
} from '../../core/profiles/profile-name';
import type { Profile, ProfileChange } from '../../shared/ipc';
import type { BackgroundChoice, Language } from '../../shared/settings';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import { seedDefaultCatalogs } from '../infrastructure/db/default-catalogs';
import { openLibraryDatabase } from '../infrastructure/db/library-database';
import { DELETED_PROFILE_PREFIX, type DataPaths } from '../infrastructure/paths';
import type { BackupProgressListener, BackupService } from './backup-service';
import type { SessionManager } from './session-manager';
import type { SettingsService } from './settings-service';

interface ProfileRow {
  id: string;
  name: string;
  created_at: string;
  last_opened_at: string | null;
}

export interface ProfileServiceDeps {
  readonly appDb: SqliteDatabase;
  readonly paths: DataPaths;
  readonly sessions: SessionManager;
  readonly settings: SettingsService;
  /** Saves an automatic backup of a profile before it is deleted. */
  readonly backups: Pick<BackupService, 'createBeforeDelete'>;
  readonly now: () => Date;
  readonly newId: () => string;
}

export interface CreateProfileInput {
  readonly name: string;
  readonly language?: Language;
  /** Becomes the profile's own background; without it, it shows the global one. */
  readonly background?: BackgroundChoice;
}

export class ProfileService {
  constructor(private readonly deps: ProfileServiceDeps) {}

  list(): Profile[] {
    const rows = this.deps.appDb
      .prepare(
        'SELECT id, name, created_at, last_opened_at FROM profile ORDER BY name_key, created_at',
      )
      .all() as ProfileRow[];
    return rows.map((row) => this.toProfile(row));
  }

  /** A profile with its own background, if it has one. */
  private toProfile(row: ProfileRow): Profile {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      lastOpenedAt: row.last_opened_at,
      ownBackground: this.deps.settings.getOwnForProfile(row.id).background ?? null,
    };
  }

  get(profileId: string): Profile {
    const row = this.deps.appDb
      .prepare('SELECT id, name, created_at, last_opened_at FROM profile WHERE id = ?')
      .get(profileId) as ProfileRow | undefined;
    if (!row) {
      throw new NotFoundError('profile.not_found', `Profile ${profileId} does not exist`);
    }
    return this.toProfile(row);
  }

  /** Creates the profile's folder and library first; the profile is registered only if that works. */
  create(input: CreateProfileInput): ProfileChange {
    const { appDb, paths, settings, now, newId } = this.deps;
    const { name, renamed } = resolveUniqueProfileName(
      normalizeProfileName(input.name),
      this.list().map((profile) => profile.name),
    );
    const profile: Profile = {
      id: newId(),
      name,
      createdAt: now().toISOString(),
      lastOpenedAt: null,
      ownBackground: input.background ?? null,
    };

    const profileDir = paths.profileDir(profile.id);
    mkdirSync(profileDir, { recursive: true });
    try {
      const library = openLibraryDatabase(paths.libraryDatabase(profile.id));
      try {
        seedDefaultCatalogs(library, input.language ?? settings.getGlobal().language);
      } finally {
        library.close();
      }
      appDb.transaction(() => {
        appDb
          .prepare('INSERT INTO profile (id, name, name_key, created_at) VALUES (?, ?, ?, ?)')
          .run(profile.id, profile.name, profileNameKey(profile.name), profile.createdAt);
        if (input.language !== undefined) {
          settings.setForProfile(profile.id, { key: 'language', value: input.language });
        }
        // An imported background that no longer exists fails here, and nothing is created.
        if (input.background !== undefined) {
          settings.setForProfile(profile.id, { key: 'background', value: input.background });
        }
      })();
    } catch (error) {
      rmSync(profileDir, { recursive: true, force: true });
      throw error;
    }
    return { profile, renamed };
  }

  rename(profileId: string, rawName: string): ProfileChange {
    const current = this.get(profileId);
    const otherNames = this.list()
      .filter((profile) => profile.id !== profileId)
      .map((profile) => profile.name);
    const { name, renamed } = resolveUniqueProfileName(normalizeProfileName(rawName), otherNames);

    this.deps.appDb
      .prepare('UPDATE profile SET name = ?, name_key = ? WHERE id = ?')
      .run(name, profileNameKey(name), profileId);
    return { profile: { ...current, name }, renamed };
  }

  /**
   * Deletes a profile and all its data, after saving an automatic backup of it; if the backup
   * fails, nothing is deleted. The open profile cannot be deleted.
   * The folder is first renamed to ".deleted-<id>": if it cannot be removed right away
   * (e.g. a file is briefly locked), it is removed on a later call or at the next start.
   */
  async delete(profileId: string, onProgress: BackupProgressListener = () => {}): Promise<void> {
    const { appDb, paths } = this.deps;
    this.assertDeletable(profileId);
    try {
      await this.deps.backups.createBeforeDelete(profileId, onProgress);
    } catch (error) {
      throw new AppError(
        'profile.backup_failed',
        `Profile ${profileId} was not deleted: its backup failed`,
        { cause: error },
      );
    }
    // While the backup was written, the profile may have been opened or deleted.
    this.assertDeletable(profileId);

    const profileDir = paths.profileDir(profileId);
    if (existsSync(profileDir)) {
      renameSync(profileDir, paths.deletedProfileDir(profileId));
    }
    appDb.prepare('DELETE FROM profile WHERE id = ?').run(profileId);
    this.removeDeletedProfileFolders();
  }

  private assertDeletable(profileId: string): void {
    this.get(profileId);
    if (this.deps.sessions.isOpen(profileId)) {
      throw new ConflictError('profile.in_use', 'The open profile cannot be deleted');
    }
  }

  /** Removes leftover folders of deleted profiles. Folders that are still locked are kept for later. */
  removeDeletedProfileFolders(): void {
    const { profilesDir } = this.deps.paths;
    if (!existsSync(profilesDir)) return;
    for (const entry of readdirSync(profilesDir)) {
      if (!entry.startsWith(DELETED_PROFILE_PREFIX)) continue;
      try {
        rmSync(join(profilesDir, entry), { recursive: true, force: true });
      } catch (error) {
        console.warn(`Could not remove deleted profile folder "${entry}"; will retry later`, error);
      }
    }
  }
}
