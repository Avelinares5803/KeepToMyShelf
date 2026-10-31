import { ValidationError } from '../errors';
import type { MediaKind } from './media-format';

/**
 * How an imported image is kept:
 * - `original`: the file exactly as chosen.
 * - `optimized_with_original`: a smaller WebP copy is used, and the original is kept apart.
 * - `optimized_only`: only the smaller WebP copy is kept.
 */
export type ImageStorageChoice = 'original' | 'optimized_with_original' | 'optimized_only';

export const IMAGE_STORAGE_CHOICES: readonly ImageStorageChoice[] = [
  'original',
  'optimized_with_original',
  'optimized_only',
];

const MB = 1024 * 1024;

export interface MediaLimits {
  readonly maxImageBytes: number;
  readonly maxDocumentBytes: number;
  /** Longest side of the optimized copy of covers and gallery images, in pixels. */
  readonly optimizedMaxSide: number;
}

export const DEFAULT_MEDIA_LIMITS: MediaLimits = {
  maxImageBytes: 50 * MB,
  maxDocumentBytes: 200 * MB,
  optimizedMaxSide: 2000,
};

/** Longest side of the two thumbnail sizes: normal screens and HiDPI screens. */
export const THUMBNAIL_SIZES = [320, 640] as const;
export type ThumbnailSize = (typeof THUMBNAIL_SIZES)[number];

export const isThumbnailSize = (value: number): value is ThumbnailSize =>
  (THUMBNAIL_SIZES as readonly number[]).includes(value);

/** WebP quality of optimized copies (high: they replace the original) and of thumbnails. */
export const OPTIMIZED_WEBP_QUALITY = 90;
export const THUMBNAIL_WEBP_QUALITY = 80;

export function assertWithinSizeLimit(kind: MediaKind, bytes: number, limits: MediaLimits): void {
  const max = kind === 'image' ? limits.maxImageBytes : limits.maxDocumentBytes;
  if (bytes > max) {
    throw new ValidationError(
      'media.too_large',
      `The file has ${bytes} bytes; the limit is ${max}`,
    );
  }
}

/** Animated images can only be kept as they are: optimizing them would lose the animation. */
export function assertChoiceAllowed(choice: ImageStorageChoice, isAnimated: boolean): void {
  if (isAnimated && choice !== 'original') {
    throw new ValidationError(
      'media.animated_original_only',
      'Animated images can only be kept as the original',
    );
  }
}

/** Optimizing never enlarges: an image already within the limit is only recompressed. */
export const fitsWithin = (width: number, height: number, maxSide: number): boolean =>
  Math.max(width, height) <= maxSide;
