import { createHash } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import {
  assertChoiceAllowed,
  assertWithinSizeLimit,
  DEFAULT_MEDIA_LIMITS,
  fitsWithin,
  THUMBNAIL_SIZES,
  type ImageStorageChoice,
  type MediaLimits,
  type ThumbnailSize,
} from '../../core/media/import-rules';
import {
  detectMediaFormat,
  mediaKindOf,
  mimeTypeOf,
  SIGNATURE_BYTES,
  type MediaFormat,
  type MediaKind,
} from '../../core/media/media-format';
import type { ItemMedia, MediaAttachment, PreparedImport } from '../../shared/media';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import {
  createThumbnail,
  inspectImage,
  optimizeImage,
} from '../infrastructure/media/image-processor';
import { MediaStore, type MediaStoreName } from '../infrastructure/media/media-store';
import type { DataPaths } from '../infrastructure/paths';
import type { ProfileSession, SessionManager } from './session-manager';

export interface MediaServiceDeps {
  readonly sessions: SessionManager;
  readonly paths: DataPaths;
  readonly now: () => Date;
  readonly limits?: MediaLimits;
}

/** What `ItemService` needs: removing the files no item uses after a permanent deletion. */
export interface MediaCleanup {
  sweep(token: string): void;
}

/** A file waiting in media/.tmp until the user confirms how to keep it. */
interface PreparedFile {
  readonly path: string;
  readonly sha256: string;
  readonly format: MediaFormat;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
}

interface Preparation {
  readonly token: string;
  readonly folder: string;
  readonly summary: PreparedImport;
  readonly source: PreparedFile;
  readonly optimized: PreparedFile | null;
  /** Thumbnails made from the source; they serve whichever file ends up being used. */
  readonly thumbnails: ReadonlyMap<ThumbnailSize, string>;
}

interface FileRow {
  id: number;
  sha256: string;
  store: MediaStoreName;
  kind: MediaKind;
  format: MediaFormat;
  byte_size: number;
  width: number | null;
  height: number | null;
  is_animated: number;
  original_id: number | null;
}

interface AttachmentRow extends FileRow {
  label: string | null;
}

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Windows refuses to delete a file another program has open; the next sweep retries.
const LOCKED_FILE_CODES = new Set(['EBUSY', 'EPERM']);

/**
 * Images and documents of the open profile. Files are copied into the profile's media
 * folder (the chosen file is never modified) and the database decides which files exist:
 * rows are deleted first and a sweep then removes the files no row refers to.
 */
export class MediaService implements MediaCleanup {
  private readonly preparations = new Map<string, Preparation>();
  private readonly limits: MediaLimits;

  constructor(private readonly deps: MediaServiceDeps) {
    this.limits = deps.limits ?? DEFAULT_MEDIA_LIMITS;
  }

  /**
   * Checks a chosen file and prepares everything needed to save it, without saving it yet:
   * the format is judged by the content, and images get their optimized copy and thumbnails.
   */
  async prepareImport(token: string, sourcePath: string): Promise<PreparedImport> {
    this.deps.sessions.require(token);
    const fileName = basename(sourcePath);
    const format = await readFormat(sourcePath);
    const kind = mediaKindOf(format);
    // Checked before reading, so a huge file is never loaded into memory; and again after,
    // in case it grew in between.
    assertWithinSizeLimit(kind, (await stat(sourcePath)).size, this.limits);
    // The bytes are read once and copied from memory, so the file the user changes or
    // replaces afterwards is never the one stored.
    const bytes = await readFile(sourcePath);
    assertWithinSizeLimit(kind, bytes.length, this.limits);

    let info = null;
    let optimized = null;
    const thumbnails = new Map<ThumbnailSize, Buffer>();
    if (format !== 'pdf') {
      info = await inspectImage(bytes, format);
      if (!info.isAnimated) optimized = await optimizeImage(bytes, this.limits.optimizedMaxSide);
      for (const size of THUMBNAIL_SIZES) {
        thumbnails.set(size, (await createThumbnail(bytes, size)).bytes);
      }
    }

    // The profile may have been closed while the image was being processed.
    const session = this.deps.sessions.require(token);
    const store = this.store(session);
    const folder = store.createTempFolder();
    const write = (name: string, data: Uint8Array) => {
      const path = join(folder, name);
      writeFileSync(path, data);
      return path;
    };

    const source: PreparedFile = {
      path: write('source', bytes),
      sha256: sha256Of(bytes),
      format,
      byteSize: bytes.length,
      width: info?.width ?? null,
      height: info?.height ?? null,
    };
    const optimizedFile: PreparedFile | null = optimized && {
      path: write('optimized', optimized.bytes),
      sha256: sha256Of(optimized.bytes),
      format: 'webp',
      byteSize: optimized.bytes.length,
      width: optimized.width,
      height: optimized.height,
    };
    const thumbnailPaths = new Map(
      [...thumbnails].map(([size, data]) => [size, write(`thumb-${size}`, data)] as const),
    );

    const id = basename(folder);
    const summary: PreparedImport = {
      id,
      fileName,
      kind,
      format,
      byteSize: source.byteSize,
      width: source.width,
      height: source.height,
      isAnimated: info?.isAnimated ?? false,
      fitsOptimizedSize:
        info !== null && fitsWithin(info.width, info.height, this.limits.optimizedMaxSide),
      optimized: optimizedFile && {
        byteSize: optimizedFile.byteSize,
        width: optimizedFile.width!,
        height: optimizedFile.height!,
      },
    };
    this.preparations.set(id, {
      token,
      folder,
      summary,
      source,
      optimized: optimizedFile,
      thumbnails: thumbnailPaths,
    });
    return summary;
  }

