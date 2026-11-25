import { createHash, randomUUID } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { isDeepStrictEqual } from 'node:util';
import { mediaEntryName } from '../../core/backups/backup-entries';
import {
  automaticBackupFileName,
  automaticBackupsToRemove,
  latestScheduledBackup,
  manualBackupFileName,
  scheduledBackupFileName,
  scheduledBackupsToRemove,
  type AutomaticBackupReason,
  type ScheduledBackupFile,
} from '../../core/backups/backup-file-name';
import { AppError, NotFoundError } from '../../core/errors';
import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  type BackupManifest,
  type BackupReason,
  type BackupSaved,
} from '../../shared/backups';
import type { AppSettings } from '../../shared/settings';
import { readLibrarySnapshot } from '../infrastructure/backup/library-snapshot';
import { openZip } from '../infrastructure/backup/zip-reader';
import { writeZip, type ZipFileEntry } from '../infrastructure/backup/zip-writer';
import { backupDatabase } from '../infrastructure/db/backup';
import { openDatabase, type SqliteDatabase } from '../infrastructure/db/connection';
import { MediaStore } from '../infrastructure/media/media-store';
import { DELETED_PROFILE_PREFIX, type DataPaths } from '../infrastructure/paths';
import {
  progressByPercent,
  removeIfPossible,
  type BackupLock,
  type BackupProgressListener,
} from './backup-lock';
import type { SessionManager } from './session-manager';
import type { SettingsService } from './settings-service';
import { MANIFEST_MAX_BYTES, parseBackupManifest, type ReadManifest } from './backup-manifest';

export type { BackupProgressListener } from './backup-lock';

/** How many automatic backups are kept in the app's `backups` folder, for all profiles. */
export const AUTOMATIC_BACKUPS_KEPT = 10;
/** How many scheduled backups are kept of each profile, besides the automatic ones. */
export const SCHEDULED_BACKUPS_KEPT = 10;

export interface BackupServiceDeps {
  readonly appDb: SqliteDatabase;
  readonly paths: DataPaths;
  readonly sessions: SessionManager;
  readonly settings: Pick<SettingsService, 'getOwnForProfile'>;
  /** Shared with restores: only one of them runs at a time. */
  readonly lock: BackupLock;
  /** While a backup reads a profile's files, none of them may be swept away. */
  readonly media: { holdSweeps(profileId: string): () => void };
  readonly appVersion: string;
  readonly now: () => Date;
  /**
   * Opens a folder in the system's file explorer. Resolves to an error message, or to '' when
   * it worked (like Electron's `shell.openPath`).
   */
  readonly openFolder: (path: string) => Promise<string>;
}

interface WriteOptions {
  /** Stops the backup, which then rejects with an AbortError. */
  readonly signal?: AbortSignal;
  /** Nothing is written if this backup already holds the same. */
  readonly unlessSameAs?: string | null;
}

interface ProfileRow {
  name: string;
  created_at: string;
}

/**
 * Backups of one profile in a .zip: a snapshot of its library, the stored files the snapshot
 * lists and a manifest with its own preferences. Thumbnails are left out, since they are made
 * again when needed. Only one backup (or restore) runs at a time.
 */
export class BackupService {
  constructor(private readonly deps: BackupServiceDeps) {}

  /** The name offered when saving a backup of the open profile. */
  suggestedFileName(token: string): string {
    const { profileId } = this.deps.sessions.require(token);
    return manualBackupFileName(this.profileRow(profileId).name, this.deps.now());
  }

  /** Writes a backup of the open profile at `destination`, chosen by the user. */
  async createForSession(
    token: string,
    destination: string,
    onProgress: BackupProgressListener,
  ): Promise<BackupSaved> {
    const manifest = await this.deps.lock.run(() => {
      const session = this.deps.sessions.require(token);
      return this.write(session.profileId, session.db, destination, 'manual', onProgress);
    });
    return {
      fileName: basename(destination),
      files: manifest.media.files,
      missing: manifest.media.missing,
    };
  }

