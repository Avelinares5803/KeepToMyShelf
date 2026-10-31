import sharp from 'sharp';
import { ValidationError } from '../../../core/errors';
import {
  OPTIMIZED_WEBP_QUALITY,
  THUMBNAIL_WEBP_QUALITY,
  type ThumbnailSize,
} from '../../../core/media/import-rules';
import type { MediaFormat } from '../../../core/media/media-format';

export interface ImageInfo {
  /** Size as displayed, with the EXIF orientation applied. */
  readonly width: number;
  readonly height: number;
  readonly isAnimated: boolean;
}

export interface EncodedImage {
  readonly bytes: Buffer;
  readonly width: number;
  readonly height: number;
}

/** Names sharp gives the accepted formats (AVIF is decoded by its HEIF reader). */
const SHARP_FORMATS: Record<Exclude<MediaFormat, 'pdf'>, string> = {
  jpeg: 'jpeg',
  png: 'png',
  webp: 'webp',
  avif: 'heif',
  gif: 'gif',
};

/** sharp throws when it cannot decode a file: for the user, the image is damaged. */
async function decoding<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('media.unreadable', 'The image could not be decoded', {
      cause: error,
    });
  }
}

/**
 * Reads the size of an image and checks that sharp sees the same format the file signature
 * announced (e.g. a HEIC disguised with an AVIF brand is rejected).
 */
export function inspectImage(
  bytes: Buffer,
  format: Exclude<MediaFormat, 'pdf'>,
): Promise<ImageInfo> {
  return decoding(async () => {
    const metadata = await sharp(bytes).metadata();
    const sameFormat =
      metadata.format === SHARP_FORMATS[format] &&
      (format !== 'avif' || metadata.compression === 'av1');
    if (!sameFormat) {
      throw new ValidationError(
        'media.unsupported_format',
        `Expected ${format}, sharp read ${metadata.format}`,
      );
    }
    return {
      width: metadata.autoOrient.width,
      height: metadata.autoOrient.height,
      isAnimated: (metadata.pages ?? 1) > 1,
    };
  });
}

/**
 * Scales a still image so its longest side is at most `maxSide` (never enlarging it) and
 * recompresses it as WebP. The EXIF orientation is applied; metadata (EXIF, GPS) is dropped.
 */
export function optimizeImage(bytes: Buffer, maxSide: number): Promise<EncodedImage> {
  return encodeWebp(bytes, maxSide, OPTIMIZED_WEBP_QUALITY);
}

/** A WebP thumbnail with the same proportions; animated images show their first frame. */
export function createThumbnail(bytes: Buffer, size: ThumbnailSize): Promise<EncodedImage> {
  return encodeWebp(bytes, size, THUMBNAIL_WEBP_QUALITY);
}

function encodeWebp(bytes: Buffer, maxSide: number, quality: number): Promise<EncodedImage> {
  return decoding(async () => {
    const { data, info } = await sharp(bytes)
      .autoOrient()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, width: info.width, height: info.height };
  });
}
