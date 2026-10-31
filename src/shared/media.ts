import type { ImageStorageChoice } from '../core/media/import-rules';
import type { MediaFormat, MediaKind } from '../core/media/media-format';

export type { ImageStorageChoice, MediaFormat, MediaKind };

/**
 * A chosen file, checked and ready to be saved. The import window uses it to show the
 * choices (and the size each one would take) before anything is stored.
 */
export interface PreparedImport {
  readonly id: string;
  /** Name of the chosen file, without its folder. */
  readonly fileName: string;
  readonly kind: MediaKind;
  readonly format: MediaFormat;
  readonly byteSize: number;
  /** Images only. */
  readonly width: number | null;
  readonly height: number | null;
  readonly isAnimated: boolean;
  /** True when the image already fits the optimized size: optimizing only recompresses it. */
  readonly fitsOptimizedSize: boolean;
  /** The optimized WebP copy; null for documents and animated images, which are kept as is. */
  readonly optimized: {
    readonly byteSize: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

/** A file attached to an item. */
export interface MediaAttachment {
  readonly mediaId: number;
  readonly kind: MediaKind;
  readonly format: MediaFormat;
  /** Identifies the file in `ktms-media://` URLs. */
  readonly sha256: string;
  readonly byteSize: number;
  readonly width: number | null;
  readonly height: number | null;
  readonly isAnimated: boolean;
  /** Name shown for a document; null for images. */
  readonly label: string | null;
  /** True when the original of this optimized copy is kept. */
  readonly hasOriginal: boolean;
  /** True when the file was removed from the media folder by hand. */
  readonly isMissing: boolean;
}

/** The files of an item, in the order chosen by the user. The first image is the cover. */
export interface ItemMedia {
  readonly images: readonly MediaAttachment[];
  readonly documents: readonly MediaAttachment[];
}
