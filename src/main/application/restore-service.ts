import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import { parseBackupEntryName, type BackupMediaStore } from '../../core/backups/backup-entries';
import { AppError, ValidationError } from '../../core/errors';
import type { MediaFormat } from '../../core/media/media-format';
import {
  normalizeProfileName,
  profileNameKey,
  resolveUniqueProfileName,
} from '../../core/profiles/profile-name';
import type { RestorePreview } from '../../shared/backups';
import type { Profile, ProfileChange } from '../../shared/ipc';
import { backgroundChoiceSchema, isSettingKey, type SettingUpdate } from '../../shared/settings';
import { openZip, type OpenedZip, type ZipEntryInfo } from '../infrastructure/backup/zip-reader';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import { openLibraryDatabase } from '../infrastructure/db/library-database';
import { libraryMigrations } from '../infrastructure/db/migrations/library';
import { MigrationError } from '../infrastructure/db/migrator';
import { MediaStore } from '../infrastructure/media/media-store';
import { RESTORING_PROFILE_PREFIX, type DataPaths } from '../infrastructure/paths';
import { invalidFile, parseBackupManifest, type ReadManifest } from './backup-manifest';
import {
  progressByPercent,
  removeIfPossible,
  type BackupLock,
  type BackupProgressListener,
} from './backup-lock';
import type { BackupService } from './backup-service';
import type { ProfileService } from './profile-service';
import type { SessionManager } from './session-manager';
import type { SettingsService } from './settings-service';

/** The manifest is a few kilobytes; a much larger one is not a manifest. */
const MANIFEST_MAX_BYTES = 1024 * 1024;

/** Preferences of a backup that cannot be applied here; they are skipped, not fatal. */
const SKIPPED_SETTING_ERRORS = new Set(['settings.invalid_value', 'background.not_found']);

/** Windows may hold a file of the profile for a moment (an antivirus, a thumbnail read). */
const RENAME_ATTEMPTS = 10;
const RENAME_RETRY_MS = 100;

export interface RestoreServiceDeps {
  readonly appDb: SqliteDatabase;
  readonly paths: DataPaths;
  readonly sessions: SessionManager;
  readonly settings: Pick<SettingsService, 'setForProfile' | 'clearForProfile'>;
  readonly profiles: Pick<ProfileService, 'get' | 'list'>;
  /** Writes the backup of the state a restore replaces. */
  readonly backups: Pick<BackupService, 'writeAutomatic'>;
  /** Shared with backups: only one of them runs at a time. */
  readonly lock: BackupLock;
  readonly now: () => Date;
  readonly newId: () => string;
}

/** The open session after restoring over its profile: the old token no longer works. */
export interface RestoredSession {
  readonly token: string;
  readonly profile: Profile;
}

interface MediaEntry {
  readonly entry: ZipEntryInfo;
  readonly store: BackupMediaStore;
  readonly sha256: string;
  readonly format: MediaFormat;
}

interface BackupContents {
  readonly manifest: ReadManifest;
  readonly library: ZipEntryInfo;
  readonly media: readonly MediaEntry[];
}

/** A backup chosen to restore over the open profile, waiting for the user to confirm. */
interface PendingRestore {
  readonly restoreId: string;
  readonly token: string;
  readonly path: string;
}

/**
 * Restores a backup made by `BackupService`, as a new profile or over the open one. Nothing
 * is replaced until the whole backup has been extracted to `profiles/.restoring-<id>` and
 * checked: only the entries a backup may have, each stored file against its hash (its name),
 * and the library with `integrity_check`, its references and its schema version (an older
 * one is migrated there). Then the folder is renamed into place.
 */
export class RestoreService {
  private pending: PendingRestore | null = null;

  constructor(private readonly deps: RestoreServiceDeps) {}

  /**
   * Reads what the backup at `path` holds (only its list of entries and its manifest), to
   * confirm restoring it over the open profile. The returned id stands for the file.
   */
  async preview(token: string, path: string): Promise<RestorePreview> {
    this.deps.sessions.require(token);
    const { manifest } = await this.withBackup(path, (zip) => this.readContents(zip));
    const restoreId = this.deps.newId();
    // Only the last one chosen can be restored.
    this.pending = { restoreId, token, path };
    return {
      restoreId,
      fileName: basename(path),
      profileName: manifest.profile.name,
      createdAt: manifest.createdAt,
      files: manifest.media.files,
    };
  }

