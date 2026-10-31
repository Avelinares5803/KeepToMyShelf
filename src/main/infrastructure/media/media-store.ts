import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ThumbnailSize } from '../../../core/media/import-rules';
import { fileExtensionOf, isSha256Hex, type MediaFormat } from '../../../core/media/media-format';

/** The two folders of stored files; see migration 0004. */
export type MediaStoreName = 'files' | 'originals';

const STORES: readonly MediaStoreName[] = ['files', 'originals'];

const STORED_FILE_NAME = /^[0-9a-f]{64}\.(jpg|png|webp|avif|gif|pdf)$/;
const THUMBNAIL_FILE_NAME = /^[0-9a-f]{64}-\d+\.webp$/;

function assertSha(sha256: string): string {
  if (!isSha256Hex(sha256)) throw new Error(`Invalid SHA-256: ${sha256}`);
  return sha256;
}

/**
 * Files of one profile on disk:
 *
 *   media/files/ab/ab12…ef.webp        files used by items
 *   media/originals/ab/ab12…ef.jpg     originals kept next to an optimized copy
 *   media/.tmp/<id>/                   imports being prepared; emptied when the profile opens
 *   cache/thumbs/ab/ab12…ef-320.webp   thumbnails, regenerated when missing
 *
 * Files are named by their SHA-256, so a name never depends on user input, and two files
 * with the same name always have the same bytes. The two-character subfolder keeps any
 * folder from holding thousands of files.
 */
export class MediaStore {
  constructor(
    private readonly mediaDir: string,
    private readonly cacheDir: string,
  ) {}

  filePath(store: MediaStoreName, sha256: string, format: MediaFormat): string {
    const sha = assertSha(sha256);
    return join(this.mediaDir, store, sha.slice(0, 2), `${sha}.${fileExtensionOf(format)}`);
  }

  thumbnailPath(sha256: string, size: ThumbnailSize): string {
    const sha = assertSha(sha256);
    return join(this.cacheDir, 'thumbs', sha.slice(0, 2), `${sha}-${size}.webp`);
  }

  /** A new empty folder for the files of one import being prepared. */
  createTempFolder(): string {
    const folder = join(this.mediaDir, '.tmp', randomUUID());
    mkdirSync(folder, { recursive: true });
    return folder;
  }

  removeTempFolder(folder: string): void {
    rmSync(folder, { recursive: true, force: true });
  }

  /** Discards every import left half-way (e.g. the app was closed while preparing one). */
  clearTemp(): void {
    rmSync(join(this.mediaDir, '.tmp'), { recursive: true, force: true });
  }

  /**
   * Moves a prepared file to its final place. Returns false when the same file was already
   * stored (same name, so same bytes); the prepared copy is then left where it was.
   */
  place(preparedFile: string, target: string): boolean {
    if (existsSync(target)) return false;
    mkdirSync(dirname(target), { recursive: true });
    renameSync(preparedFile, target);
    return true;
  }

  /** Writes a regenerated thumbnail; written apart and renamed, so a reader never sees half. */
  writeThumbnail(target: string, bytes: Uint8Array): void {
    mkdirSync(dirname(target), { recursive: true });
    const partial = `${target}.${randomUUID()}.partial`;
    writeFileSync(partial, bytes);
    renameSync(partial, target);
  }

  /** Every stored file, in both folders. Files not named like stored files are ignored. */
  listStoredFiles(): string[] {
    return STORES.flatMap((store) => listNamed(join(this.mediaDir, store), STORED_FILE_NAME));
  }

  listThumbnails(): string[] {
    return listNamed(join(this.cacheDir, 'thumbs'), THUMBNAIL_FILE_NAME);
  }
}

/** Files directly inside the subfolders of `root` whose name matches `pattern`. */
function listNamed(root: string, pattern: RegExp): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((folder) =>
      readdirSync(join(root, folder.name), { withFileTypes: true })
        .filter((entry) => entry.isFile() && pattern.test(entry.name))
        .map((entry) => join(root, folder.name, entry.name)),
    );
}
