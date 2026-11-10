import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../core/errors';
import {
  cleanDocumentLabel,
  fileNameForLabel,
  labelFromFileName,
} from '../../core/media/document-label';
import {
  DEFAULT_MEDIA_LIMITS,
  THUMBNAIL_SIZES,
  type ImageStorageChoice,
  type MediaLimits,
  type ThumbnailSize,
} from '../../core/media/import-rules';
import {
  mediaKindOf,
  mimeTypeOf,
  type MediaFormat,
  type MediaKind,
} from '../../core/media/media-format';
import type {
  DocumentPlanEntry,
  ImagePlanEntry,
  ItemMedia,
  ItemMediaPlan,
  MediaAttachment,
  PickedImports,
  PreparedImport,
} from '../../shared/media';
import type { SqliteDatabase } from '../infrastructure/db/connection';
import { createThumbnail } from '../infrastructure/media/image-processor';
import { MediaStore, type MediaStoreName } from '../infrastructure/media/media-store';
import {
  filesForChoice,
  LOCKED_FILE_CODES,
  readIfExists,
  readImport,
  removeFile,
  writeImport,
  type PreparedFile,
} from '../infrastructure/media/prepared-import';
import type { DataPaths } from '../infrastructure/paths';
import type { ProfileSession, SessionManager } from './session-manager';

export interface MediaServiceDeps {
  readonly sessions: SessionManager;
  readonly paths: DataPaths;
  readonly now: () => Date;
  /** Limits for a profile (some are preferences); the defaults otherwise. */
  readonly limitsFor?: (profileId: string) => MediaLimits;
  /** Folder for the copies of documents opened in the system viewer. */
  readonly openedDocumentsDir: string;
  /**
   * Opens a file with the system's default program. Resolves to an error message, or to ''
   * when it worked (like Electron's `shell.openPath`).
   */
  readonly openWithSystem: (path: string) => Promise<string>;
}

/**
 * What `ItemService` needs: saving an item's cover, gallery and documents together with the
 * item, and removing the files no item uses after a permanent deletion.
 */
export interface MediaForItems {
  stageMedia(token: string, plan: ItemMediaPlan): StagedMedia;
  sweep(token: string): void;
}

/**
 * What `CollectionService` needs: saving a collection's cover together with the collection,
 * reading it, and removing the files nothing uses after a collection is deleted.
 */
export interface MediaForCollections {
  stageCollectionCover(token: string, cover: ImagePlanEntry | null): StagedMedia;
  collectionCover(token: string, collectionId: number): MediaAttachment | null;
  sweep(token: string): void;
}

/**
 * The new files of an item (its cover, gallery and documents) or of a collection (its cover),
 * already in place. `write` runs inside the owner's transaction, with the owner's id; then
 * `finish` if it was committed, or `abort` if not.
 */
export interface StagedMedia {
  write(db: SqliteDatabase, ownerId: number): void;
  finish(): void;
  abort(): void;
}

/** An import waiting in media/.tmp until the user confirms how to keep it. */
interface Preparation {
  readonly token: string;
  readonly folder: string;
  readonly summary: PreparedImport;
  readonly source: PreparedFile;
  readonly optimized: PreparedFile | null;
  /** Thumbnails made from the source; they serve whichever file ends up being used. */
  readonly thumbnails: ReadonlyMap<ThumbnailSize, string>;
}

/** A file already stored, described so it can be stored again in the other folder. */
interface StoredFile extends PreparedFile {
  readonly isAnimated: boolean;
}

/** A new cover or gallery image, checked and with its files known. */
type StagedEntry =
  | { readonly kind: 'existing'; readonly mediaId: number }
  | { readonly kind: 'use_original'; readonly mediaId: number; readonly original: StoredFile }
  | {
      readonly kind: 'prepared';
      readonly preparation: Preparation;
      readonly used: PreparedFile;
      readonly original: PreparedFile | null;
    };

/** A new document, checked, with its name already cleaned. */
type StagedDocument =
  | { readonly kind: 'existing'; readonly mediaId: number; readonly label: string }
  | { readonly kind: 'prepared'; readonly preparation: Preparation; readonly label: string };

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