  /** Forgets a prepared import the user cancelled. */
  discardImport(token: string, preparedId: string): void {
    this.deps.sessions.require(token);
    const preparation = this.preparations.get(preparedId);
    if (preparation === undefined || preparation.token !== token) return;
    this.preparations.delete(preparedId);
    rmSync(preparation.folder, { recursive: true, force: true });
  }

  /**
   * Saves a prepared file and adds it at the end of the item's images or documents.
   * `choice` says how an image is kept; documents are always kept as they are.
   */
  commitImport(
    token: string,
    preparedId: string,
    itemId: number,
    choice: ImageStorageChoice | null,
  ): MediaAttachment {
    const session = this.deps.sessions.require(token);
    const preparation = this.preparations.get(preparedId);
    if (preparation === undefined || preparation.token !== token) {
      throw new NotFoundError('media.import_expired', `Prepared import ${preparedId} is gone`);
    }
    const { db } = session;
    assertEditableItem(db, itemId);
    const { summary, source, optimized } = preparation;

    let used: PreparedFile = source;
    let original: PreparedFile | null = null;
    if (summary.kind === 'image') {
      if (choice === null) {
        throw new ValidationError('media.choice_required', 'Choose how to keep the image');
      }
      assertChoiceAllowed(choice, summary.isAnimated);
      if (choice !== 'original') {
        // Only animated images have no optimized copy, and they only allow 'original'.
        used = optimized!;
        if (choice === 'optimized_with_original') original = source;
      }
    }

    // Files go to their place first and rows are written after, in one go: nothing here
    // awaits, so no sweep can run in between. If writing the rows fails, the sweep removes
    // the files that were just placed.
    const store = this.store(session);
    const place = (file: PreparedFile, storeName: MediaStoreName) =>
      store.place(file.path, store.filePath(storeName, file.sha256, file.format));
    place(used, 'files');
    if (original !== null) place(original, 'originals');
    if (summary.kind === 'image') {
      for (const [size, path] of preparation.thumbnails) {
        store.place(path, store.thumbnailPath(used.sha256, size));
      }
    }

    let mediaId: number;
    try {
      mediaId = db.transaction(() => {
        const originalId =
          original === null ? null : this.findOrInsertFile(db, original, 'originals', null, false);
        const id = this.findOrInsertFile(db, used, 'files', originalId, summary.isAnimated);
        if (
          db.prepare('SELECT 1 FROM item_media WHERE item_id = ? AND media_id = ?').get(itemId, id)
        ) {
          throw new ConflictError(
            'media.already_attached',
            `Item ${itemId} already has file ${id}`,
          );
        }
        const nextOrder = db
          .prepare(
            `SELECT COALESCE(MAX(im.sort_order) + 1, 0) FROM item_media im
             JOIN media_file f ON f.id = im.media_id
             WHERE im.item_id = ? AND f.kind = ?`,
          )
          .pluck()
          .get(itemId, summary.kind) as number;
        db.prepare(
          'INSERT INTO item_media (item_id, media_id, label, sort_order) VALUES (?, ?, ?, ?)',
        ).run(itemId, id, summary.kind === 'document' ? summary.fileName : null, nextOrder);
        return id;
      })();
    } catch (error) {
      this.sweepSession(session);
      throw error;
    } finally {
      this.preparations.delete(preparedId);
      store.removeTempFolder(preparation.folder);
    }

    return this.readAttachments(session, itemId).find((media) => media.mediaId === mediaId)!;
  }

  list(token: string, itemId: number): ItemMedia {
    const session = this.deps.sessions.require(token);
    assertItemExists(session.db, itemId);
    const attachments = this.readAttachments(session, itemId);
    return {
      images: attachments.filter((media) => media.kind === 'image'),
      documents: attachments.filter((media) => media.kind === 'document'),
    };
  }