  /**
   * Writes an automatic backup of a closed profile in the app's `backups` folder, before it is
   * deleted, and keeps only the most recent automatic backups. Resolves to its path, or to
   * null when the profile has no library (its folder was removed outside the app).
   */
  async createBeforeDelete(
    profileId: string,
    onProgress: BackupProgressListener,
  ): Promise<string | null> {
    const libraryPath = this.deps.paths.libraryDatabase(profileId);
    if (!existsSync(libraryPath)) return null;
    return this.deps.lock.run(async () => {
      const db = openDatabase(libraryPath);
      try {
        return await this.writeAutomatic(profileId, db, 'before-delete', onProgress);
      } finally {
        db.close();
      }
    });
  }

  /**
   * Writes an automatic backup of a profile in the app's `backups` folder and keeps only the
   * most recent ones. Resolves to its path. The caller must hold the lock (a restore does,
   * for the backup of the state it replaces).
   */
  async writeAutomatic(
    profileId: string,
    db: SqliteDatabase,
    reason: AutomaticBackupReason,
    onProgress: BackupProgressListener,
  ): Promise<string> {
    const destination = this.automaticDestination(profileId, reason);
    await this.write(profileId, db, destination, reason, onProgress);
    this.pruneAutomaticBackups();
    return destination;
  }

  /**
   * Writes a scheduled backup of a profile and keeps only its most recent ones. If nothing
   * changed since the last one, nothing is written. The profile may be closed meanwhile: its
   * library is only read at the start. The caller must hold the lock.
   */
  async writeScheduled(profileId: string, db: SqliteDatabase, signal: AbortSignal): Promise<void> {
    const dir = this.deps.paths.scheduledBackupsDir(profileId);
    const date = this.deps.now();
    const last = this.lastScheduled(profileId, date);
    const { name } = this.profileRow(profileId);
    const destination = freePath(dir, (copy) => scheduledBackupFileName(name, date, copy));
    const written = await this.write(profileId, db, destination, 'scheduled', () => {}, {
      signal,
      unlessSameAs: last && join(dir, last.fileName),
    });
    if (written === null) return;
    const remove = scheduledBackupsToRemove(
      readdirSync(dir),
      SCHEDULED_BACKUPS_KEPT,
      basename(destination),
    );
    for (const fileName of remove) removeIfPossible(join(dir, fileName));
  }

  /** When the last scheduled backup of a profile was saved, as its file name says. */
  lastScheduledAt(profileId: string): Date | null {
    return this.lastScheduled(profileId, this.deps.now())?.madeAt ?? null;
  }

  /**
   * Removes the scheduled backups of a profile that was deleted. If Windows still holds one of
   * them, what is left of the folder is removed at the next start.
   */
  removeScheduled(profileId: string): void {
    const { paths } = this.deps;
    const dir = paths.scheduledBackupsDir(profileId);
    if (!existsSync(dir)) return;
    const deletedDir = paths.deletedScheduledBackupsDir(profileId);
    try {
      renameSync(dir, deletedDir);
    } catch (error) {
      // The profile is already deleted: what is left of its backups must not make that fail.
      console.warn(`Could not set aside "${dir}" to remove it`, error);
      removeIfPossible(dir);
      return;
    }
    removeIfPossible(deletedDir);
  }

  /** Opens the folder of automatic backups in the file explorer. */
  async openAutomaticFolder(): Promise<void> {
    await this.openFolder(this.deps.paths.backupsDir);
  }

  /** Opens the folder of the open profile's scheduled backups in the file explorer. */
  async openScheduledFolder(token: string): Promise<void> {
    const { profileId } = this.deps.sessions.require(token);
    await this.openFolder(this.deps.paths.scheduledBackupsDir(profileId));
  }