/**
 * Images and documents of the open profile. Files are copied into the profile's media
 * folder (the chosen file is never modified) and the database decides which files exist:
 * rows are deleted first and a sweep then removes the files no row refers to.
 */
export class MediaService implements MediaForItems, MediaForCollections {
  private readonly preparations = new Map<string, Preparation>();

  constructor(private readonly deps: MediaServiceDeps) {}

  /**
   * Prepares the files chosen in the file dialog one after another. Files that cannot be
   * imported, or are not of the `expected` kind, are reported with the reason, without
   * stopping the others.
   */
  async prepareMany(
    token: string,
    sourcePaths: readonly string[],
    expected: MediaKind,
  ): Promise<PickedImports> {
    const prepared: PreparedImport[] = [];
    const rejected: { fileName: string; code: string }[] = [];
    for (const path of sourcePaths) {
      try {
        prepared.push(await this.prepareImport(token, path, expected));
      } catch (error) {
        // A closed session ends the whole import; any other expected error refuses one file.
        if (!(error instanceof AppError) || error.code === 'session.stale') throw error;
        rejected.push({ fileName: basename(path), code: error.code });
      }
    }
    return { prepared, rejected };
  }

  /**
   * Checks a chosen file and prepares everything needed to save it, without saving it yet:
   * the format is judged by the content, and images get their optimized copy and thumbnails.
   * With `expected`, a file of the other kind is refused before it is read.
   */
  async prepareImport(
    token: string,
    sourcePath: string,
    expected?: MediaKind,
  ): Promise<PreparedImport> {
    const limits = this.limitsOf(this.deps.sessions.require(token));
    const read = await readImport(sourcePath, limits, expected);

    // The profile may have been closed while the image was being processed.
    const session = this.deps.sessions.require(token);
    const folder = this.store(session).createTempFolder();
    const written = writeImport(folder, read);
    this.preparations.set(written.summary.id, { token, folder, ...written });
    return written.summary;
  }

  /** Forgets a prepared import the user cancelled. */
  discardImport(token: string, preparedId: string): void {
    this.discardImports(token, [preparedId]);
  }

  /** Forgets prepared imports; ids already saved or discarded are ignored. */
  discardImports(token: string, preparedIds: readonly string[]): void {
    this.deps.sessions.require(token);
    for (const preparedId of preparedIds) {
      const preparation = this.preparations.get(preparedId);
      if (preparation === undefined || preparation.token !== token) continue;
      this.preparations.delete(preparedId);
      rmSync(preparation.folder, { recursive: true, force: true });
    }
  }

  /**
   * Puts in place the files of an item's new cover, gallery and documents. Nothing is written
   * to the database yet: the item's save does it in its own transaction with `write`.
   *
   * Files are copied, not moved, out of the prepared imports: if the save fails (e.g. a
   * catalog value was deleted meanwhile), the imports are still there to try again. The same
   * import may be both the cover and a gallery image: its file is stored once.
   */
  stageMedia(token: string, plan: ItemMediaPlan): StagedMedia {
    const images = this.stageImages(token, plan);
    let documents: StagedMedia | undefined;
    try {
      documents = plan.documents && this.stageDocuments(token, plan.documents);
    } catch (error) {
      // The images were already copied: the sweep removes them.
      images.abort();
      throw error;
    }
    return {
      write: (db, itemId) => {
        images.write(db, itemId);
        documents?.write(db, itemId);
      },
      finish: () => {
        images.finish();
        documents?.finish();
      },
      abort: () => {
        images.abort();
        documents?.abort();
      },
    };
  }

