import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { AppError, NotFoundError } from '../../core/errors';
import {
  DEFAULT_MEDIA_LIMITS,
  THUMBNAIL_SIZES,
  type ImageStorageChoice,
  type ThumbnailSize,
} from '../../core/media/import-rules';
import { mimeTypeOf, type MediaFormat } from '../../core/media/media-format';
import type { ImportedBackground } from '../../shared/backgrounds';
import type { PickedImports, PreparedImport } from '../../shared/media';
import type { AppSettings } from '../../shared/settings';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import { createThumbnail } from '../infrastructure/media/image-processor';
import { MediaStore, type MediaStoreName } from '../infrastructure/media/media-store';
import {
  filesForChoice,
  readIfExists,
  readImport,
  removeFile,
  writeImport,
  type PreparedFile,
  type WrittenImport,
} from '../infrastructure/media/prepared-import';
import type { SessionManager } from './session-manager';
import type { SettingsService } from './settings-service';

export interface BackgroundServiceDeps {
  readonly appDb: SqliteDatabase;
  /** The backgrounds folder, next to app.db. */
  readonly dir: string;
  readonly sessions: SessionManager;
  readonly settings: SettingsService;
  readonly now: () => Date;
}

/** An import waiting in backgrounds/.tmp until the user confirms how to keep it. */
interface Preparation extends WrittenImport {
  readonly folder: string;
}

interface BackgroundRow {
  id: number;
  sha256: string;
  store: MediaStoreName;
  format: MediaFormat;
  byte_size: number;
  width: number;
  height: number;
  is_animated: number;
  original_id: number | null;
}

/**
 * The gallery of imported backgrounds, shared by every profile. It works with or without an
 * open profile (the profile selection shows backgrounds too), so it needs no session token;
 * a token only says whose preferences apply when importing.
 *
 * Like the media of a profile, files are named by their SHA-256 and the database decides
 * which files exist: rows are deleted first and a sweep then removes the files without a row.
 *
 *   backgrounds/files/ab/ab12…ef.webp        backgrounds of the gallery
 *   backgrounds/originals/ab/ab12…ef.jpg     originals kept next to an optimized copy
 *   backgrounds/.tmp/<id>/                   imports being prepared; emptied at startup
 *   backgrounds/cache/thumbs/ab/…-320.webp   thumbnails, regenerated when missing
 */
export class BackgroundService {
  private readonly preparations = new Map<string, Preparation>();
  private readonly store: MediaStore;

  constructor(private readonly deps: BackgroundServiceDeps) {
    this.store = new MediaStore(deps.dir, join(deps.dir, 'cache'));
  }

  /**
   * Prepares the images chosen in the file dialog, one after another, with the optimized size
   * of the open profile (`token`) or the global one (null: no profile open). Files that cannot
   * be imported are reported with the reason, without stopping the others.
   */
  async prepareMany(token: string | null, sourcePaths: readonly string[]): Promise<PickedImports> {
    const limits = {
      ...DEFAULT_MEDIA_LIMITS,
      optimizedMaxSide: this.preferences(token).backgroundMaxSide,
    };
    const prepared: PreparedImport[] = [];
    const rejected: { fileName: string; code: string }[] = [];
    for (const path of sourcePaths) {
      try {
        const read = await readImport(path, limits, 'image');
        const folder = this.store.createTempFolder();
        const written = writeImport(folder, read);
        this.preparations.set(written.summary.id, { folder, ...written });
        prepared.push(written.summary);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        rejected.push({ fileName: basename(path), code: error.code });
      }
    }
    return { prepared, rejected };
  }

  /** Forgets prepared imports the user cancelled; ids already saved or discarded are ignored. */
  discardImports(preparedIds: readonly string[]): void {
    for (const preparedId of preparedIds) {
      const preparation = this.preparations.get(preparedId);
      if (preparation === undefined) continue;
      this.preparations.delete(preparedId);
      this.store.removeTempFolder(preparation.folder);
    }
  }

