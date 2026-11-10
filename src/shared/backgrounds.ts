import type { MediaFormat } from '../core/media/media-format';

/** A background of the gallery shared by every profile. */
export interface ImportedBackground {
  /** What the `background` preference refers to. */
  readonly id: number;
  /** Identifies the file in `ktms-media://background/` URLs. */
  readonly sha256: string;
  readonly format: MediaFormat;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly isAnimated: boolean;
  /** True when the original of this optimized copy is kept. */
  readonly hasOriginal: boolean;
  /** True when the file was removed from the backgrounds folder by hand. */
  readonly isMissing: boolean;
  /** Profiles that show it (with their own preference or the global one). */
  readonly profileCount: number;
}
