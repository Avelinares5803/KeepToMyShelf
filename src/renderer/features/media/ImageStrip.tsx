import { useTranslation } from 'react-i18next';
import type { MediaAttachment } from '../../../shared/media';
import { Thumbnail } from './Thumbnail';

/** How many images the detail view shows before "See all (N)". */
export const STRIP_LIMIT = 10;

interface ImageGridProps {
  images: readonly MediaAttachment[];
  onOpen: (index: number) => void;
  className: string;
}

/** Thumbnails that open the viewer; a missing file shows a notice and cannot be opened. */
export function ImageGrid({ images, onOpen, className }: ImageGridProps) {
  const { t } = useTranslation();
  return (
    <ul className={className}>
      {images.map((image, index) => {
        const thumbnail = (
          <Thumbnail
            className="image-button__image"
            sha256={image.sha256}
            width={image.width ?? 1}
            height={image.height ?? 1}
            alt=""
            missing={image.isMissing}
          />
        );
        return (
          <li key={image.mediaId}>
            {image.isMissing ? (
              thumbnail
            ) : (
              <button
                type="button"
                className="image-button"
                aria-label={t('media.view.open', { number: index + 1 })}
                onClick={() => onOpen(index)}
              >
                {thumbnail}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface ImageStripProps {
  images: readonly MediaAttachment[];
  onOpen: (index: number) => void;
  onSeeAll: () => void;
}

/** The first images of an item in the detail view, and "See all (N)" when there are more. */
export function ImageStrip({ images, onOpen, onSeeAll }: ImageStripProps) {
  const { t } = useTranslation();
  return (
    <div className="image-strip">
      <ImageGrid
        className="image-strip__list"
        images={images.slice(0, STRIP_LIMIT)}
        onOpen={onOpen}
      />
      {images.length > STRIP_LIMIT && (
        <button type="button" className="link-button" onClick={onSeeAll}>
          {t('media.view.seeAll', { count: images.length })}
        </button>
      )}
    </div>
  );
}