  /**
   * Restores the backup at `path` as a new profile, with the backup's name ("(1)" if it is
   * taken) and its own preferences.
   */
  async restoreAsNew(path: string, onProgress: BackupProgressListener): Promise<ProfileChange> {
    const { appDb, paths, profiles, now, newId } = this.deps;
    return this.deps.lock.run(() =>
      this.reportingFailures(async () => {
        const workDir = paths.restoringDir(newId());
        try {
          const manifest = await this.extract(path, workDir, onProgress);
          const { name, renamed } = resolveUniqueProfileName(
            profileNameOf(manifest),
            profiles.list().map((profile) => profile.name),
          );
          const profileId = newId();
          const profileDir = paths.profileDir(profileId);
          renameSync(workDir, profileDir);
          try {
            appDb.transaction(() => {
              appDb
                .prepare('INSERT INTO profile (id, name, name_key, created_at) VALUES (?, ?, ?, ?)')
                .run(profileId, name, profileNameKey(name), now().toISOString());
              this.applySettings(profileId, manifest);
            })();
          } catch (error) {
            rmSync(profileDir, { recursive: true, force: true });
            throw error;
          }
          return { profile: profiles.get(profileId), renamed };
        } finally {
          removeIfPossible(workDir);
        }
      }),
    );
  }

  /**
   * Restores the backup chosen with `preview` over the open profile, which keeps its name.
   * First an automatic backup of its current state is saved; then the profile is closed, its
   * folder replaced and its own preferences replaced by the backup's, and it is opened again
   * with a new token. If anything fails, the profile stays as it was (and open).
   */
  async restoreOver(
    token: string,
    restoreId: string,
    onProgress: BackupProgressListener,
  ): Promise<RestoredSession> {
    const { profileId } = this.deps.sessions.require(token);
    const pending = this.pending;
    if (pending === null || pending.restoreId !== restoreId || pending.token !== token) {
      throw new AppError('backup.restore_expired', 'The backup chosen to restore is not known');
    }
    this.pending = null;

    return this.deps.lock.run(() =>
      this.reportingFailures(async () => {
        const { appDb, paths, sessions, settings, profiles } = this.deps;
        const workDir = paths.restoringDir(this.deps.newId());
        let closed = false;
        try {
          const manifest = await this.extract(pending.path, workDir, onProgress);
          // The profile may have been closed while the backup was extracted.
          const session = sessions.require(token);
          try {
            await this.deps.backups.writeAutomatic(
              profileId,
              session.db,
              'before-restore',
              onProgress,
            );
          } catch (error) {
            throw new AppError(
              'backup.safety_backup_failed',
              'The backup of the current state failed, so nothing was restored',
              { cause: error },
            );
          }
          sessions.close(token);
          closed = true;
          await this.replaceFolder(profileId, workDir);
          appDb.transaction(() => {
            settings.clearForProfile(profileId);
            this.applySettings(profileId, manifest);
          })();
        } catch (error) {
          // The profile is opened again (as it was, unless its folder was already replaced and
          // only its preferences failed, which takes an unexpected error) and the error reported.
          if (closed) sessions.open(profileId);
          throw error;
        } finally {
          removeIfPossible(workDir);
        }
        const { token: newToken } = sessions.open(profileId);
        return { token: newToken, profile: profiles.get(profileId) };
      }),
    );
  }

  /** At startup: removes the backups a restore interrupted by a crash left half extracted. */
  removeLeftovers(): void {
    const { profilesDir } = this.deps.paths;
    if (!existsSync(profilesDir)) return;
    for (const entry of readdirSync(profilesDir)) {
      if (entry.startsWith(RESTORING_PROFILE_PREFIX)) removeIfPossible(join(profilesDir, entry));
    }
  }