  /** The cover and the gallery of `stageMedia`. */
  private stageImages(token: string, plan: ItemMediaPlan): StagedMedia {
    const session = this.deps.sessions.require(token);
    const store = this.store(session);

    // Everything is checked and resolved before any file is copied.
    const resolve = (entry: ImagePlanEntry) => this.resolveImage(token, session.db, store, entry);
    const gallery = plan.images?.map(resolve);
    const cover =
      plan.cover === undefined || plan.cover === null ? plan.cover : resolve(plan.cover);
    const resolved = [...(gallery ?? []), ...(cover ? [cover] : [])];
    placeImageFiles(store, resolved);

    let removesFiles = false;
    return {
      write: (writeDb, itemId) => {
        const currentGallery = attachedIds(writeDb, itemId, 'image');
        const currentCover = coverIdOf(writeDb, itemId);
        // An image the item already has: its cover or one of its gallery images.
        const current = [...currentGallery, ...(currentCover === null ? [] : [currentCover])];
        const idOf = (entry: StagedEntry) =>
          this.storedImageId(writeDb, entry, current, `Item ${itemId}`);

        const galleryIds = gallery?.map(idOf) ?? currentGallery;
        const coverId = cover === undefined ? currentCover : cover === null ? null : idOf(cover);
        if (new Set(galleryIds).size !== galleryIds.length) {
          throw new ConflictError('media.already_attached', `The same image is listed twice`);
        }
        const kept = [...galleryIds, coverId];
        removesFiles = current.some((id) => !kept.includes(id));

        if (gallery !== undefined) {
          writeDb
            .prepare(
              `DELETE FROM item_media WHERE item_id = ? AND media_id IN
                 (SELECT id FROM media_file WHERE kind = 'image')`,
            )
            .run(itemId);
          const insert = writeDb.prepare(
            'INSERT INTO item_media (item_id, media_id, label, sort_order) VALUES (?, ?, NULL, ?)',
          );
          galleryIds.forEach((id, index) => insert.run(itemId, id, index));
        }
        if (cover !== undefined) {
          writeDb.prepare('UPDATE item SET cover_media_id = ? WHERE id = ?').run(coverId, itemId);
        }
      },
      finish: () => this.finishImages(token, session, resolved, removesFiles),
      // The rows were not written: the sweep removes the files that were just copied.
      abort: () => this.sweepSession(session),
    };
  }

  /**
   * Puts in place the file of a collection's new cover (null: none). Like `stageMedia`,
   * nothing is written to the database until `write`, in the collection's transaction.
   */
  stageCollectionCover(token: string, cover: ImagePlanEntry | null): StagedMedia {
    const session = this.deps.sessions.require(token);
    const store = this.store(session);
    const entry = cover === null ? null : this.resolveImage(token, session.db, store, cover);
    const resolved = entry === null ? [] : [entry];
    placeImageFiles(store, resolved);

    let removesFiles = false;
    return {
      write: (db, collectionId) => {
        const current = collectionCoverIdOf(db, collectionId);
        const coverId =
          entry === null
            ? null
            : this.storedImageId(
                db,
                entry,
                current === null ? [] : [current],
                `Collection ${collectionId}`,
              );
        removesFiles = current !== null && current !== coverId;
        db.prepare('UPDATE collection SET cover_media_id = ? WHERE id = ?').run(
          coverId,
          collectionId,
        );
      },
      finish: () => this.finishImages(token, session, resolved, removesFiles),
      abort: () => this.sweepSession(session),
    };
  }

  /** A collection's cover, or null when it has none. */
  collectionCover(token: string, collectionId: number): MediaAttachment | null {
    const session = this.deps.sessions.require(token);
    const row = session.db
      .prepare(
        `SELECT f.*, NULL AS label FROM collection c JOIN media_file f ON f.id = c.cover_media_id
         WHERE c.id = ?`,
      )
      .get(collectionId) as AttachmentRow | undefined;
    return row === undefined ? null : toAttachment(this.store(session), row);
  }

  /** Checks a new cover or gallery image and finds its files, without copying anything. */
  private resolveImage(
    token: string,
    db: SqliteDatabase,
    store: MediaStore,
    entry: ImagePlanEntry,
  ): StagedEntry {
    if (entry.kind === 'existing') return { kind: 'existing', mediaId: entry.mediaId };
    if (entry.kind === 'use_original') {
      return {
        kind: 'use_original',
        mediaId: entry.mediaId,
        original: keptOriginal(db, store, entry.mediaId),
      };
    }
    const preparation = this.preparationOf(token, entry.preparedId);
    if (preparation.summary.kind !== 'image') {
      throw new ValidationError('media.not_an_image', `${entry.preparedId} is not an image`);
    }
    return { kind: 'prepared', preparation, ...filesForChoice(preparation, entry.choice) };
  }

