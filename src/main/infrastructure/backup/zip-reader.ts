import { createHash } from 'node:crypto';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32 } from 'node:zlib';
import yauzl from 'yauzl';

/** An entry of the archive, as its central directory describes it. */
export interface ZipEntryInfo {
  /** Its path inside the archive, with "/" between folders. */
  readonly name: string;
  /** Its size once extracted; checked against the bytes really read. */
  readonly size: number;
}

export interface OpenedZip {
  readonly entries: readonly ZipEntryInfo[];
  /** Reads a small entry into memory; refuses one larger than `maxBytes`. */
  readBuffer(entry: ZipEntryInfo, maxBytes: number): Promise<Buffer>;
  /**
   * Writes an entry at `target`, which must not exist yet, and resolves to the SHA-256 of
   * its bytes. It is read and written in chunks, so a large file never sits whole in memory.
   * `onChunk` receives the size of each chunk written.
   */
  extract(entry: ZipEntryInfo, target: string, onChunk: (bytes: number) => void): Promise<string>;
  close(): void;
}

/**
 * Opens a .zip and reads its list of entries (its central directory), without reading any
 * of them yet. yauzl checks each entry's size as it is read, refuses paths with "..",
 * absolute paths and "\" (`strictFileNames`), and supports ZIP64 (over 4 GB). It does not
 * check the CRC-32: this reader does, for every entry it reads.
 */
export async function openZip(path: string): Promise<OpenedZip> {
  const zip = await yauzl.openPromise(path, {
    lazyEntries: true,
    autoClose: false,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  try {
    const entries = await listEntries(zip);
    return new YauzlZip(zip, entries);
  } catch (error) {
    zip.close();
    throw error;
  }
}

class YauzlZip implements OpenedZip {
  readonly entries: readonly ZipEntryInfo[];

  constructor(
    private readonly zip: yauzl.ZipFile,
    private readonly yauzlEntries: ReadonlyMap<string, yauzl.Entry>,
  ) {
    this.entries = [...yauzlEntries.values()].map((entry) => ({
      name: entry.fileName,
      size: entry.uncompressedSize,
    }));
  }

  async readBuffer(entry: ZipEntryInfo, maxBytes: number): Promise<Buffer> {
    if (entry.size > maxBytes) {
      throw new Error(`Entry "${entry.name}" is larger than ${maxBytes} bytes`);
    }
    const source = this.yauzlEntry(entry);
    const stream = await this.zip.openReadStreamPromise(source);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const bytes = Buffer.concat(chunks);
    assertCrc(source, crc32(bytes));
    return bytes;
  }

  async extract(
    entry: ZipEntryInfo,
    target: string,
    onChunk: (bytes: number) => void,
  ): Promise<string> {
    const source = this.yauzlEntry(entry);
    const stream = await this.zip.openReadStreamPromise(source);
    const hash = createHash('sha256');
    let crc = 0;
    const tap = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        hash.update(chunk);
        crc = crc32(chunk, crc);
        onChunk(chunk.length);
        callback(null, chunk);
      },
    });
    mkdirSync(dirname(target), { recursive: true });
    // "wx": fails instead of overwriting a file that is already there.
    await pipeline(stream, tap, createWriteStream(target, { flags: 'wx' }));
    assertCrc(source, crc);
    return hash.digest('hex');
  }

  close(): void {
    this.zip.close();
  }

  private yauzlEntry(entry: ZipEntryInfo): yauzl.Entry {
    const found = this.yauzlEntries.get(entry.name);
    if (found === undefined) throw new Error(`No entry "${entry.name}" in the archive`);
    return found;
  }
}

/** yauzl leaves the CRC-32 to its user: a wrong one means the bytes were changed or damaged. */
function assertCrc(entry: yauzl.Entry, crc: number): void {
  if (crc !== entry.crc32) {
    throw new Error(`Entry "${entry.fileName}" does not match its CRC-32`);
  }
}

/**
 * Every entry by its name. An archive that names the same entry twice, or has an encrypted
 * one, is refused: what would be restored would be ambiguous or unreadable.
 */
function listEntries(zip: yauzl.ZipFile): Promise<Map<string, yauzl.Entry>> {
  return new Promise((resolve, reject) => {
    const entries = new Map<string, yauzl.Entry>();
    const fail = (error: Error) => {
      zip.removeAllListeners('entry');
      reject(error);
    };
    zip.on('error', fail);
    zip.on('entry', (entry: yauzl.Entry) => {
      if (entries.has(entry.fileName)) {
        fail(new Error(`Entry "${entry.fileName}" appears twice`));
        return;
      }
      if (entry.isEncrypted()) {
        fail(new Error(`Entry "${entry.fileName}" is encrypted`));
        return;
      }
      entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.once('end', () => resolve(entries));
    zip.readEntry();
  });
}