  /** Expected errors keep their code; any other (the disk is full…) is `backup.restore_failed`. */
  private async reportingFailures<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof AppError) throw error;
      // The handler only logs unexpected errors: this one is expected, but its cause matters.
      console.error('Restore failed', error);
      throw new AppError(
        'backup.restore_failed',
        `The backup could not be restored: ${String(error)}`,
        { cause: error },
      );
    }
  }

  /** Opens the backup, runs `read` and closes it, whatever happens. */
  private async withBackup<T>(path: string, read: (zip: OpenedZip) => Promise<T>): Promise<T> {
    let zip: OpenedZip;
    try {
      zip = await openZip(path);
    } catch (error) {
      // The file could not be read at all: that is the disk, not the backup.
      if (isFileSystemError(error)) throw error;
      throw invalidFile(`Not a valid .zip: ${String(error)}`, error);
    }
    try {
      return await read(zip);
    } finally {
      zip.close();
    }
  }

  /** Checks the list of entries and reads the manifest, without extracting anything. */
  private async readContents(zip: OpenedZip): Promise<BackupContents> {
    let manifestEntry: ZipEntryInfo | null = null;
    let library: ZipEntryInfo | null = null;
    const media: MediaEntry[] = [];
    for (const entry of zip.entries) {
      const parsed = parseBackupEntryName(entry.name);
      if (parsed === null) throw invalidFile(`Unexpected entry "${entry.name}"`);
      if (parsed.kind === 'manifest') manifestEntry = entry;
      else if (parsed.kind === 'library') library = entry;
      else media.push({ entry, ...parsed });
    }
    if (manifestEntry === null || library === null) {
      throw invalidFile('The manifest or the library is missing');
    }
    if (manifestEntry.size > MANIFEST_MAX_BYTES) throw invalidFile('The manifest is too large');

    const manifest = parseBackupManifest(
      await readingEntry(() => zip.readBuffer(manifestEntry, MANIFEST_MAX_BYTES)),
    );
    if (manifest.librarySchemaVersion > libraryMigrations.length) {
      throw new AppError(
        'backup.too_new',
        `Library schema v${manifest.librarySchemaVersion} is newer than supported v${libraryMigrations.length}`,
      );
    }
    if (media.length !== manifest.media.files) {
      throw invalidFile(
        `The manifest lists ${manifest.media.files} files, the backup has ${media.length}`,
      );
    }
    return { manifest, library, media };
  }

  /**
   * Extracts the whole backup to `workDir` and checks it. The progress counts the bytes
   * extracted. On success the library in `workDir` has an up-to-date schema.
   */
  private async extract(
    path: string,
    workDir: string,
    onProgress: BackupProgressListener,
  ): Promise<ReadManifest> {
    return this.withBackup(path, async (zip) => {
      const { manifest, library, media } = await this.readContents(zip);
      mkdirSync(workDir, { recursive: true });

      const totalBytes = media.reduce((sum, file) => sum + file.entry.size, library.size);
      const report = progressByPercent(onProgress, 'restore');
      let doneBytes = 0;
      report(0, totalBytes);
      const onChunk = (bytes: number) => {
        doneBytes += bytes;
        report(doneBytes, totalBytes);
      };

      const libraryPath = join(workDir, 'library.db');
      await readingEntry(() => zip.extract(library, libraryPath, onChunk));
      // Built from the hash and the format, never from the entry's name.
      const store = new MediaStore(join(workDir, 'media'), join(workDir, 'cache'));
      for (const file of media) {
        const target = store.filePath(file.store, file.sha256, file.format);
        const sha256 = await readingEntry(() => zip.extract(file.entry, target, onChunk));
        if (sha256 !== file.sha256) {
          throw damaged(`"${file.entry.name}" does not match its hash`);
        }
      }

      checkLibrary(libraryPath, manifest.librarySchemaVersion);
      return manifest;
    });
  }

  /**
   * Puts the extracted backup in place of the profile's folder. The old folder becomes a
   * ".deleted-…" one, removed now or, if Windows still holds it, at the next start.
   */
  private async replaceFolder(profileId: string, workDir: string): Promise<void> {
    const { paths, newId } = this.deps;
    const profileDir = paths.profileDir(profileId);
    // Not the profile's id: the profile is not deleted, only its old folder.
    const oldDir = paths.deletedProfileDir(newId());
    await renameRetrying(profileDir, oldDir);
    try {
      await renameRetrying(workDir, profileDir);
    } catch (error) {
      renameSync(oldDir, profileDir);
      throw error;
    }
    removeIfPossible(oldDir);
  }

  /**
   * Gives a profile the backup's own preferences. Unknown ones (from a newer app) and values
   * that are not valid here are skipped. An imported background is looked for by its hash;
   * if it is not in this installation's gallery, the profile follows the global background.
   */
  private applySettings(profileId: string, manifest: ReadManifest): void {
    for (const [key, stored] of Object.entries(manifest.settings)) {
      if (!isSettingKey(key)) {
        console.warn(`Skipping unknown setting "${key}" of the backup`);
        continue;
      }
      const value = key === 'background' ? this.backgroundHere(stored, manifest) : stored;
      if (value === undefined) continue;
      try {
        this.deps.settings.setForProfile(profileId, { key, value } as SettingUpdate);
      } catch (error) {
        if (!(error instanceof AppError) || !SKIPPED_SETTING_ERRORS.has(error.code)) throw error;
        console.warn(`Skipping setting "${key}" of the backup: ${error.message}`);
      }
    }
  }

  /**
   * The background preference to restore, or undefined to follow the global one. Backups made
   * before the F11-B carry no hash: their imported background is kept only if its id exists.
   */
  private backgroundHere(stored: unknown, manifest: ReadManifest): unknown {
    const choice = backgroundChoiceSchema.safeParse(stored);
    // An invalid value is refused (and skipped) by the settings service.
    if (!choice.success || choice.data.kind !== 'imported') return stored;
    const sha256 = manifest.importedBackground?.sha256;
    if (sha256 === undefined) return choice.data;
    const id = this.deps.appDb
      .prepare("SELECT id FROM background_file WHERE sha256 = ? AND store = 'files'")
      .pluck()
      .get(sha256) as number | undefined;
    return id === undefined ? undefined : { kind: 'imported', id };
  }
}