  /**
   * The row of the file a resolved image ends up using, written inside the owner's
   * transaction. `current` holds the images the owner already has: only those can be kept
   * or replaced by their original.
   */
  private storedImageId(
    db: SqliteDatabase,
    entry: StagedEntry,
    current: readonly number[],
    owner: string,
  ): number {
    if (entry.kind !== 'prepared' && !current.includes(entry.mediaId)) {
      throw new NotFoundError('media.not_attached', `${owner} has no file ${entry.mediaId}`);
    }
    switch (entry.kind) {
      case 'existing':
        return entry.mediaId;
      case 'use_original':
        return this.findOrInsertFile(db, entry.original, 'files', null, entry.original.isAnimated);
      case 'prepared': {
        const originalId =
          entry.original === null
            ? null
            : this.findOrInsertFile(db, entry.original, 'originals', null, false);
        return this.findOrInsertFile(
          db,
          entry.used,
          'files',
          originalId,
          entry.preparation.summary.isAnimated,
        );
      }
    }
  }

  /** After a committed save: releases the imports used, and sweeps if a file was dropped. */
  private finishImages(
    token: string,
    session: ProfileSession,
    resolved: readonly StagedEntry[],
    removesFiles: boolean,
  ): void {
    const used = resolved.flatMap((entry) =>
      entry.kind === 'prepared' ? [entry.preparation.summary.id] : [],
    );
    this.discardImports(token, used);
    if (removesFiles) this.sweepSession(session);
  }

  /** The documents of `stageMedia`: PDFs are stored as they are, with the name given. */
  private stageDocuments(token: string, entries: readonly DocumentPlanEntry[]): StagedMedia {
    const session = this.deps.sessions.require(token);
    const store = this.store(session);

    // Everything is checked before any file is copied.
    const resolved = entries.map((entry): StagedDocument => {
      const label = cleanDocumentLabel(entry.label);
      if (entry.kind === 'existing') return { kind: 'existing', mediaId: entry.mediaId, label };
      const preparation = this.preparationOf(token, entry.preparedId);
      if (preparation.summary.kind !== 'document') {
        throw new ValidationError('media.not_a_document', `${entry.preparedId} is not a PDF`);
      }
      return { kind: 'prepared', preparation, label };
    });

    for (const entry of resolved) {
      if (entry.kind !== 'prepared') continue;
      const { source } = entry.preparation;
      store.copyIn(source.path, store.filePath('files', source.sha256, source.format));
    }

    let removesFiles = false;
    return {
      write: (db, itemId) => {
        const current = attachedIds(db, itemId, 'document');
        const ids = resolved.map((entry) => {
          if (entry.kind === 'prepared') {
            return this.findOrInsertFile(db, entry.preparation.source, 'files', null, false);
          }
          if (!current.includes(entry.mediaId)) {
            throw new NotFoundError(
              'media.not_attached',
              `Item ${itemId} has no file ${entry.mediaId}`,
            );
          }
          return entry.mediaId;
        });
        if (new Set(ids).size !== ids.length) {
          throw new ConflictError('media.already_attached', 'The same document is listed twice');
        }
        removesFiles = current.some((id) => !ids.includes(id));

        db.prepare(
          `DELETE FROM item_media WHERE item_id = ? AND media_id IN
             (SELECT id FROM media_file WHERE kind = 'document')`,
        ).run(itemId);
        const insert = db.prepare(
          'INSERT INTO item_media (item_id, media_id, label, sort_order) VALUES (?, ?, ?, ?)',
        );
        ids.forEach((id, index) => insert.run(itemId, id, resolved[index]!.label, index));
      },
      finish: () => {
        const used = resolved.flatMap((entry) =>
          entry.kind === 'prepared' ? [entry.preparation.summary.id] : [],
        );
        this.discardImports(token, used);
        if (removesFiles) this.sweepSession(session);
      },
      abort: () => this.sweepSession(session),
    };
  }

