import { useTranslation } from 'react-i18next';
import { ImageIcon } from '../../components/icons';
import { FormImageTile, Problems } from './ImagesField';
import { withOriginalToggled, type FormImage } from './media-form';
import { useImageImport, type ImageImportOptions } from './use-image-import';

interface CoverFieldProps extends ImageImportOptions {
  token: string;
  cover: FormImage | null;
  onChange: (cover: FormImage | null) => void;
}

/**
 * The item's cover in the edit form, apart from the gallery. Choosing one only prepares it;
 * it is saved when the item is saved.
 */
export function CoverField({ token, cover, onChange, ...importOptions }: CoverFieldProps) {
  const { t } = useTranslation();
  const importer = useImageImport({
    token,
    multiple: false,
    ...importOptions,
    onAdded: ([image]) => {
      if (image !== undefined) onChange(image);
    },
  });

  return (
    <div className="cover-field">
      {cover === null ? (
        <button
          type="button"
          className="cover-field__empty"
          disabled={importer.busy}
          onClick={() => void importer.pick()}
        >
          <ImageIcon />
          <span>{t('media.cover.add')}</span>
        </button>
      ) : (
        <div className="image-list__item">
          <figure className="image-tile">
            <FormImageTile image={cover} alt={t('media.cover.current')} />
            <figcaption className="image-tile__badges">
              {cover.source === 'prepared' && (
                <span className="badge">{t('media.images.new')}</span>
              )}
              {cover.source === 'existing' && cover.useOriginal && (
                <span className="badge">{t('media.images.willUseOriginal')}</span>
              )}
            </figcaption>
          </figure>
          <div className="image-list__actions">
            <button
              type="button"
              className="link-button"
              disabled={importer.busy}
              onClick={() => void importer.pick()}
            >
              {t('media.cover.change')}
            </button>
            {cover.source === 'existing' && cover.media.hasOriginal && (
              <button
                type="button"
                className="link-button"
                aria-label={t(
                  cover.useOriginal
                    ? 'media.cover.keepOptimizedLabel'
                    : 'media.cover.useOriginalLabel',
                )}
                onClick={() => onChange(withOriginalToggled(cover))}
              >
                {t(cover.useOriginal ? 'media.images.keepOptimized' : 'media.images.useOriginal')}
              </button>
            )}
            <button
              type="button"
              className="link-button link-button--danger"
              onClick={() => onChange(null)}
            >
              {t('media.cover.remove')}
            </button>
          </div>
        </div>
      )}
      {importer.preparing && (
        <span className="muted" role="status">
          {t('media.cover.preparing')}
        </span>
      )}
      <Problems problems={importer.problems} />
      {importer.dialog}
    </div>
  );
}
