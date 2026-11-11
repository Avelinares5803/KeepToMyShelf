import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportedBackground } from '../../../shared/backgrounds';
import {
  BACKGROUND_BLUR_MAX,
  BACKGROUND_MAX_SIDES,
  IMAGE_IMPORT_CHOICES,
  type AppSettings,
  type BackgroundMaxSide,
  type ImageImportChoice,
  type SettingUpdate,
} from '../../../shared/settings';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { errorMessage, unwrap } from '../../lib/ipc';
import { BackgroundPicker } from './BackgroundPicker';
import { useBackgroundImport } from './use-background-import';

/** Keys that change a slider's value. */
const SLIDER_KEYS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

export interface BackgroundSettingsProps {
  settings: AppSettings;
  /** The open profile, or null on the profile selection screen. */
  token: string | null;
  /** The common gallery, oldest first; null while it loads or if it failed. */
  gallery: readonly ImportedBackground[] | null;
  galleryError: unknown;
  /** The blur shown, which may be a preview while the slider moves. */
  blur: number;
  /** The slider moves: the background shows the new blur without saving it. */
  onBlurPreview: (blur: number) => void;
  /** The slider is released: the blur is saved. */
  onBlurCommit: (blur: number) => void;
  /** True while the slider is held, so the settings dialog fades and the app shows. */
  onPeekChange: (peeking: boolean) => void;
  onChange: (update: SettingUpdate) => void;
  onApplyToAll: (update: SettingUpdate) => void;
  /** Backgrounds were added to the gallery; the last one becomes the background. */
  onImported: (backgrounds: ImportedBackground[]) => void;
  /** A background was deleted; the gallery and the preferences must be read again. */
  onDeleted: () => void;
}

