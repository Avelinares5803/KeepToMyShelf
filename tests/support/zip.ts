import { createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { ZipFile } from 'yazl';

/** An entry to write in a test archive. */
export interface TestZipEntry {
  readonly name: string;
  readonly bytes: Buffer;
  /** Stored as it is (method 0) unless true. */
  readonly compress?: boolean;
}

/**
 * Writes a .zip with exactly these entries, in order (the same name may appear twice).
 * yazl refuses names such as "../x": write a harmless one of the same length and swap it
 * with `replaceInFile`.
 */
export async function writeTestZip(path: string, entries: readonly TestZipEntry[]): Promise<void> {
  const zip = new ZipFile();
  for (const { name, bytes, compress = false } of entries) {
    zip.addBuffer(bytes, name, { compress, mtime: new Date(2026, 10, 14) });
  }
  zip.end();
  await pipeline(zip.outputStream as Readable, createWriteStream(path));
}

/**
 * Replaces every occurrence of `from` with `to` (of the same length) in a file, e.g. an entry
 * name in both the local header and the central directory. Fails if `from` is not there.
 */
export function replaceInFile(path: string, from: Buffer, to: Buffer): void {
  if (from.length !== to.length) throw new Error('Both must have the same length');
  const bytes = readFileSync(path);
  let index = bytes.indexOf(from);
  if (index === -1) throw new Error('Not found in the file');
  while (index !== -1) {
    to.copy(bytes, index);
    index = bytes.indexOf(from, index + to.length);
  }
  writeFileSync(path, bytes);
}

export interface ZipEntry {
  readonly bytes: Buffer;
  /** Stored without compression (method 0) or compressed (method 8, deflate). */
  readonly compressed: boolean;
}

/** Every file in a .zip by its path inside it, read with yauzl (which checks each CRC). */
export function readZip(path: string): Promise<Map<string, ZipEntry>> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (openError, zip) => {
      if (openError) return reject(openError);
      const entries = new Map<string, ZipEntry>();
      zip.on('error', reject);
      zip.on('end', () => resolve(entries));
      zip.on('entry', (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) return reject(streamError);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            entries.set(entry.fileName, {
              bytes: Buffer.concat(chunks),
              compressed: entry.compressionMethod !== 0,
            });
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}
