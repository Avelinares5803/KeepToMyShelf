/**
 * Image sources for <img>. Stored files are served by the ktms-media:// protocol of the main
 * process; `srcSet` lets the browser pick the HiDPI thumbnail on high-density screens.
 */
export interface ImageSource {
  readonly src: string;
  readonly srcSet: string;
}

export const thumbnailSource = (sha256: string): ImageSource => ({
  src: `ktms-media://thumb/${sha256}/320`,
  srcSet: `ktms-media://thumb/${sha256}/320 1x, ktms-media://thumb/${sha256}/640 2x`,
});

/** The stored file itself, at full quality: only for the full-screen viewer. */
export const fullImageSource = (sha256: string): string => `ktms-media://file/${sha256}`;

/** Thumbnail of an import that is not saved yet. */
export const preparedThumbnailSource = (preparedId: string): ImageSource => ({
  src: `ktms-media://prepared/${preparedId}/320`,
  srcSet: `ktms-media://prepared/${preparedId}/320 1x, ktms-media://prepared/${preparedId}/640 2x`,
});

/** File sizes as people read them: "850 KB", "3,2 MB". */
export function formatFileSize(bytes: number, language: string): string {
  const [value, unit] =
    bytes >= 1024 * 1024 ? [bytes / (1024 * 1024), 'MB'] : [Math.max(1, bytes / 1024), 'KB'];
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  return `${number} ${unit}`;
}
