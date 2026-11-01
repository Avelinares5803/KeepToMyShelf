import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageStorageChoice } from '../../../core/media/import-rules';
import type { PreparedImport } from '../../../shared/media';
import { Dialog } from '../../components/Dialog';
import { formatFileSize, preparedThumbnailSource } from '../../lib/media-url';
import { choicesFor, optimizingSavesNothing } from './media-form';

export interface ImportDecision {
  readonly choice: ImageStorageChoice;
  /** Keep this choice for future imports (it becomes the profile's preference). */
  readonly remember: boolean;
  /** Use this choice, without asking, for the other images chosen together. */
  readonly applyToRest: boolean;
}

interface ImageImportDialogProps {
  prepared: PreparedImport;
  /** How many other chosen images are still waiting to be added. */
  remaining: number;
  /** Longest side of optimized copies, to explain when optimizing only recompresses. */
  optimizedMaxSide: number;
  onConfirm: (decision: ImportDecision) => void;
  /** This image is not added. */
  onCancel: () => void;
}

/**
 * Asks how to keep an imported image, showing what each choice takes. When the optimized
 * copy would not be smaller, it asks once more before making it.
 */
export function ImageImportDialog({
  prepared,
  remaining,
  optimizedMaxSide,
  onConfirm,
  onCancel,
}: ImageImportDialogProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const choices = choicesFor(prepared);
  // The safe default: smaller files, and the original is still kept.
  const [choice, setChoice] = useState<ImageStorageChoice>(
    choices.includes('optimized_with_original') ? 'optimized_with_original' : 'original',
  );
  const [remember, setRemember] = useState(false);
  const [applyToRest, setApplyToRest] = useState(false);
  const [askingCopy, setAskingCopy] = useState(false);

  const size = (bytes: number) => formatFileSize(bytes, i18n.language);
  const confirm = (chosen: ImageStorageChoice) =>
    onConfirm({ choice: chosen, remember, applyToRest });

  function add() {
    if (choice !== 'original' && optimizingSavesNothing(prepared)) setAskingCopy(true);
    else confirm(choice);
  }

  if (askingCopy) {
    return (
      <Dialog open title={t('media.import.notSmallerTitle')} onClose={() => setAskingCopy(false)}>
        <div className="form">
          <p>{t('media.import.notSmallerQuestion')}</p>
          <div className="form__actions">
            <button
              type="button"
              className="button button--ghost"
              autoFocus
              onClick={() => setAskingCopy(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => confirm('original')}
            >
              {t('media.import.useOriginal')}
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => confirm(choice)}
            >
              {t('media.import.makeCopy')}
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  const source = preparedThumbnailSource(prepared.id);
  return (
    <Dialog open title={t('media.import.title', { name: prepared.fileName })} onClose={onCancel}>
      <div className="form image-import">
        <div className="image-import__summary">
          <img className="image-import__preview" src={source.src} srcSet={source.srcSet} alt="" />
          <div className="image-import__sizes">
            <p>
              {t('media.import.originalSize', {
                size: size(prepared.byteSize),
                width: prepared.width,
                height: prepared.height,
              })}
            </p>
            {prepared.optimized !== null && (
              <p>
                {t('media.import.optimizedSize', {
                  size: size(prepared.optimized.byteSize),
                  width: prepared.optimized.width,
                  height: prepared.optimized.height,
                })}
              </p>
            )}
            {prepared.isAnimated ? (
              <p className="muted">{t('media.import.animated')}</p>
            ) : (
              prepared.fitsOptimizedSize && (
                <p className="muted">{t('media.import.fits', { pixels: optimizedMaxSide })}</p>
              )
            )}
          </div>
        </div>

        <fieldset className="fieldset">
          <legend>{t('media.import.choice')}</legend>
          {choices.map((option) => (
            <label key={option} className="checkbox">
              <input
                type="radio"
                name={`${id}-choice`}
                checked={choice === option}
                onChange={() => setChoice(option)}
              />
              {t(`media.import.${option}`)}
            </label>
          ))}
        </fieldset>

        <div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
            />
            {t('media.import.remember')}
          </label>
          {remember && <p className="field__hint">{t('media.import.rememberHint')}</p>}
        </div>
        {remaining > 0 && !remember && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={applyToRest}
              onChange={(event) => setApplyToRest(event.target.checked)}
            />
            {t('media.import.applyToRest', { count: remaining })}
          </label>
        )}

        <div className="form__actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="button button--primary" autoFocus onClick={add}>
            {t('media.import.add')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
