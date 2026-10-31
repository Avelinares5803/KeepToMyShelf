import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/** A still PNG image; noise makes it compress like a real picture, not like a flat colour. */
export async function pngImage(width: number, height: number): Promise<Buffer> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index++) {
    pixels[index] = Math.imul(index, 2654435761) >>> 24;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

/** A JPEG stored sideways with an EXIF orientation that tells viewers to rotate it. */
export function rotatedJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c33' } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

export async function animatedGif(width: number, height: number): Promise<Buffer> {
  const frame = (background: string) =>
    sharp({ create: { width, height, channels: 4, background } })
      .png()
      .toBuffer();
  const frames = await Promise.all(['#f00', '#0f0', '#00f'].map(frame));
  return sharp(frames, { join: { animated: true } })
    .gif()
    .toBuffer();
}

export const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

export const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>',
);

export function writeFile(folder: string, name: string, bytes: Uint8Array): string {
  const path = join(folder, name);
  writeFileSync(path, bytes);
  return path;
}
