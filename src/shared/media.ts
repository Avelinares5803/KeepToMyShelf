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

/**
 * The files of an item. The cover is its own attribute; the gallery images and the documents
 * are in the order chosen by the user. The cover may also be one of the gallery images.
 */
export interface ItemMedia {
  readonly cover: MediaAttachment | null;
  readonly images: readonly MediaAttachment[];
  readonly documents: readonly MediaAttachment[];
}

/** The files chosen in the file dialog: those ready to import and those refused, with why. */
export interface PickedImports {
  readonly prepared: readonly PreparedImport[];
  readonly rejected: readonly { readonly fileName: string; readonly code: string }[];
}

/**
 * An image an item is saved with, as its cover or in its gallery: an image it already has
 * (its cover or one of its gallery images), a prepared import and how to keep it, or an
 * image it already has to be replaced by its kept original.
 */
export type ImagePlanEntry =
  | { readonly kind: 'existing'; readonly mediaId: number }
  | {
      readonly kind: 'prepared';
      readonly preparedId: string;
      readonly choice: ImageStorageChoice;
    }
  | { readonly kind: 'use_original'; readonly mediaId: number };

/**
 * The images an item is saved with. `cover` is the new cover (null: none) and `images` the
 * whole gallery in order; either one left out does not change.
 */
export interface ItemMediaPlan {
  readonly cover?: ImagePlanEntry | null;
  readonly images?: readonly ImagePlanEntry[];
}
