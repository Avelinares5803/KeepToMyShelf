import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProfileChange } from '../../../shared/ipc';
import { LANGUAGES, type Language } from '../../../shared/settings';
import { errorMessage, unwrap } from '../../lib/ipc';
import { NameField } from './NameField';

interface CreateProfileFormProps {
  onCreated: (change: ProfileChange) => void;
  onCancel?: () => void;
}

export function CreateProfileForm({ onCreated, onCancel }: CreateProfileFormProps) {
  const { t, i18n } = useTranslation();
  const languageId = useId();
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<Language>(
    LANGUAGES.find((candidate) => candidate === i18n.language) ?? 'es',
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(unwrap(await window.api.profiles.create({ name, language })));
    } catch (caught) {
      setError(errorMessage(t, caught));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <NameField label={t('profiles.form.name')} value={name} error={error} onChange={setName} />
      <div className="field">
        <label htmlFor={languageId}>{t('profiles.form.language')}</label>
        <select
          id={languageId}
          value={language}
          onChange={(event) => setLanguage(event.target.value as Language)}
        >
          {LANGUAGES.map((option) => (
            <option key={option} value={option}>
              {t(`language.${option}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="form__actions">
        {onCancel && (
          <button type="button" className="button button--ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button type="submit" className="button button--primary" disabled={busy}>
          {t('profiles.form.create')}
        </button>
      </div>
    </form>
  );
}
