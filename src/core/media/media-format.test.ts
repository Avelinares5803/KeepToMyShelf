import { describe, expect, it } from 'vitest';
import {
  detectMediaFormat,
  fileExtensionOf,
  isSha256Hex,
  mediaKindOf,
  mimeTypeOf,
} from './media-format';

const bytes = (...parts: (string | number[])[]) =>
  Uint8Array.from(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((char) => char.charCodeAt(0)) : part,
    ),
  );

/** An ISO media "ftyp" box with the given major and compatible brands. */
const ftyp = (major: string, ...compatible: string[]) => {
  const size = 16 + compatible.length * 4;
  return bytes([0, 0, 0, size], 'ftyp', major, [0, 0, 0, 0], ...compatible, 'rest of the file');
};

describe('detectMediaFormat', () => {
  it.each([
    ['jpeg', bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF')],
    ['png', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], 'IHDR')],
    ['gif', bytes('GIF89a', [1, 0, 1, 0])],
    ['gif', bytes('GIF87a', [1, 0, 1, 0])],
    ['webp', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 ')],
    ['avif', ftyp('avif', 'mif1', 'miaf')],
    ['avif', ftyp('avis', 'msf1')],
    ['avif', ftyp('mif1', 'miaf', 'avif')],
    ['pdf', bytes('%PDF-1.7\n')],
    // Some PDF writers put a few bytes before the marker; readers accept it in the first 1 KB.
    ['pdf', bytes([0xef, 0xbb, 0xbf], '%PDF-1.4')],
  ])('recognizes %s by its content', (format, header) => {
    expect(detectMediaFormat(header)).toBe(format);
  });

  it.each([
    ['SVG (it may contain scripts)', bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ['SVG with an XML declaration', bytes('<?xml version="1.0"?><svg>')],
    ['HEIC (same container as AVIF, other brands)', ftyp('heic', 'mif1', 'heix')],
    [
      'a brand mentioned after the end of the ftyp box',
      bytes([0, 0, 0, 16], 'ftyp', 'mif1', [0, 0, 0, 0], 'avif'),
    ],
    ['a RIFF file that is not WebP', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt ')],
    ['TIFF', bytes('II*', [0])],
    ['BMP', bytes('BM', [0, 0, 0, 0])],
    ['text', bytes('Hola, esto no es una imagen')],
    ['an empty file', new Uint8Array()],
    ['a truncated PNG signature', bytes([0x89], 'PNG')],
  ])('rejects %s', (_label, header) => {
    expect(detectMediaFormat(header)).toBeNull();
  });

  it('only looks for the PDF marker in the first kilobyte', () => {
    const late = new Uint8Array(1100);
    late.set(bytes('%PDF-1.7'), 1050);
    expect(detectMediaFormat(late)).toBeNull();
  });

  it('accepts an AVIF whose brand is the last one inside the box', () => {
    const header = ftyp('mif1', 'miaf', 'avif');
    expect(detectMediaFormat(header.subarray(0, 24))).toBe('avif');
  });
});

describe('format details', () => {
  it('separates images from documents', () => {
    expect(mediaKindOf('png')).toBe('image');
    expect(mediaKindOf('gif')).toBe('image');
    expect(mediaKindOf('pdf')).toBe('document');
  });

  it('gives every format its MIME type and a usual extension', () => {
    expect(mimeTypeOf('avif')).toBe('image/avif');
    expect(mimeTypeOf('pdf')).toBe('application/pdf');
    expect(fileExtensionOf('jpeg')).toBe('jpg');
    expect(fileExtensionOf('webp')).toBe('webp');
  });
});

describe('isSha256Hex', () => {
  it('accepts 64 lowercase hexadecimal characters', () => {
    expect(isSha256Hex('a'.repeat(64))).toBe(true);
    expect(isSha256Hex('0123456789abcdef'.repeat(4))).toBe(true);
  });

  it.each(['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), `${'a'.repeat(62)}..`, '../x'])(
    'rejects %j',
    (value) => {
      expect(isSha256Hex(value)).toBe(false);
    },
  );
});
