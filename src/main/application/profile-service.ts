import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ConflictError, NotFoundError } from '../../core/errors';
import {
  normalizeProfileName,
  profileNameKey,
  resolveUniqueProfileName,
} from '../../core/profiles/profile-name';
import type { Profile, ProfileChange } from '../../shared/ipc';
import type { Language } from '../../shared/settings';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import { openLibraryDatabase } from '../infrastructure/db/library-database';
import { DELETED_PROFILE_PREFIX, type DataPaths } from '../infrastructure/paths';
import type { SessionManager } from './session-manager';
import type { SettingsService } from './settings-service';

interface ProfileRow {
  id: string;
  name: string;
  created_at: string;
  last_opened_at: string | null;
}

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  lastOpenedAt: row.last_opened_at,
});

export interface ProfileServiceDeps {
  readonly appDb: SqliteDatabase;
  readonly paths: DataPaths;
  readonly sessions: SessionManager;
  readonly settings: SettingsService;
  readonly now: () => Date;
  readonly newId: () => string;
}

export interface CreateProfileInput {
  readonly name: string;
  readonly language?: Language;
}

export class ProfileService {
  constructor(private readonly deps: ProfileServiceDeps) {}

  list(): Profile[] {
    const rows = this.deps.appDb
      .prepare(
        'SELECT id, name, created_at, last_opened_at FROM profile ORDER BY name_key, created_at',
      )
      .all() as ProfileRow[];
    return rows.map(toProfile);
  }

  get(profileId: string): Profile {
    const row = this.deps.appDb
      .prepare('SELECT id, name, created_at, last_opened_at FROM profile WHERE id = ?')
      .get(profileId) as ProfileRow | undefined;
    if (!row) {
      throw new NotFoundError('profile.not_found', `Profile ${profileId} does not exist`);
    }
    return toProfile(row);
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
    };

    const profileDir = paths.profileDir(profile.id);
    mkdirSync(profileDir, { recursive: true });
    try {
      openLibraryDatabase(paths.libraryDatabase(profile.id)).close();
      appDb.transaction(() => {
        appDb
          .prepare('INSERT INTO profile (id, name, name_key, created_at) VALUES (?, ?, ?, ?)')
          .run(profile.id, profile.name, profileNameKey(profile.name), profile.createdAt);
        if (input.language !== undefined) {
          settings.setForProfile(profile.id, { key: 'language', value: input.language });
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
   * Deletes a profile and all its data. The open profile cannot be deleted.
   * The folder is first renamed to ".deleted-<id>": if it cannot be removed right away
   * (e.g. a file is briefly locked), it is removed on a later call or at the next start.
   */
  delete(profileId: string): void {
    const { appDb, paths, sessions } = this.deps;
    this.get(profileId);
    if (sessions.isOpen(profileId)) {
      throw new ConflictError('profile.in_use', 'The open profile cannot be deleted');
    }

    const profileDir = paths.profileDir(profileId);
    if (existsSync(profileDir)) {
      renameSync(profileDir, paths.deletedProfileDir(profileId));
    }
    appDb.prepare('DELETE FROM profile WHERE id = ?').run(profileId);
    this.removeDeletedProfileFolders();
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
