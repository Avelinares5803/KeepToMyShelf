import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageStorageChoice } from '../../../core/media/import-rules';
import type { PreparedImport } from '../../../shared/media';
import type { ImageImportChoice } from '../../../shared/settings';
import { errorMessage, IpcError, unwrap } from '../../lib/ipc';
import { preparedThumbnailSource, thumbnailSource } from '../../lib/media-url';
import { ImageImportDialog, type ImportDecision } from './ImageImportDialog';
import {
  automaticChoice,
  makeCover,
  moveImage,
  preparedImage,
  toggleOriginal,
  type FormImage,
} from './media-form';

interface ImagesFieldProps {
  token: string;
  images: readonly FormImage[];
  onChange: (images: readonly FormImage[]) => void;
  /** The profile's preference: ask, or the choice the user asked to remember. */
  importChoice: ImageImportChoice;
  optimizedMaxSide: number;
  /** "Remember my choice" was ticked: it becomes the profile's preference. */
  onRememberChoice: (choice: ImageStorageChoice) => void;
}

/**
 * The item's images in the edit form. Images are only prepared here; they are saved, in
 * this order (the first one is the cover), when the item is saved.
 */
export function ImagesField({
  token,
  images,
  onChange,
  importChoice,
  optimizedMaxSide,
  onRememberChoice,
}: ImagesFieldProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  // Images chosen together that still wait for the import window.
  const [queue, setQueue] = useState<readonly PreparedImport[]>([]);

  const discard = (ids: string[]) => {
    // Only frees temporary files early: they are also dropped when the profile closes.
    if (ids.length > 0) void window.api.media.discardImports({ token, preparedIds: ids });
  };

  async function pick() {
    setBusy(true);
    setProblems([]);
    try {
      const picked = unwrap(
        await window.api.media.pickImages({ token, filterName: t('media.images.fileType') }),
      );
      if (picked === null) return;
      setProblems(
        picked.rejected.map(({ fileName, code }) =>
          t('media.images.rejected', {
            name: fileName,
            reason: errorMessage(t, new IpcError(code, code)),
          }),
        ),
      );
      if (importChoice === 'ask') {
        setQueue(picked.prepared);
      } else {
        const added = picked.prepared.map((p) =>
          preparedImage(p, automaticChoice(p, importChoice)),
        );
        onChange([...images, ...added]);
      }
    } catch (caught) {
      setProblems([errorMessage(t, caught)]);
    } finally {
      setBusy(false);
    }
  }

  function decide(prepared: PreparedImport, decision: ImportDecision) {
    const [, ...rest] = queue;
    let added = [preparedImage(prepared, decision.choice)];
    if (decision.remember) onRememberChoice(decision.choice);
    if (decision.remember || decision.applyToRest) {
      added = [...added, ...rest.map((p) => preparedImage(p, automaticChoice(p, decision.choice)))];
      setQueue([]);
    } else {
      setQueue(rest);
    }
    onChange([...images, ...added]);
  }

  function cancel(prepared: PreparedImport) {
    discard([prepared.id]);
    setQueue(queue.slice(1));
  }

  function remove(index: number) {
    const image = images[index];
    if (image?.source === 'prepared') discard([image.prepared.id]);
    onChange(images.filter((_, i) => i !== index));
  }

  const current = queue[0];
  return (
    <div className="images-field">
      {images.length > 0 && (
        <ul className="image-list">
          {images.map((image, index) => {
            const number = index + 1;
            const source =
              image.source === 'existing'
                ? thumbnailSource(image.media.sha256)
                : preparedThumbnailSource(image.prepared.id);
            return (
              <li key={image.key} className="image-list__item">
                <figure className="image-tile">
                  <img
                    className="image-tile__image"
                    src={source.src}
                    srcSet={source.srcSet}
                    alt={t('media.images.image', { number })}
                  />
                  <figcaption className="image-tile__badges">
                    {index === 0 && (
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
                  {index > 0 && (
                    <button
                      type="button"
                      className="link-button"
                      aria-label={t('media.images.makeCoverLabel', { number })}
                      onClick={() => onChange(makeCover(images, index))}
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
                    onClick={() => remove(index)}
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
          disabled={busy || current !== undefined}
          onClick={() => void pick()}
        >
          {t('media.images.add')}
        </button>
        {busy && (
          <span className="muted" role="status">
            {' '}
            {t('media.images.preparing')}
          </span>
        )}
      </div>
      {problems.length > 0 && (
        <ul className="banner banner--error plain-list" role="alert">
          {problems.map((problem, index) => (
            <li key={index}>{problem}</li>
          ))}
        </ul>
      )}

      {current !== undefined && (
        <ImageImportDialog
          key={current.id}
          prepared={current}
          remaining={queue.length - 1}
          optimizedMaxSide={optimizedMaxSide}
          onConfirm={(decision) => decide(current, decision)}
          onCancel={() => cancel(current)}
        />
      )}
    </div>
  );
}