/** The backup's profile name, checked like a typed one. */
function profileNameOf(manifest: ReadManifest): string {
  try {
    return normalizeProfileName(manifest.profile.name);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw invalidFile(`Invalid profile name in the manifest: ${error.code}`, error);
    }
    throw error;
  }
}

/**
 * Checks the extracted library: SQLite's own `integrity_check`, its references and the schema
 * version the manifest names. Then brings an older one up to date, so reopening it later
 * cannot fail.
 */
function checkLibrary(libraryPath: string, expectedVersion: number): void {
  try {
    const db = new Database(libraryPath, { fileMustExist: true });
    try {
      const integrity = db.pragma('integrity_check', { simple: true }) as string;
      if (integrity !== 'ok') throw damaged(`integrity_check: ${integrity}`);
      const broken = db.pragma('foreign_key_check') as unknown[];
      if (broken.length > 0) throw damaged(`${broken.length} broken references`);
      const version = db.pragma('user_version', { simple: true }) as number;
      if (version !== expectedVersion) {
        throw invalidFile(`The library is v${version}, the manifest says v${expectedVersion}`);
      }
    } finally {
      db.close();
    }
  } catch (error) {
    // Not a database at all, or one SQLite cannot read.
    if (error instanceof Database.SqliteError) throw damaged(error.message, error);
    throw error;
  }
  try {
    openLibraryDatabase(libraryPath).close();
  } catch (error) {
    if (error instanceof MigrationError) throw damaged(error.message, error);
    throw error;
  }
}

/**
 * Reads an entry of the backup. A failure that is not the disk's (a wrong CRC, a size that
 * does not match, data that cannot be decompressed) means the backup is damaged.
 */
async function readingEntry<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isFileSystemError(error) || error instanceof AppError) throw error;
    throw damaged(String(error), error);
  }
}

/** Errors of the file system (a full disk, a file in use…) name the system call that failed. */
function isFileSystemError(error: unknown): boolean {
  return typeof (error as NodeJS.ErrnoException | null)?.syscall === 'string';
}

function damaged(message: string, cause?: unknown): AppError {
  return new AppError('backup.damaged', message, cause === undefined ? {} : { cause });
}

/** Renames a folder, retrying a few times while Windows holds one of its files. */
async function renameRetrying(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const locked = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!locked || attempt === RENAME_ATTEMPTS) throw error;
      await delay(RENAME_RETRY_MS);
    }
  }
}
