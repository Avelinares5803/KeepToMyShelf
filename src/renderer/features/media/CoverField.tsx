import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageIcon } from '../../components/icons';
import { FormImageTile, Problems } from './ImagesField';
import { withOriginalToggled, type FormImage } from './media-form';
import { useFileDrop } from './use-file-drop';
import { useImageImport, type ImageImportOptions } from './use-image-import';

interface CoverFieldProps extends ImageImportOptions {
  token: string;
  cover: FormImage | null;
  onChange: (cover: FormImage | null) => void;
  /** More ways to choose a cover (e.g. a collection's from one of its items), with the rest. */
  extraActions?: ReactNode;
  /** An image can also be dropped on the field from the file explorer. */
  acceptDrops?: boolean;
}

/**
 * The item's cover in the edit form, apart from the gallery. Choosing one (or dropping it, with
 * `acceptDrops`) only prepares it; it is saved when the item is saved.
 */
export function CoverField({
  token,
  cover,
  onChange,
  extraActions,
  acceptDrops = false,
  ...importOptions
}: CoverFieldProps) {
  const { t } = useTranslation();
  const importer = useImageImport({
    token,
    multiple: false,
    ...importOptions,
    onAdded: ([image]) => {
      if (image !== undefined) onChange(image);
    },
  });
  const drop = useFileDrop({
    enabled: acceptDrops && !importer.busy,
    onDrop: (files) => void importer.drop(files),
  });

  return (
    <div className={`cover-field${drop.over ? ' drop-zone--over' : ''}`} {...drop.zoneProps}>
      {cover === null ? (
        <>
          <button
            type="button"
            className="cover-field__empty"
            disabled={importer.busy}
            onClick={() => void importer.pick()}
          >
            <ImageIcon />
            <span>{t('media.cover.add')}</span>
            {/* A hint for the mouse only: it is left out of the button's name. */}
            {acceptDrops && (
              <span className="drop-hint" aria-hidden="true">
                {t('media.cover.dropHint')}
              </span>
            )}
          </button>
          {extraActions !== undefined && <div className="image-list__actions">{extraActions}</div>}
        </>
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
            {extraActions}
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