  /**
   * Opens one of an item's documents in the system's PDF viewer. A copy named after the
   * document is opened: the viewer shows its name, and anything it saves (annotations…)
   * never changes the stored file, whose name must keep matching its bytes.
   */
  async openDocument(token: string, itemId: number, mediaId: number): Promise<void> {
    const session = this.deps.sessions.require(token);
    const row = session.db
      .prepare(
        `SELECT f.*, im.label FROM item_media im JOIN media_file f ON f.id = im.media_id
         WHERE im.item_id = ? AND im.media_id = ? AND f.kind = 'document'`,
      )
      .get(itemId, mediaId) as AttachmentRow | undefined;
    if (row === undefined) {
      throw new NotFoundError('media.not_attached', `Item ${itemId} has no document ${mediaId}`);
    }
    const stored = this.store(session).filePath('files', row.sha256, row.format);
    if (!existsSync(stored)) {
      throw new NotFoundError('media.file_missing', `${stored} was deleted`);
    }

    // A folder per opening: two documents with the same name never clash, and a copy the
    // viewer keeps open never stops another one from being made.
    const folder = join(this.deps.openedDocumentsDir, randomUUID());
    mkdirSync(folder, { recursive: true });
    // Documents always have a name; an empty one would become "document.pdf".
    const copy = join(folder, fileNameForLabel(row.label ?? ''));
    await copyFile(stored, copy);
    const failure = await this.deps.openWithSystem(copy);
    if (failure !== '') {
      throw new AppError('media.open_failed', `Could not open ${copy}: ${failure}`);
    }
  }

  /**
   * Removes the copies of opened documents. A copy a viewer still has open cannot be removed
   * on Windows: it is left for the next time.
   */
  clearOpenedDocuments(): void {
    const dir = this.deps.openedDocumentsDir;
    if (!existsSync(dir)) return;
    for (const folder of readdirSync(dir)) {
      try {
        rmSync(join(dir, folder), { recursive: true, force: true });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === undefined || !LOCKED_FILE_CODES.has(code)) throw error;
        console.warn(`Could not remove an opened document in ${folder} (${code}); will retry`);
      }
    }
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
    const preparation = this.preparationOf(token, preparedId);
    const { db } = session;
    assertEditableItem(db, itemId);
    const { summary } = preparation;

    let used: PreparedFile = preparation.source;
    let original: PreparedFile | null = null;
    if (summary.kind === 'image') {
      if (choice === null) {
        throw new ValidationError('media.choice_required', 'Choose how to keep the image');
      }
      ({ used, original } = filesForChoice(preparation, choice));
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
        ).run(
          itemId,
          id,
          summary.kind === 'document' ? labelFromFileName(summary.fileName) : null,
          nextOrder,
        );
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
      cover: this.readCover(session, itemId),
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

  /**
   * Removes a file from an item's gallery or documents; the file itself is deleted if nothing
   * else uses it (the item's cover included).
   */
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

  /** Called before a profile closes (switching profile or quitting): drops unsaved imports. */
  onSessionClosing(session: ProfileSession): void {
    for (const [id, preparation] of this.preparations) {
      if (preparation.token === session.token) this.preparations.delete(id);
    }
    this.store(session).clearTemp();
    this.clearOpenedDocuments();
  }

  /**
   * The thumbnail of an import not saved yet, so the import window and the form can show it.
   * Only imports prepared in the open session are served.
   */
  async readPreparedThumbnail(
    preparedId: string,
    size: ThumbnailSize,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const session = this.deps.sessions.currentSession();
    const preparation = this.preparations.get(preparedId);
    if (session === null || preparation === undefined || preparation.token !== session.token) {
      return null;
    }
    const path = preparation.thumbnails.get(size);
    const bytes = path === undefined ? null : await readIfExists(path);
    return bytes && { bytes, mimeType: 'image/webp' };
  }

