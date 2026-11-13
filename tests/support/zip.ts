import yauzl from 'yauzl';

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
