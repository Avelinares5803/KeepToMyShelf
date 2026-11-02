import { useTranslation } from 'react-i18next';
import { preparedThumbnailSource, thumbnailSource } from '../../lib/media-url';
import { moveImage, sameImage, toggleOriginal, type FormImage } from './media-form';
import { useImageImport, type ImageImportOptions } from './use-image-import';

interface ImagesFieldProps extends ImageImportOptions {
  token: string;
  images: readonly FormImage[];
  onChange: (images: readonly FormImage[]) => void;
  /** The item's cover, to mark the gallery image that is also the cover. */
  cover: FormImage | null;
  /** "Use as cover": the image becomes the cover too, and stays in the gallery. */
  onMakeCover: (image: FormImage) => void;
}

/** The thumbnail of an image of the edit form, saved or only prepared. */
export function FormImageTile({ image, alt }: { image: FormImage; alt: string }) {
  const source =
    image.source === 'existing'
      ? thumbnailSource(image.media.sha256)
      : preparedThumbnailSource(image.prepared.id);
  return <img className="image-tile__image" src={source.src} srcSet={source.srcSet} alt={alt} />;
}

/**
 * The item's gallery in the edit form. Images are only prepared here; they are saved, in
 * this order, when the item is saved. The gallery never changes the cover.
 */
export function ImagesField({
  token,
  images,
  onChange,
  cover,
  onMakeCover,
  ...importOptions
}: ImagesFieldProps) {
  const { t } = useTranslation();
  const importer = useImageImport({
    token,
    multiple: true,
    ...importOptions,
    onAdded: (added) => onChange([...images, ...added]),
  });

  return (
    <div className="images-field">
      {images.length > 0 && (
        <ul className="image-list">
          {images.map((image, index) => {
            const number = index + 1;
            const isCover = sameImage(image, cover);
            return (
              <li key={image.key} className="image-list__item">
                <figure className="image-tile">
                  <FormImageTile image={image} alt={t('media.images.image', { number })} />
                  <figcaption className="image-tile__badges">
                    {isCover && (
                      <span className="badge badge--accent">{t('media.images.cover')}</span>
                    )}
                    {image.source === 'prepared' && (
                      <span className="badge">{t('media.images.new')}</span>
                    )}
                    {image.source === 'existing' && image.useOriginal && (
                      <span className="badge">{t('media.images.willUseOriginal')}</span>
                    )}
                  </figcaption>
                </figure>
                <div className="image-list__actions">
                  <button
                    type="button"
                    className="chip__button"
                    aria-label={t('media.images.moveEarlier', { number })}
                    disabled={index === 0}
                    onClick={() => onChange(moveImage(images, index, -1))}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="chip__button"
                    aria-label={t('media.images.moveLater', { number })}
                    disabled={index === images.length - 1}
                    onClick={() => onChange(moveImage(images, index, 1))}
                  >
                    →
                  </button>
                  {!isCover && (
                    <button
                      type="button"
                      className="link-button"
                      aria-label={t('media.images.makeCoverLabel', { number })}
                      onClick={() => onMakeCover(image)}
                    >
                      {t('media.images.makeCover')}
                    </button>
                  )}
                  {image.source === 'existing' && image.media.hasOriginal && (
                    <button
                      type="button"
                      className="link-button"
                      aria-label={t(
                        image.useOriginal
                          ? 'media.images.keepOptimizedLabel'
                          : 'media.images.useOriginalLabel',
                        { number },
                      )}
                      onClick={() => onChange(toggleOriginal(images, index))}
                    >
                      {t(
                        image.useOriginal
                          ? 'media.images.keepOptimized'
                          : 'media.images.useOriginal',
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    className="link-button link-button--danger"
                    aria-label={t('media.images.removeLabel', { number })}
                    onClick={() => onChange(images.filter((_, i) => i !== index))}
                  >
                    {t('media.images.remove')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <button
          type="button"
          className="button button--ghost"
          disabled={importer.busy}
          onClick={() => void importer.pick()}
        >
          {t('media.images.add')}
        </button>
        {importer.preparing && (
          <span className="muted" role="status">
            {' '}
            {t('media.images.preparing')}
          </span>
        )}
      </div>
      <Problems problems={importer.problems} />
      {importer.dialog}
    </div>
  );
}

export function Problems({ problems }: { problems: readonly string[] }) {
  if (problems.length === 0) return null;
  return (
    <ul className="banner banner--error plain-list" role="alert">
      {problems.map((problem, index) => (
        <li key={index}>{problem}</li>
      ))}
    </ul>
  );
}
