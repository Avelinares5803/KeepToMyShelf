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

/**
 * The same thumbnails, described by their width (`320w`, `640w`) instead of the screen density:
 * with `sizes`, the browser picks the one that fills the space the image is shown in. Thumbnails
 * keep the image's proportions with their longest side at 320 or 640 px, and are never larger
 * than the image, so a small image may have only one.
 */
export function thumbnailSourceByWidth(sha256: string, width: number, height: number): ImageSource {
  const longest = Math.max(width, height);
  const widthAt = (side: number) => Math.round(width * Math.min(1, side / longest));
  const small = widthAt(320);
  const large = widthAt(640);
  const url = (side: number) => `ktms-media://thumb/${sha256}/${side}`;
  return {
    src: url(320),
    srcSet:
      large === small ? `${url(320)} ${small}w` : `${url(320)} ${small}w, ${url(640)} ${large}w`,
  };
}

/** The stored file itself, at full quality: only for the full-screen viewer. */
export const fullImageSource = (sha256: string): string => `ktms-media://file/${sha256}`;

/** Thumbnail of an import that is not saved yet. */
export const preparedThumbnailSource = (preparedId: string): ImageSource => ({
  src: `ktms-media://prepared/${preparedId}/320`,
  srcSet: `ktms-media://prepared/${preparedId}/320 1x, ktms-media://prepared/${preparedId}/640 2x`,
});

/** A background of the common gallery, at full quality: the app's background layer. */
export const backgroundImageSource = (sha256: string): string =>
  `ktms-media://background/${sha256}`;

/** Thumbnail of a background of the common gallery, for the background picker. */
export const backgroundThumbnailSource = (sha256: string): ImageSource => ({
  src: `ktms-media://background/${sha256}/320`,
  srcSet: `ktms-media://background/${sha256}/320 1x, ktms-media://background/${sha256}/640 2x`,
});

/** File sizes as people read them: "850 KB", "3,2 MB". */
export function formatFileSize(bytes: number, language: string): string {
  const [value, unit] =
    bytes >= 1024 * 1024 ? [bytes / (1024 * 1024), 'MB'] : [Math.max(1, bytes / 1024), 'KB'];
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  return `${number} ${unit}`;
}