  /**
   * An image for a `ktms-media://` URL, only from the open profile and only among the files
   * items use (never the kept originals nor documents). A missing thumbnail is made again.
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
    // Documents never leave the app this way: they open in the system viewer.
    if (row === undefined || row.kind !== 'image') return null;

    const store = this.store(session);
    const filePath = store.filePath('files', sha256, row.format);
    if (thumbnailSize === null) {
      const bytes = await readIfExists(filePath);
      return bytes && { bytes, mimeType: mimeTypeOf(row.format) };
    }
    // A file deleted by hand shows as missing everywhere, even while its thumbnail is cached.
    if (!existsSync(filePath)) return null;

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

  private limitsOf(session: ProfileSession): MediaLimits {
    return this.deps.limitsFor?.(session.profileId) ?? DEFAULT_MEDIA_LIMITS;
  }

  private preparationOf(token: string, preparedId: string): Preparation {
    const preparation = this.preparations.get(preparedId);
    if (preparation === undefined || preparation.token !== token) {
      throw new NotFoundError('media.import_expired', `Prepared import ${preparedId} is gone`);
    }
    return preparation;
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
    return rows.map((row) => toAttachment(store, row));
  }

  private readCover(session: ProfileSession, itemId: number): MediaAttachment | null {
    const row = session.db
      .prepare(
        `SELECT f.*, NULL AS label FROM item JOIN media_file f ON f.id = item.cover_media_id
         WHERE item.id = ?`,
      )
      .get(itemId) as AttachmentRow | undefined;
    return row === undefined ? null : toAttachment(this.store(session), row);
  }

  /**
   * Deletes the rows of files nothing uses (no item's gallery, documents or cover, trash
   * included, no collection's cover, and not the original of a used copy), then every stored
   * file and thumbnail without a row.
   */
  private sweepSession(session: ProfileSession): void {
    const { db } = session;
    const rows = db.transaction(() => {
      // Removing an unused copy can leave its original unused: repeat until nothing changes.
      const deleteUnused = db.prepare(
        `DELETE FROM media_file
         WHERE id NOT IN (SELECT media_id FROM item_media)
           AND id NOT IN (SELECT cover_media_id FROM item WHERE cover_media_id IS NOT NULL)
           AND id NOT IN
             (SELECT cover_media_id FROM collection WHERE cover_media_id IS NOT NULL)
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

function toAttachment(store: MediaStore, row: AttachmentRow): MediaAttachment {
  return {
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
  };
}

function coverIdOf(db: SqliteDatabase, itemId: number): number | null {
  return (
    (db.prepare('SELECT cover_media_id FROM item WHERE id = ?').pluck().get(itemId) as
      number | null | undefined) ?? null
  );
}

function collectionCoverIdOf(db: SqliteDatabase, collectionId: number): number | null {
  return (
    (db.prepare('SELECT cover_media_id FROM collection WHERE id = ?').pluck().get(collectionId) as
      number | null | undefined) ?? null
  );
}

/** Copies the files of new cover or gallery images to their place, with their thumbnails. */
function placeImageFiles(store: MediaStore, entries: readonly StagedEntry[]): void {
  const copy = (file: PreparedFile | StoredFile, storeName: MediaStoreName) =>
    store.copyIn(file.path, store.filePath(storeName, file.sha256, file.format));
  for (const entry of entries) {
    if (entry.kind === 'use_original') copy(entry.original, 'files');
    if (entry.kind !== 'prepared') continue;
    copy(entry.used, 'files');
    if (entry.original !== null) copy(entry.original, 'originals');
    for (const [size, path] of entry.preparation.thumbnails) {
      store.copyIn(path, store.thumbnailPath(entry.used.sha256, size));
    }
  }
}

/** The kept original of an optimized image, for "Use the original". */
function keptOriginal(db: SqliteDatabase, store: MediaStore, mediaId: number): StoredFile {
  const row = db
    .prepare(
      `SELECT o.* FROM media_file f JOIN media_file o ON o.id = f.original_id
       WHERE f.id = ? AND f.store = 'files'`,
    )
    .get(mediaId) as FileRow | undefined;
  if (row === undefined) {
    throw new ValidationError('media.no_original', `File ${mediaId} has no kept original`);
  }
  const path = store.filePath('originals', row.sha256, row.format);
  if (!existsSync(path)) {
    throw new NotFoundError('media.original_missing', `The original of ${mediaId} is missing`);
  }
  return {
    path,
    sha256: row.sha256,
    format: row.format,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    isAnimated: row.is_animated === 1,
  };
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
