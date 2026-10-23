import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LANGUAGES,
  THEMES,
  type AppSettings,
  type Language,
  type SettingUpdate,
  type Theme,
} from '../../shared/settings';
import { Dialog } from '../components/Dialog';
import { errorMessage, unwrap } from '../lib/ipc';

interface SettingsDialogProps {
  settings: AppSettings;
  /** Name of the open profile, or null on the profile selection screen. */
  profileName: string | null;
  onChange: (update: SettingUpdate) => void;
  onClose: () => void;
}

export function SettingsDialog({ settings, profileName, onChange, onClose }: SettingsDialogProps) {
  const { t } = useTranslation();
  const languageId = useId();
  const themeId = useId();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

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
    <Dialog open title={t('settings.title')} onClose={onClose}>
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