  /** At startup: removes what a backup interrupted by a crash left in the `backups` folder. */
  removeLeftovers(): void {
    const { backupsDir } = this.deps.paths;
    rmSync(join(backupsDir, '.tmp'), { recursive: true, force: true });
    if (!existsSync(backupsDir)) return;
    removePartials(backupsDir);

    const { scheduledBackupsRoot } = this.deps.paths;
    if (!existsSync(scheduledBackupsRoot)) return;
    try {
      for (const entry of readdirSync(scheduledBackupsRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = join(scheduledBackupsRoot, entry.name);
        if (entry.name.startsWith(DELETED_PROFILE_PREFIX)) removeIfPossible(dir);
        else removePartials(dir);
      }
    } catch (error) {
      // Housekeeping: a folder that cannot be read must not stop the app from starting.
      console.warn(`Could not clean up "${scheduledBackupsRoot}"; will retry later`, error);
    }
  }

  private async openFolder(dir: string): Promise<void> {
    mkdirSync(dir, { recursive: true });
    const error = await this.deps.openFolder(dir);
    if (error !== '') {
      throw new AppError('backup.open_folder_failed', `Could not open ${dir}: ${error}`);
    }
  }

  private lastScheduled(profileId: string, now: Date): ScheduledBackupFile | null {
    const dir = this.deps.paths.scheduledBackupsDir(profileId);
    return existsSync(dir) ? latestScheduledBackup(readdirSync(dir), now) : null;
  }

  /**
   * Writes the backup next to `destination` and renames it into place at the end, so a backup
   * that fails half-way never leaves a damaged .zip under the final name.
   */
  private async write(
    profileId: string,
    db: SqliteDatabase,
    destination: string,
    reason: BackupReason,
    onProgress: BackupProgressListener,
  ): Promise<BackupManifest>;
  /** The same, but resolves to null if `unlessSameAs` already holds the same. */
  private async write(
    profileId: string,
    db: SqliteDatabase,
    destination: string,
    reason: BackupReason,
    onProgress: BackupProgressListener,
    options: WriteOptions,
  ): Promise<BackupManifest | null>;
  private async write(
    profileId: string,
    db: SqliteDatabase,
    destination: string,
    reason: BackupReason,
    onProgress: BackupProgressListener,
    { signal, unlessSameAs = null }: WriteOptions = {},
  ): Promise<BackupManifest | null> {
    const { paths, now } = this.deps;
    const createdAt = now();
    const profile = this.profileRow(profileId);
    // Only one backup is written at a time, so the working folder is all its own.
    const workDir = join(paths.backupsDir, '.tmp');
    const partial = `${destination}.${randomUUID()}.partial`;
    const releaseSweeps = this.deps.media.holdSweeps(profileId);
    try {
      rmSync(workDir, { recursive: true, force: true });
      mkdirSync(workDir, { recursive: true });
      const snapshotPath = join(workDir, 'library.db');
      backupDatabase(db, snapshotPath);
      const snapshot = readLibrarySnapshot(snapshotPath);

      // Only the files the snapshot lists: one imported meanwhile is not in it.
      const store = new MediaStore(paths.mediaDir(profileId), paths.cacheDir(profileId));
      const files: ZipFileEntry[] = [
        {
          sourcePath: snapshotPath,
          name: 'library.db',
          size: statSync(snapshotPath).size,
          compress: true,
        },
      ];
      let mediaBytes = 0;
      let missing = 0;
      for (const file of snapshot.files) {
        const sourcePath = store.filePath(file.store, file.sha256, file.format);
        const size = sizeIfExists(sourcePath);
        // A file deleted by hand: the library shows it as missing, and so will the restored one.
        if (size === null) {
          missing++;
          continue;
        }
        mediaBytes += size;
        files.push({
          sourcePath,
          name: mediaEntryName(file.store, file.sha256, file.format),
          size,
          compress: false,
        });
      }

      const settings = this.deps.settings.getOwnForProfile(profileId);
      const importedBackground = this.importedBackgroundOf(settings);
      const manifest: BackupManifest = {
        format: BACKUP_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion: this.deps.appVersion,
        createdAt: createdAt.toISOString(),
        reason,
        profile: { name: profile.name, createdAt: profile.created_at },
        librarySchemaVersion: snapshot.schemaVersion,
        settings,
        ...(importedBackground && { importedBackground }),
        media: { files: files.length - 1, bytes: mediaBytes, missing },
      };
      if (unlessSameAs !== null && (await this.holdsTheSame(unlessSameAs, manifest, workDir))) {
        return null;
      }
      signal?.throwIfAborted();
      // `backups` exists by now (the working folder is in it); a profile's own folder may not.
      if (reason === 'scheduled') mkdirSync(dirname(destination), { recursive: true });
      const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      await writeZip(
        partial,
        { buffers: [{ name: 'manifest.json', bytes: manifestBytes }], files },
        createdAt,
        progressByPercent(onProgress, 'backup'),
        signal,
      );
      renameSync(partial, destination);
      return manifest;
    } catch (error) {
      rmSync(partial, { force: true });
      if (error instanceof AppError || signal?.aborted === true) throw error;
      // The handler only logs unexpected errors: this one is expected, but its cause matters.
      console.error('Backup failed', error);
      throw new AppError(
        'backup.write_failed',
        `The backup could not be written: ${String(error)}`,
        {
          cause: error,
        },
      );
    } finally {
      rmSync(workDir, { recursive: true, force: true });
      releaseSweeps();
    }
  }

  /**
   * Whether the backup at `path` holds what is about to be saved: the same library, byte by
   * byte (`VACUUM INTO` gives the same file for the same contents), and the same profile name,
   * preferences and stored files. One that cannot be read does not.
   */
  private async holdsTheSame(
    path: string,
    manifest: BackupManifest,
    workDir: string,
  ): Promise<boolean> {
    try {
      const zip = await openZip(path);
      try {
        const manifestEntry = zip.entries.find(({ name }) => name === 'manifest.json');
        const libraryEntry = zip.entries.find(({ name }) => name === 'library.db');
        if (manifestEntry === undefined || libraryEntry === undefined) return false;
        const last = parseBackupManifest(await zip.readBuffer(manifestEntry, MANIFEST_MAX_BYTES));
        if (!isDeepStrictEqual(comparable(last), comparable(manifest))) return false;
        const snapshotPath = join(workDir, 'library.db');
        if (libraryEntry.size !== statSync(snapshotPath).size) return false;
        const lastHash = await zip.extract(libraryEntry, join(workDir, 'last.db'), () => {});
        return lastHash === (await sha256OfFile(snapshotPath));
      } finally {
        zip.close();
      }
    } catch (error) {
      console.warn(`Could not compare with "${path}": a new backup is written`, error);
      return false;
    }
  }

  /** The hash of the imported background a profile's own preference names, if any. */
  private importedBackgroundOf(settings: Partial<AppSettings>): { sha256: string } | null {
    const background = settings.background;
    if (background?.kind !== 'imported') return null;
    const sha256 = this.deps.appDb
      .prepare("SELECT sha256 FROM background_file WHERE id = ? AND store = 'files'")
      .pluck()
      .get(background.id) as string | undefined;
    return sha256 === undefined ? null : { sha256 };
  }

  /** A free name in the `backups` folder; two backups in the same second get "(2)", "(3)"… */
  private automaticDestination(profileId: string, reason: AutomaticBackupReason): string {
    const { paths, now } = this.deps;
    const name = this.profileRow(profileId).name;
    const date = now();
    return freePath(paths.backupsDir, (copy) => automaticBackupFileName(name, reason, date, copy));
  }

  private pruneAutomaticBackups(): void {
    const { backupsDir } = this.deps.paths;
    const remove = automaticBackupsToRemove(readdirSync(backupsDir), AUTOMATIC_BACKUPS_KEPT);
    for (const fileName of remove) removeIfPossible(join(backupsDir, fileName));
  }

  private profileRow(profileId: string): ProfileRow {
    const row = this.deps.appDb
      .prepare('SELECT name, created_at FROM profile WHERE id = ?')
      .get(profileId) as ProfileRow | undefined;
    if (row === undefined) {
      throw new NotFoundError('profile.not_found', `Profile ${profileId} does not exist`);
    }
    return row;
  }
}

/** A path in `dir` that is not taken, with the first copy number that is free. */
function freePath(dir: string, fileName: (copy: number) => string): string {
  for (let copy = 1; ; copy++) {
    const path = join(dir, fileName(copy));
    if (!existsSync(path)) return path;
  }
}

function removePartials(dir: string): void {
  for (const fileName of readdirSync(dir)) {
    if (fileName.endsWith('.partial')) removeIfPossible(join(dir, fileName));
  }
}

/** What tells two backups of a profile apart, besides the library; as plain JSON. */
function comparable(manifest: ReadManifest | BackupManifest): unknown {
  const { profile, settings, importedBackground, media } = manifest;
  return JSON.parse(JSON.stringify({ profile, settings, importedBackground, media }));
}

async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

function sizeIfExists(path: string): number | null {
  try {
    return statSync(path).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
