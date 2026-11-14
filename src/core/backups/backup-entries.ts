import { fileExtensionOf, isSha256Hex, type MediaFormat } from '../media/media-format';

/** The two folders of stored files of a profile (see library migration 0004). */
export type BackupMediaStore = 'files' | 'originals';

/**
 * What an entry of a backup may be. Nothing else is ever accepted: a backup with any other
 * entry is rejected whole, so no entry name can choose where a file is written.
 */
export type BackupEntry =
  | { readonly kind: 'manifest' }
  | { readonly kind: 'library' }
  | {
      readonly kind: 'media';
      readonly store: BackupMediaStore;
      readonly sha256: string;
      readonly format: MediaFormat;
    };

export const MANIFEST_ENTRY = 'manifest.json';
export const LIBRARY_ENTRY = 'library.db';

const FORMAT_BY_EXTENSION: Readonly<Record<string, MediaFormat>> = {
  jpg: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
  gif: 'gif',
  pdf: 'pdf',
};

const MEDIA_ENTRY = /^media\/(files|originals)\/([0-9a-f]{2})\/([0-9a-f]{64})\.([a-z]+)$/;

/** The path of a stored file inside a backup: "media/files/ab/ab12…ef.webp". */
export function mediaEntryName(
  store: BackupMediaStore,
  sha256: string,
  format: MediaFormat,
): string {
  if (!isSha256Hex(sha256)) throw new Error(`Invalid SHA-256: ${sha256}`);
  return `media/${store}/${sha256.slice(0, 2)}/${sha256}.${fileExtensionOf(format)}`;
}

/**
 * What an entry name of a backup stands for, or null when it is not one a backup may have
 * (any other file, a folder, "..", a "\" or an absolute path).
 */
export function parseBackupEntryName(name: string): BackupEntry | null {
  if (name === MANIFEST_ENTRY) return { kind: 'manifest' };
  if (name === LIBRARY_ENTRY) return { kind: 'library' };
  const match = MEDIA_ENTRY.exec(name);
  if (match === null) return null;
  const [, store, prefix, sha256, extension] = match as unknown as [
    string,
    BackupMediaStore,
    string,
    string,
    string,
  ];
  const format = Object.hasOwn(FORMAT_BY_EXTENSION, extension)
    ? FORMAT_BY_EXTENSION[extension]
    : undefined;
  if (format === undefined || !sha256.startsWith(prefix)) return null;
  return { kind: 'media', store, sha256, format };
}
