import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { mediaEntryName } from '../../core/backups/backup-entries';
import {
  automaticBackupFileName,
  automaticBackupsToRemove,
  manualBackupFileName,
  type AutomaticBackupReason,
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
import { writeZip, type ZipFileEntry } from '../infrastructure/backup/zip-writer';
import { backupDatabase } from '../infrastructure/db/backup';
import { openDatabase, type SqliteDatabase } from '../infrastructure/db/connection';
import { MediaStore } from '../infrastructure/media/media-store';
import type { DataPaths } from '../infrastructure/paths';
import {
  progressByPercent,
  removeIfPossible,
  type BackupLock,
  type BackupProgressListener,
} from './backup-lock';
import type { SessionManager } from './session-manager';
import type { SettingsService } from './settings-service';

export type { BackupProgressListener } from './backup-lock';

/** How many automatic backups are kept in the app's `backups` folder, for all profiles. */
export const AUTOMATIC_BACKUPS_KEPT = 10;

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
    const session = this.deps.sessions.require(token);
    const manifest = await this.deps.lock.run(() =>
      this.write(session.profileId, session.db, destination, 'manual', onProgress),
    );
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

  /** Opens the folder of automatic backups in the file explorer. */
  async openAutomaticFolder(): Promise<void> {
    const { backupsDir } = this.deps.paths;
    mkdirSync(backupsDir, { recursive: true });
    const error = await this.deps.openFolder(backupsDir);
    if (error !== '') {
      throw new AppError('backup.open_folder_failed', `Could not open ${backupsDir}: ${error}`);
    }
  }

  /** At startup: removes what a backup interrupted by a crash left in the `backups` folder. */
  removeLeftovers(): void {
    const { backupsDir } = this.deps.paths;
    rmSync(join(backupsDir, '.tmp'), { recursive: true, force: true });
    if (!existsSync(backupsDir)) return;
    for (const fileName of readdirSync(backupsDir)) {
      if (fileName.endsWith('.partial')) removeIfPossible(join(backupsDir, fileName));
    }
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
  ): Promise<BackupManifest> {
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
      const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

      await writeZip(
        partial,
        { buffers: [{ name: 'manifest.json', bytes: manifestBytes }], files },
        createdAt,
        progressByPercent(onProgress, 'backup'),
      );
      renameSync(partial, destination);
      return manifest;
    } catch (error) {
      rmSync(partial, { force: true });
      if (error instanceof AppError) throw error;
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
    for (let copy = 1; ; copy++) {
      const destination = join(paths.backupsDir, automaticBackupFileName(name, reason, date, copy));
      if (!existsSync(destination)) return destination;
    }
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

function sizeIfExists(path: string): number | null {
  try {
    return statSync(path).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
