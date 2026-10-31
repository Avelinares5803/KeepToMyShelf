/** File formats the app accepts. Anything else (SVG, HEIC, TIFF...) is rejected. */
export type MediaFormat = 'jpeg' | 'png' | 'webp' | 'avif' | 'gif' | 'pdf';

export type MediaKind = 'image' | 'document';

/** How many bytes from the start of a file `detectMediaFormat` needs to look at. */
export const SIGNATURE_BYTES = 1024;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

const startsWith = (bytes: Uint8Array, signature: readonly number[]) =>
  bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);

/**
 * AVIF files are ISO media files: a "ftyp" box whose major brand, or one of its compatible
 * brands, is "avif" (still image) or "avis" (image sequence). HEIC uses the same container
 * with other brands, so checking the brand is what tells them apart.
 */
function isAvif(bytes: Uint8Array): boolean {
  if (bytes.length < 16 || ascii(bytes, 4, 8) !== 'ftyp') return false;
  const boxSize = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  const end = Math.min(boxSize, bytes.length);
  // Major brand at 8, minor version at 12, compatible brands from 16 to the end of the box.
  const brands = [ascii(bytes, 8, 12)];
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    brands.push(ascii(bytes, offset, offset + 4));
  }
  return brands.some((brand) => brand === 'avif' || brand === 'avis');
}

/**
 * The format of a file judged by its content ("magic numbers"), never by its extension.
 * `header` is the start of the file, at least `SIGNATURE_BYTES` long when the file is.
 * Returns null for anything that is not an accepted format.
 */
export function detectMediaFormat(header: Uint8Array): MediaFormat | null {
  if (startsWith(header, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (header.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(header, 0, 6))) return 'gif';
  if (header.length >= 12 && ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (isAvif(header)) return 'avif';
  // PDF readers accept the "%PDF-" marker anywhere in the first kilobyte.
  if (ascii(header, 0, Math.min(header.length, SIGNATURE_BYTES)).includes('%PDF-')) return 'pdf';
  return null;
}

export const mediaKindOf = (format: MediaFormat): MediaKind =>
  format === 'pdf' ? 'document' : 'image';

const MIME_TYPES: Record<MediaFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

export const mimeTypeOf = (format: MediaFormat): string => MIME_TYPES[format];

/** Extension of stored files, so they open with the right program from the file explorer. */
export const fileExtensionOf = (format: MediaFormat): string =>
  format === 'jpeg' ? 'jpg' : format;

const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Stored files are named by their SHA-256; only real hashes may become file names. */
export const isSha256Hex = (value: string): boolean => SHA256_HEX.test(value);