  /**
   * Adds a prepared image to the gallery, kept as chosen. The same image imported again is
   * not stored twice: the background it already is comes back.
   */
  commitImport(preparedId: string, choice: ImageStorageChoice): ImportedBackground {
    const preparation = this.preparations.get(preparedId);
    if (preparation === undefined) {
      throw new NotFoundError('media.import_expired', `Prepared import ${preparedId} is gone`);
    }
    const { used, original } = filesForChoice(preparation, choice);

    // Files go to their place first and rows are written after, in one go: nothing here
    // awaits, so no sweep can run in between. If writing the rows fails, the sweep removes
    // the files that were just placed.
    const place = (file: PreparedFile, storeName: MediaStoreName) =>
      this.store.place(file.path, this.store.filePath(storeName, file.sha256, file.format));
    place(used, 'files');
    if (original !== null) place(original, 'originals');
    for (const [size, path] of preparation.thumbnails) {
      this.store.place(path, this.store.thumbnailPath(used.sha256, size));
    }

    const { appDb } = this.deps;
    let id: number;
    try {
      id = appDb.transaction(() => {
        const originalId =
          original === null ? null : this.findOrInsertFile(original, 'originals', null, false);
        return this.findOrInsertFile(used, 'files', originalId, preparation.summary.isAnimated);
      })();
    } catch (error) {
      this.sweep();
      throw error;
    } finally {
      this.preparations.delete(preparedId);
      this.store.removeTempFolder(preparation.folder);
    }
    return this.list().find((background) => background.id === id)!;
  }

  /** The gallery, oldest first. */
  list(): ImportedBackground[] {
    const rows = this.deps.appDb
      .prepare("SELECT * FROM background_file WHERE store = 'files' ORDER BY id")
      .all() as BackgroundRow[];
    const counts = this.profileCounts();
    return rows.map((row) => ({
      id: row.id,
      sha256: row.sha256,
      format: row.format,
      byteSize: row.byte_size,
      width: row.width,
      height: row.height,
      isAnimated: row.is_animated === 1,
      hasOriginal: row.original_id !== null,
      isMissing: !existsSync(this.store.filePath('files', row.sha256, row.format)),
      profileCount: counts.get(row.id) ?? 0,
    }));
  }

  /**
   * Deletes a background from the gallery. Every preference that used it (the global one and
   * the profiles' own) goes back to no background in the same transaction; then its files go.
   */
  delete(backgroundId: number): void {
    const { appDb, settings } = this.deps;
    appDb.transaction(() => {
      const { changes } = appDb
        .prepare("DELETE FROM background_file WHERE id = ? AND store = 'files'")
        .run(backgroundId);
      if (changes === 0) {
        throw new NotFoundError('background.not_found', `Background ${backgroundId} is gone`);
      }
      settings.resetBackground(backgroundId);
    })();
    this.sweep();
  }

  /** Called when the app starts: drops imports left half-way and files nothing uses. */
  onStartup(): void {
    this.preparations.clear();
    this.store.clearTemp();
    this.sweep();
  }

  /** The thumbnail of an import not saved yet, for the import window. */
  async readPreparedThumbnail(
    preparedId: string,
    size: ThumbnailSize,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const path = this.preparations.get(preparedId)?.thumbnails.get(size);
    const bytes = path === undefined ? null : await readIfExists(path);
    return bytes && { bytes, mimeType: 'image/webp' };
  }