  /** Sets the order of the item's images or documents; `mediaIds` must list all of them. */
  reorder(token: string, itemId: number, kind: MediaKind, mediaIds: readonly number[]): void {
    const { db } = this.deps.sessions.require(token);
    assertEditableItem(db, itemId);
    const current = attachedIds(db, itemId, kind);
    const sameSet =
      mediaIds.length === current.length &&
      new Set(mediaIds).size === mediaIds.length &&
      mediaIds.every((id) => current.includes(id));
    if (!sameSet) {
      throw new ValidationError('media.invalid_order', 'The new order must list every file once');
    }
    writeOrder(db, itemId, mediaIds);
  }

  /** "Use as cover": moves an image to the first place. */
  setCover(token: string, itemId: number, mediaId: number): void {
    const { db } = this.deps.sessions.require(token);
    assertEditableItem(db, itemId);
    const kind = attachedKind(db, itemId, mediaId);
    if (kind !== 'image') {
      throw new ValidationError('media.cover_must_be_image', 'Only an image can be the cover');
    }
    const others = attachedIds(db, itemId, 'image').filter((id) => id !== mediaId);
    writeOrder(db, itemId, [mediaId, ...others]);
  }

  /** Removes a file from an item; the file itself is deleted if nothing else uses it. */
  detach(token: string, itemId: number, mediaId: number): void {
    const session = this.deps.sessions.require(token);
    assertEditableItem(session.db, itemId);
    attachedKind(session.db, itemId, mediaId);
    session.db
      .prepare('DELETE FROM item_media WHERE item_id = ? AND media_id = ?')
      .run(itemId, mediaId);
    this.sweepSession(session);
  }

  sweep(token: string): void {
    this.sweepSession(this.deps.sessions.require(token));
  }

  /** Called when a profile opens: drops imports left half-way and files nothing uses. */
  onSessionOpened(session: ProfileSession): void {
    this.preparations.clear();
    this.store(session).clearTemp();
    this.sweepSession(session);
  }

  /**
   * A file for a `ktms-media://` URL, only from the open profile and only among the files
   * items use (never the kept originals). A missing thumbnail is made again from its file.
   * Resolves to null when there is nothing to serve.
   */
  async readForProtocol(
    sha256: string,
    thumbnailSize: ThumbnailSize | null,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const session = this.deps.sessions.currentSession();
    if (session === null) return null;
    const row = session.db
      .prepare("SELECT kind, format FROM media_file WHERE sha256 = ? AND store = 'files'")
      .get(sha256) as { kind: MediaKind; format: MediaFormat } | undefined;
    if (row === undefined) return null;

    const store = this.store(session);
    const filePath = store.filePath('files', sha256, row.format);
    if (thumbnailSize === null) {
      const bytes = await readIfExists(filePath);
      return bytes && { bytes, mimeType: mimeTypeOf(row.format) };
    }
    if (row.kind !== 'image') return null;

    const thumbnailPath = store.thumbnailPath(sha256, thumbnailSize);
    const cached = await readIfExists(thumbnailPath);
    if (cached !== null) return { bytes: cached, mimeType: 'image/webp' };
    const source = await readIfExists(filePath);
    if (source === null) return null;
    const { bytes } = await createThumbnail(source, thumbnailSize);
    // Only cache it if the same profile is still open.
    if (this.deps.sessions.currentSession() === session) store.writeThumbnail(thumbnailPath, bytes);
    return { bytes, mimeType: 'image/webp' };
  }

  private store(session: ProfileSession): MediaStore {
    const { paths } = this.deps;
    return new MediaStore(paths.mediaDir(session.profileId), paths.cacheDir(session.profileId));
  }

