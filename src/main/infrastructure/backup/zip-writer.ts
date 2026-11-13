import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { once } from 'node:events';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

/** A file on disk to put in the archive. */
export interface ZipFileEntry {
  /** Where it is on disk. */
  readonly sourcePath: string;
  /** Its path inside the archive, with "/" between folders. */
  readonly name: string;
  /** Its size, known beforehand: the archive fails if the file changed meanwhile. */
  readonly size: number;
  /** Images and PDF are already compressed: compressing them again only takes time. */
  readonly compress: boolean;
}

export interface ZipContents {
  /** Small entries made in memory (e.g. the manifest); always compressed. */
  readonly buffers: readonly { readonly name: string; readonly bytes: Buffer }[];
  readonly files: readonly ZipFileEntry[];
}

/**
 * Writes a .zip at `target`, which must not exist yet. The files are read one after another
 * as the archive is written, so even large ones never sit whole in memory. `onProgress`
 * receives the bytes of the files read so far and their total.
 *
 * If it fails, every file it opened is closed before it rejects, so the caller can remove
 * them at once (Windows refuses to delete a file that is open).
 */
export async function writeZip(
  target: string,
  contents: ZipContents,
  mtime: Date,
  onProgress: (doneBytes: number, totalBytes: number) => void,
): Promise<void> {
  const totalBytes = contents.files.reduce((sum, file) => sum + file.size, 0);
  let doneBytes = 0;
  let failed = false;
  const opened = new Set<ReadStream>();

  const zip = new ZipFile();
  const output = zip.outputStream as Readable;
  // A file that cannot be read (or whose size changed) is reported by yazl on the ZipFile, not
  // on its output: passing it on makes the pipeline below fail with it.
  zip.on('error', (error: Error) => output.destroy(error));

  for (const { name, bytes } of contents.buffers) {
    zip.addBuffer(bytes, name, { mtime, compress: true });
  }
  for (const file of contents.files) {
    // Opened only when its turn comes, so the archive never holds many files open at once.
    zip.addReadStreamLazy(
      file.name,
      { mtime, compress: file.compress, size: file.size },
      (callback) => {
        if (failed) {
          callback(new Error('The archive was abandoned'), undefined as never);
          return;
        }
        const stream = createReadStream(file.sourcePath);
        opened.add(stream);
        stream.on('close', () => opened.delete(stream));
        // yazl listens to the errors of the files it opens itself, not of these.
        stream.on('error', (error) => zip.emit('error', error));
        stream.on('data', (chunk) => {
          doneBytes += chunk.length;
          onProgress(doneBytes, totalBytes);
        });
        callback(null, stream);
      },
    );
  }
  zip.end();

  // Tells that writing has started, before the first file is read.
  onProgress(0, totalBytes);
  try {
    // "wx": fails instead of overwriting a file that is already there.
    await pipeline(output, createWriteStream(target, { flags: 'wx' }));
  } catch (error) {
    failed = true;
    await Promise.all(
      [...opened].map((stream) => {
        const closed = once(stream, 'close');
        stream.destroy();
        return closed;
      }),
    );
    throw error;
  }
}
