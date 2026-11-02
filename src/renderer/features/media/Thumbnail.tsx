import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { thumbnailSource } from '../../lib/media-url';

interface ThumbnailProps {
  sha256: string;
  /** Size of the image, so its space is kept before it loads (and when its file is missing). */
  width: number;
  height: number;
  alt: string;
  className?: string;
  /** Already known to be missing (e.g. from the item's media list). */
  missing?: boolean;
  /**
   * What to show when the file is missing: the discreet "file not found" box by default, or
   * nothing (e.g. a library card then shows just its title).
   */
  whenMissing?: 'notice' | 'nothing';
  /** Told when the image turns out to be missing, so the parent can adapt its layout. */
  onMissing?: () => void;
}

/**
 * A stored image's thumbnail, keeping its proportions. Images load only when they are about
 * to be seen, so long libraries do not request every cover at once.
 */
export function Thumbnail({
  sha256,
  width,
  height,
  alt,
  className,
  missing = false,
  whenMissing = 'notice',
  onMissing,
}: ThumbnailProps) {
  const { t } = useTranslation();
  // The thumbnail cannot be served when its file was deleted by hand.
  const [failed, setFailed] = useState(false);

  if (missing || failed) {
    if (whenMissing === 'nothing') return null;
    return (
      <span
        className={`missing-file ${className ?? ''}`}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {t('media.view.missing')}
      </span>
    );
  }
  const source = thumbnailSource(sha256);
  return (
    <img
      className={className}
      src={source.src}
      srcSet={source.srcSet}
      width={width}
      height={height}
      alt={alt}
      loading="lazy"
      onError={() => {
        setFailed(true);
        onMissing?.();
      }}
    />
  );
}