  /**
   * A background for a `ktms-media://background/` URL, only among those of the gallery (never
   * the kept originals), with or without an open profile. A missing thumbnail is made again.
   */
  async readForProtocol(
    sha256: string,
    thumbnailSize: ThumbnailSize | null,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const row = this.deps.appDb
      .prepare("SELECT format FROM background_file WHERE sha256 = ? AND store = 'files'")
      .get(sha256) as { format: MediaFormat } | undefined;
    if (row === undefined) return null;

    const filePath = this.store.filePath('files', sha256, row.format);
    if (thumbnailSize === null) {
      const bytes = await readIfExists(filePath);
      return bytes && { bytes, mimeType: mimeTypeOf(row.format) };
    }
    // A file deleted by hand shows as missing everywhere, even while its thumbnail is cached.
    if (!existsSync(filePath)) return null;

    const thumbnailPath = this.store.thumbnailPath(sha256, thumbnailSize);
    const cached = await readIfExists(thumbnailPath);
    if (cached !== null) return { bytes: cached, mimeType: 'image/webp' };
    const source = await readIfExists(filePath);
    if (source === null) return null;
    const { bytes } = await createThumbnail(source, thumbnailSize);
    this.store.writeThumbnail(thumbnailPath, bytes);
    return { bytes, mimeType: 'image/webp' };
  }

  /**
   * Deletes the kept originals no background uses, then every stored file and thumbnail
   * without a row.
   */
  sweep(): void {
    const { appDb } = this.deps;
    const rows = appDb.transaction(() => {
      appDb
        .prepare(
          `DELETE FROM background_file
           WHERE store = 'originals'
             AND id NOT IN (SELECT original_id FROM background_file WHERE original_id IS NOT NULL)`,
        )
        .run();
      return appDb.prepare('SELECT sha256, store, format FROM background_file').all() as Pick<
        BackgroundRow,
        'sha256' | 'store' | 'format'
      >[];
    })();

    const keptFiles = new Set(
      rows.map((row) => this.store.filePath(row.store, row.sha256, row.format)),
    );
    const keptThumbnails = new Set(
      rows
        .filter((row) => row.store === 'files')
        .flatMap((row) =>
          THUMBNAIL_SIZES.map((size) => this.store.thumbnailPath(row.sha256, size)),
        ),
    );
    for (const path of this.store.listStoredFiles()) if (!keptFiles.has(path)) removeFile(path);
    for (const path of this.store.listThumbnails()) {
      if (!keptThumbnails.has(path)) removeFile(path);
    }
  }

  /** The preferences of the open profile, or the global ones when no profile is open. */
  private preferences(token: string | null): AppSettings {
    const { sessions, settings } = this.deps;
    return token === null
      ? settings.getGlobal()
      : settings.getForProfile(sessions.require(token).profileId);
  }

  /** How many profiles show each background, with their own preference or the global one. */
  private profileCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    const profileIds = this.deps.appDb.prepare('SELECT id FROM profile').pluck().all() as string[];
    for (const profileId of profileIds) {
      const { background } = this.deps.settings.getForProfile(profileId);
      if (background.kind !== 'imported') continue;
      counts.set(background.id, (counts.get(background.id) ?? 0) + 1);
    }
    return counts;
  }

  /** The same bytes are stored once per folder: an existing row is reused. */
  private findOrInsertFile(
    file: PreparedFile,
    store: MediaStoreName,
    originalId: number | null,
    isAnimated: boolean,
  ): number {
    const { appDb, now } = this.deps;
    const existing = appDb
      .prepare('SELECT id, original_id FROM background_file WHERE sha256 = ? AND store = ?')
      .get(file.sha256, store) as { id: number; original_id: number | null } | undefined;
    if (existing !== undefined) {
      if (originalId !== null && existing.original_id === null) {
        appDb
          .prepare('UPDATE background_file SET original_id = ? WHERE id = ?')
          .run(originalId, existing.id);
      }
      return existing.id;
    }
    const result = appDb
      .prepare(
        `INSERT INTO background_file
           (sha256, store, format, byte_size, width, height, is_animated, original_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        file.sha256,
        store,
        file.format,
        file.byteSize,
        file.width,
        file.height,
        Number(isAnimated),
        originalId,
        now().toISOString(),
      );
    return Number(result.lastInsertRowid);
  }
}