  /** The same bytes are stored once per folder: an existing row is reused. */
  private findOrInsertFile(
    db: SqliteDatabase,
    file: PreparedFile,
    store: MediaStoreName,
    originalId: number | null,
    isAnimated: boolean,
  ): number {
    const existing = db
      .prepare('SELECT id, original_id FROM media_file WHERE sha256 = ? AND store = ?')
      .get(file.sha256, store) as { id: number; original_id: number | null } | undefined;
    if (existing !== undefined) {
      if (originalId !== null && existing.original_id === null) {
        db.prepare('UPDATE media_file SET original_id = ? WHERE id = ?').run(
          originalId,
          existing.id,
        );
      }
      return existing.id;
    }
    const result = db
      .prepare(
        `INSERT INTO media_file
           (sha256, store, kind, format, byte_size, width, height, is_animated, original_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        file.sha256,
        store,
        mediaKindOf(file.format),
        file.format,
        file.byteSize,
        file.width,
        file.height,
        Number(isAnimated),
        originalId,
        this.deps.now().toISOString(),
      );
    return Number(result.lastInsertRowid);
  }

  private readAttachments(session: ProfileSession, itemId: number): MediaAttachment[] {
    const store = this.store(session);
    const rows = session.db
      .prepare(
        `SELECT f.*, im.label FROM item_media im
         JOIN media_file f ON f.id = im.media_id
         WHERE im.item_id = ? ORDER BY im.sort_order, f.id`,
      )
      .all(itemId) as AttachmentRow[];
    return rows.map((row) => ({
      mediaId: row.id,
      kind: row.kind,
      format: row.format,
      sha256: row.sha256,
      byteSize: row.byte_size,
      width: row.width,
      height: row.height,
      isAnimated: row.is_animated === 1,
      label: row.label,
      hasOriginal: row.original_id !== null,
      isMissing: !existsSync(store.filePath(row.store, row.sha256, row.format)),
    }));
  }

  /**
   * Deletes the rows of files nothing uses (no item, trash included, and not the original of
   * a used copy), then every stored file and thumbnail without a row.
   */
  private sweepSession(session: ProfileSession): void {
    const { db } = session;
    const rows = db.transaction(() => {
      // Removing an unused copy can leave its original unused: repeat until nothing changes.
      const deleteUnused = db.prepare(
        `DELETE FROM media_file
         WHERE id NOT IN (SELECT media_id FROM item_media)
           AND id NOT IN (SELECT original_id FROM media_file WHERE original_id IS NOT NULL)`,
      );
      while (deleteUnused.run().changes > 0);
      return db.prepare('SELECT sha256, store, kind, format FROM media_file').all() as Pick<
        FileRow,
        'sha256' | 'store' | 'kind' | 'format'
      >[];
    })();

    const store = this.store(session);
    const keptFiles = new Set(rows.map((row) => store.filePath(row.store, row.sha256, row.format)));
    const keptThumbnails = new Set(
      rows
        .filter((row) => row.store === 'files' && row.kind === 'image')
        .flatMap((row) => THUMBNAIL_SIZES.map((size) => store.thumbnailPath(row.sha256, size))),
    );
    for (const path of store.listStoredFiles()) if (!keptFiles.has(path)) removeFile(path);
    for (const path of store.listThumbnails()) if (!keptThumbnails.has(path)) removeFile(path);
  }
}

async function readFormat(path: string): Promise<MediaFormat> {
  let header: Uint8Array;
  try {
    const file = await open(path, 'r');
    try {
      const buffer = new Uint8Array(SIGNATURE_BYTES);
      const { bytesRead } = await file.read(buffer, 0, SIGNATURE_BYTES, 0);
      header = buffer.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  } catch (error) {
    throw new NotFoundError('media.source_unreadable', `Cannot read ${path}`, { cause: error });
  }
  const format = detectMediaFormat(header);
  if (format === null) {
    throw new ValidationError('media.unsupported_format', `${path} is not an accepted format`);
  }
  return format;
}

async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function removeFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined || !LOCKED_FILE_CODES.has(code)) throw error;
    console.warn(`Could not remove unused media file ${path} (${code}); will retry later`);
  }
}

function assertItemExists(db: SqliteDatabase, itemId: number): { deleted_at: string | null } {
  const item = db.prepare('SELECT deleted_at FROM item WHERE id = ?').get(itemId) as
    { deleted_at: string | null } | undefined;
  if (item === undefined)
    throw new NotFoundError('item.not_found', `Item ${itemId} does not exist`);
  return item;
}

/** Like the rest of an item, its files cannot be changed while it is in the trash. */
function assertEditableItem(db: SqliteDatabase, itemId: number): void {
  if (assertItemExists(db, itemId).deleted_at !== null) {
    throw new ConflictError('item.in_trash', `Item ${itemId} is in the trash`);
  }
}

function attachedIds(db: SqliteDatabase, itemId: number, kind: MediaKind): number[] {
  return db
    .prepare(
      `SELECT im.media_id FROM item_media im JOIN media_file f ON f.id = im.media_id
       WHERE im.item_id = ? AND f.kind = ? ORDER BY im.sort_order, f.id`,
    )
    .pluck()
    .all(itemId, kind) as number[];
}

function attachedKind(db: SqliteDatabase, itemId: number, mediaId: number): MediaKind {
  const kind = db
    .prepare(
      `SELECT f.kind FROM item_media im JOIN media_file f ON f.id = im.media_id
       WHERE im.item_id = ? AND im.media_id = ?`,
    )
    .pluck()
    .get(itemId, mediaId) as MediaKind | undefined;
  if (kind === undefined) {
    throw new NotFoundError('media.not_attached', `Item ${itemId} has no file ${mediaId}`);
  }
  return kind;
}

function writeOrder(db: SqliteDatabase, itemId: number, mediaIds: readonly number[]): void {
  const update = db.prepare(
    'UPDATE item_media SET sort_order = ? WHERE item_id = ? AND media_id = ?',
  );
  db.transaction(() => mediaIds.forEach((id, index) => update.run(index, itemId, id)))();
}
