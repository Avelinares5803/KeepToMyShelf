import { createHash } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { NotFoundError, ValidationError } from '../../../core/errors';
import {
  assertChoiceAllowed,
  assertWithinSizeLimit,
  fitsWithin,
  THUMBNAIL_SIZES,
  type ImageStorageChoice,
  type MediaLimits,
  type ThumbnailSize,
} from '../../../core/media/import-rules';
import {
  detectMediaFormat,
  mediaKindOf,
  SIGNATURE_BYTES,
  type MediaFormat,
  type MediaKind,
} from '../../../core/media/media-format';
import type { PreparedImport } from '../../../shared/media';
import {
  createThumbnail,
  inspectImage,
  optimizeImage,
  type EncodedImage,
  type ImageInfo,
} from './image-processor';

/** A file waiting in a temporary folder until the user confirms how to keep it. */
export interface PreparedFile {
  readonly path: string;
  readonly sha256: string;
  readonly format: MediaFormat;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
}

/** A chosen file read and processed in memory, before anything is written. */
export interface ReadImport {
  readonly fileName: string;
  readonly format: MediaFormat;
  readonly kind: MediaKind;
  readonly bytes: Buffer;
  /** Images only. */
  readonly info: ImageInfo | null;
  /** Null for documents and animated images, which are kept as they are. */
  readonly optimized: EncodedImage | null;
  readonly thumbnails: ReadonlyMap<ThumbnailSize, Buffer>;
  readonly optimizedMaxSide: number;
}

/** The files of a prepared import, written to its temporary folder. */
export interface WrittenImport {
  readonly summary: PreparedImport;
  readonly source: PreparedFile;
  readonly optimized: PreparedFile | null;
  /** Thumbnails made from the source; they serve whichever file ends up being used. */
  readonly thumbnails: ReadonlyMap<ThumbnailSize, string>;
}

const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

// Windows refuses to delete a file another program has open; the next sweep retries.
export const LOCKED_FILE_CODES = new Set(['EBUSY', 'EPERM']);

/**
 * Checks a chosen file and processes it in memory: the format is judged by the content, and
 * images get their optimized copy and thumbnails. With `expected`, a file of the other kind
 * is refused before it is read. Nothing is written.
 */
export async function readImport(
  sourcePath: string,
  limits: MediaLimits,
  expected?: MediaKind,
): Promise<ReadImport> {
  const fileName = basename(sourcePath);
  const format = await readFormat(sourcePath);
  const kind = mediaKindOf(format);
  if (expected !== undefined && kind !== expected) {
    throw new ValidationError(
      expected === 'image' ? 'media.not_an_image' : 'media.not_a_document',
      `${fileName} is a ${kind}, not a ${expected}`,
    );
  }
  // Checked before reading, so a huge file is never loaded into memory; and again after,
  // in case it grew in between.
  assertWithinSizeLimit(kind, (await stat(sourcePath)).size, limits);
  // The bytes are read once and copied from memory, so the file the user changes or
  // replaces afterwards is never the one stored.
  const bytes = await readFile(sourcePath);
  assertWithinSizeLimit(kind, bytes.length, limits);

  let info = null;
  let optimized = null;
  const thumbnails = new Map<ThumbnailSize, Buffer>();
  if (format !== 'pdf') {
    info = await inspectImage(bytes, format);
    if (!info.isAnimated) optimized = await optimizeImage(bytes, limits.optimizedMaxSide);
    for (const size of THUMBNAIL_SIZES) {
      thumbnails.set(size, (await createThumbnail(bytes, size)).bytes);
    }
  }
  return {
    fileName,
    format,
    kind,
    bytes,
    info,
    optimized,
    thumbnails,
    optimizedMaxSide: limits.optimizedMaxSide,
  };
}

/**
 * Writes a read import to its temporary folder, whose name becomes the import's id, and
 * describes it for the import window.
 */
export function writeImport(folder: string, read: ReadImport): WrittenImport {
  const write = (name: string, data: Uint8Array) => {
    const path = join(folder, name);
    writeFileSync(path, data);
    return path;
  };
  const { info, optimized } = read;

  const source: PreparedFile = {
    path: write('source', read.bytes),
    sha256: sha256Of(read.bytes),
    format: read.format,
    byteSize: read.bytes.length,
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
  const thumbnails = new Map(
    [...read.thumbnails].map(([size, data]) => [size, write(`thumb-${size}`, data)] as const),
  );

  const summary: PreparedImport = {
    id: basename(folder),
    fileName: read.fileName,
    kind: read.kind,
    format: read.format,
    byteSize: source.byteSize,
    width: source.width,
    height: source.height,
    isAnimated: info?.isAnimated ?? false,
    fitsOptimizedSize: info !== null && fitsWithin(info.width, info.height, read.optimizedMaxSide),
    optimized: optimizedFile && {
      byteSize: optimizedFile.byteSize,
      width: optimizedFile.width!,
      height: optimizedFile.height!,
    },
  };
  return { summary, source, optimized: optimizedFile, thumbnails };
}

/** Which prepared files a choice keeps: the one that is used, and the original kept apart. */
export function filesForChoice(
  written: Pick<WrittenImport, 'summary' | 'source' | 'optimized'>,
  choice: ImageStorageChoice,
): { used: PreparedFile; original: PreparedFile | null } {
  assertChoiceAllowed(choice, written.summary.isAnimated);
  const { source, optimized } = written;
  if (choice === 'original') return { used: source, original: null };
  // Only animated images have no optimized copy, and they only allow 'original'.
  return { used: optimized!, original: choice === 'optimized_with_original' ? source : null };
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

export async function readIfExists(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** Removes a stored file; one another program keeps open is left for the next sweep. */
export function removeFile(path: string): void {
  try {
    rmSync(path, { force: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined || !LOCKED_FILE_CODES.has(code)) throw error;
    console.warn(`Could not remove unused media file ${path} (${code}); will retry later`);
  }
}