/** The "Background" section of the settings dialog. */
export function BackgroundSettings({
  settings,
  token,
  gallery,
  galleryError,
  blur,
  onBlurPreview,
  onBlurCommit,
  onPeekChange,
  onChange,
  onApplyToAll,
  onImported,
  onDeleted,
}: BackgroundSettingsProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const blurId = useId();
  const importChoiceId = useId();
  const maxSideId = useId();
  const slider = useRef<HTMLInputElement>(null);
  const [peeking, setPeeking] = useState(false);
  const [deleting, setDeleting] = useState<{
    background: ImportedBackground;
    number: number;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<unknown>(null);

  const backgroundImport = useBackgroundImport({
    token,
    importChoice: settings.backgroundImportChoice,
    optimizedMaxSide: settings.backgroundMaxSide,
    onRememberChoice: (choice) => onChange({ key: 'backgroundImportChoice', value: choice }),
    onImported,
  });

  function peek(active: boolean) {
    setPeeking(active);
    onPeekChange(active);
  }

  /**
   * Asks before deleting, saying how many profiles use it. The count is read again now: any
   * profile may have chosen it since the gallery was loaded.
   */
  async function askToDelete(background: ImportedBackground, number: number) {
    setDeleteError(null);
    try {
      const current = unwrap(await window.api.backgrounds.list()).find(
        (candidate) => candidate.id === background.id,
      );
      if (current === undefined) {
        // Already deleted (e.g. from another window): the gallery is read again.
        onDeleted();
        return;
      }
      setDeleting({ background: current, number });
    } catch (caught) {
      setDeleteError(caught);
    }
  }

  /** The slider is let go: the dialog shows again and the blur is saved once. */
  function release() {
    peek(false);
    if (slider.current) onBlurCommit(slider.current.valueAsNumber);
  }

  return (
    <section className="settings-section" aria-labelledby={headingId}>
      <h3 id={headingId} className="settings-section__title">
        {t('background.title')}
      </h3>

      {galleryError !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, galleryError)}
        </p>
      )}
      <BackgroundPicker
        value={settings.background}
        gallery={gallery ?? []}
        onChange={(choice) => onChange({ key: 'background', value: choice })}
        onDelete={(background, number) => void askToDelete(background, number)}
      >
        <button
          type="button"
          className="background-option__import"
          disabled={backgroundImport.busy}
          onClick={() => void backgroundImport.pick()}
        >
          {backgroundImport.preparing ? t('background.preparing') : t('background.import')}
        </button>
      </BackgroundPicker>
      {deleteError !== null && (
        <p className="field__error" role="alert">
          {errorMessage(t, deleteError)}
        </p>
      )}
      {backgroundImport.problems.map((problem) => (
        <p key={problem} className="field__error" role="alert">
          {problem}
        </p>
      ))}
      <div className="setting-row setting-row--end">
        <button
          type="button"
          className="button button--ghost"
          aria-label={t('background.applyToAll')}
          onClick={() => onApplyToAll({ key: 'background', value: settings.background })}
        >
          {t('settings.applyToAll')}
        </button>
      </div>

      <div className={`setting-row setting-row--blur${peeking ? ' setting-row--peeking' : ''}`}>
        <div className="field">
          <label htmlFor={blurId}>{t('background.blur.label')}</label>
          <div className="range-field">
            <input
              ref={slider}
              id={blurId}
              type="range"
              min={0}
              max={BACKGROUND_BLUR_MAX}
              step={1}
              value={blur}
              aria-valuetext={t('background.blur.value', { pixels: blur })}
              onChange={(event) => onBlurPreview(event.target.valueAsNumber)}
              onPointerDown={() => {
                peek(true);
                // Released anywhere, even outside the slider.
                window.addEventListener('pointerup', release, { once: true });
              }}
              onKeyDown={(event) => {
                if (SLIDER_KEYS.has(event.key) && !peeking) peek(true);
              }}
              onKeyUp={(event) => {
                if (SLIDER_KEYS.has(event.key)) release();
              }}
            />
            {/* Not an <output>: its "status" role would announce every step; the slider's
                aria-valuetext already says the value. */}
            <span className="range-field__value" aria-hidden="true">
              {t('background.blur.value', { pixels: blur })}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="button button--ghost"
          aria-label={t('background.blur.applyToAll')}
          onClick={() => onApplyToAll({ key: 'backgroundBlur', value: settings.backgroundBlur })}
        >
          {t('settings.applyToAll')}
        </button>
      </div>

      <div className="setting-row">
        <div className="field">
          <label htmlFor={importChoiceId}>{t('background.importChoice.label')}</label>
          <select
            id={importChoiceId}
            value={settings.backgroundImportChoice}
            onChange={(event) =>
              onChange({
                key: 'backgroundImportChoice',
                value: event.target.value as ImageImportChoice,
              })
            }
          >
            {IMAGE_IMPORT_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {t(`settings.imageImport.${choice}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="button button--ghost"
          aria-label={t('background.importChoice.applyToAll')}
          onClick={() =>
            onApplyToAll({
              key: 'backgroundImportChoice',
              value: settings.backgroundImportChoice,
            })
          }
        >
          {t('settings.applyToAll')}
        </button>
      </div>

      <div className="setting-row">
        <div className="field">
          <label htmlFor={maxSideId}>{t('background.maxSide.label')}</label>
          <select
            id={maxSideId}
            aria-describedby={`${maxSideId}-hint`}
            value={settings.backgroundMaxSide}
            onChange={(event) =>
              onChange({
                key: 'backgroundMaxSide',
                value: Number(event.target.value) as BackgroundMaxSide,
              })
            }
          >
            {BACKGROUND_MAX_SIDES.map((pixels) => (
              <option key={pixels} value={pixels}>
                {t('settings.optimizedMaxSide.value', { pixels })}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="button button--ghost"
          aria-label={t('background.maxSide.applyToAll')}
          onClick={() =>
            onApplyToAll({ key: 'backgroundMaxSide', value: settings.backgroundMaxSide })
          }
        >
          {t('settings.applyToAll')}
        </button>
      </div>
      <p id={`${maxSideId}-hint`} className="muted field__hint setting-row__hint">
        {t('background.maxSide.hint')}
      </p>

      {backgroundImport.dialog}
      {deleting && (
        <ConfirmDialog
          title={t('background.deleteTitle', { number: deleting.number })}
          confirmLabel={t('background.delete')}
          danger
          onConfirm={async () => {
            unwrap(await window.api.backgrounds.delete({ id: deleting.background.id }));
            setDeleting(null);
            onDeleted();
          }}
          onClose={() => setDeleting(null)}
        >
          <p>{t('background.deleteBody')}</p>
          {deleting.background.profileCount > 0 && (
            <p>{t('background.deleteUsers', { count: deleting.background.profileCount })}</p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
