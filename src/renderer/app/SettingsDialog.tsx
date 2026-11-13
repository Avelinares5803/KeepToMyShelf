import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IMAGE_IMPORT_CHOICES,
  LANGUAGES,
  MAX_DOCUMENT_MEGABYTES,
  OPTIMIZED_MAX_SIDES,
  THEMES,
  type AppSettings,
  type ImageImportChoice,
  type Language,
  type MaxDocumentMegabytes,
  type OptimizedMaxSide,
  type SettingUpdate,
  type Theme,
} from '../../shared/settings';
import { Dialog } from '../components/Dialog';
import {
  BackgroundSettings,
  type BackgroundSettingsProps,
} from '../features/backgrounds/BackgroundSettings';
import { BackupSettings } from '../features/backups/BackupSettings';
import { errorMessage, unwrap } from '../lib/ipc';

/** What the "Background" section needs besides the preferences themselves. */
export type BackgroundSettingsOptions = Omit<
  BackgroundSettingsProps,
  'settings' | 'onChange' | 'onApplyToAll' | 'onPeekChange'
>;

interface SettingsDialogProps {
  settings: AppSettings;
  /** Name of the open profile, or null on the profile selection screen. */
  profileName: string | null;
  background: BackgroundSettingsOptions;
  onChange: (update: SettingUpdate) => void;
  onClose: () => void;
}

export function SettingsDialog({
  settings,
  profileName,
  background,
  onChange,
  onClose,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const languageId = useId();
  const themeId = useId();
  const imageImportId = useId();
  const maxSideId = useId();
  const maxDocumentId = useId();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  // While the blur slider is held, the dialog fades so the background can be seen.
  const [peeking, setPeeking] = useState(false);

  async function applyToAll(update: SettingUpdate) {
    setStatus(null);
    setError(null);
    try {
      unwrap(await window.api.settings.applyToAllProfiles({ setting: update }));
      setStatus(t('settings.appliedToAll'));
    } catch (caught) {
      setError(caught);
    }
  }

  return (
    <Dialog
      open
      title={t('settings.title')}
      className={`dialog--settings${peeking ? ' dialog--peeking' : ''}`}
      onClose={onClose}
    >
      <div className="form">
        <p className="muted">
          {profileName
            ? t('settings.scopeProfile', { name: profileName })
            : t('settings.scopeGlobal')}
        </p>

        <div className="setting-row">
          <div className="field">
            <label htmlFor={languageId}>{t('language.label')}</label>
            <select
              id={languageId}
              value={settings.language}
              onChange={(event) =>
                onChange({ key: 'language', value: event.target.value as Language })
              }
            >
              {LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {t(`language.${language}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="button button--ghost"
            aria-label={t('settings.applyLanguageToAll')}
            onClick={() => void applyToAll({ key: 'language', value: settings.language })}
          >
            {t('settings.applyToAll')}
          </button>
        </div>

        <div className="setting-row">
          <div className="field">
            <label htmlFor={themeId}>{t('theme.label')}</label>
            <select
              id={themeId}
              value={settings.theme}
              onChange={(event) => onChange({ key: 'theme', value: event.target.value as Theme })}
            >
              {THEMES.map((theme) => (
                <option key={theme} value={theme}>
                  {t(`theme.${theme}`)}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="button button--ghost"
            aria-label={t('settings.applyThemeToAll')}
            onClick={() => void applyToAll({ key: 'theme', value: settings.theme })}
          >
            {t('settings.applyToAll')}
          </button>
        </div>

        <div className="setting-row">
          <div className="field">
            <label htmlFor={imageImportId}>{t('settings.imageImport.label')}</label>
            <select
              id={imageImportId}
              value={settings.imageImportChoice}
              onChange={(event) =>
                onChange({
                  key: 'imageImportChoice',
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
            aria-label={t('settings.imageImport.applyToAll')}
            onClick={() =>
              void applyToAll({ key: 'imageImportChoice', value: settings.imageImportChoice })
            }
          >
            {t('settings.applyToAll')}
          </button>
        </div>

        <div className="setting-row">
          <div className="field">
            <label htmlFor={maxSideId}>{t('settings.optimizedMaxSide.label')}</label>
            <select
              id={maxSideId}
              aria-describedby={`${maxSideId}-hint`}
              value={settings.optimizedMaxSide}
              onChange={(event) =>
                onChange({
                  key: 'optimizedMaxSide',
                  value: Number(event.target.value) as OptimizedMaxSide,
                })
              }
            >
              {OPTIMIZED_MAX_SIDES.map((pixels) => (
                <option key={pixels} value={pixels}>
                  {t('settings.optimizedMaxSide.value', { pixels })}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="button button--ghost"
            aria-label={t('settings.optimizedMaxSide.applyToAll')}
            onClick={() =>
              void applyToAll({ key: 'optimizedMaxSide', value: settings.optimizedMaxSide })
            }
          >
            {t('settings.applyToAll')}
          </button>
        </div>
        <p id={`${maxSideId}-hint`} className="muted field__hint setting-row__hint">
          {t('settings.optimizedMaxSide.hint')}
        </p>

        <div className="setting-row">
          <div className="field">
            <label htmlFor={maxDocumentId}>{t('settings.maxDocumentMegabytes.label')}</label>
            <select
              id={maxDocumentId}
              value={settings.maxDocumentMegabytes}
              onChange={(event) =>
                onChange({
                  key: 'maxDocumentMegabytes',
                  value: Number(event.target.value) as MaxDocumentMegabytes,
                })
              }
            >
              {MAX_DOCUMENT_MEGABYTES.map((megabytes) => (
                <option key={megabytes} value={megabytes}>
                  {t('settings.maxDocumentMegabytes.value', { megabytes })}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="button button--ghost"
            aria-label={t('settings.maxDocumentMegabytes.applyToAll')}
            onClick={() =>
              void applyToAll({
                key: 'maxDocumentMegabytes',
                value: settings.maxDocumentMegabytes,
              })
            }
          >
            {t('settings.applyToAll')}
          </button>
        </div>

        <BackgroundSettings
          {...background}
          settings={settings}
          onChange={onChange}
          onApplyToAll={(update) => void applyToAll(update)}
          onPeekChange={setPeeking}
        />

        {background.token !== null && <BackupSettings token={background.token} />}

        {status && (
          <p className="banner" role="status">
            {status}
          </p>
        )}
        {error !== null && (
          <p className="field__error" role="alert">
            {errorMessage(t, error)}
          </p>
        )}

        <div className="form__actions">
          <button type="button" className="button button--primary" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
