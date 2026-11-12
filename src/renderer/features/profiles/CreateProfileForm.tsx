import { useId, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageStorageChoice } from '../../../core/media/import-rules';
import type { ImportedBackground } from '../../../shared/backgrounds';
import type { ProfileChange } from '../../../shared/ipc';
import {
  LANGUAGES,
  type BackgroundChoice,
  type ImageImportChoice,
  type Language,
} from '../../../shared/settings';
import { errorMessage, unwrap } from '../../lib/ipc';
import { BackgroundPicker } from '../backgrounds/BackgroundPicker';
import { useBackgroundImport } from '../backgrounds/use-background-import';
import { NameField } from './NameField';

/** What the profile screens need about backgrounds, outside any profile. */
export interface ProfileBackgrounds {
  /** The common gallery, oldest first; null while it loads. */
  readonly gallery: readonly ImportedBackground[] | null;
  /** The global background: a new profile starts with it. */
  readonly globalBackground: BackgroundChoice;
  /** The global import preferences of backgrounds. */
  readonly importChoice: ImageImportChoice;
  readonly optimizedMaxSide: number;
  readonly onRememberChoice: (choice: ImageStorageChoice) => void;
  /** Backgrounds were added to the gallery: it must be read again. */
  readonly onGalleryChanged: () => void;
}

interface CreateProfileFormProps {
  backgrounds: ProfileBackgrounds;
  onCreated: (change: ProfileChange) => void;
  onCancel?: () => void;
}

export function CreateProfileForm({ backgrounds, onCreated, onCancel }: CreateProfileFormProps) {
  const { t, i18n } = useTranslation();
  const languageId = useId();
  const backgroundLabelId = useId();
  const [name, setName] = useState('');
  // Until the user picks a language, the new profile follows the current UI language,
  // even if it is switched while the form is open.
  const [chosenLanguage, setChosenLanguage] = useState<Language | null>(null);
  const language =
    chosenLanguage ?? LANGUAGES.find((candidate) => candidate === i18n.language) ?? 'es';
  // Likewise, until one is picked, the background is the global one.
  const [chosenBackground, setChosenBackground] = useState<BackgroundChoice | null>(null);
  const background = chosenBackground ?? backgrounds.globalBackground;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const backgroundImport = useBackgroundImport({
    token: null,
    importChoice: backgrounds.importChoice,
    optimizedMaxSide: backgrounds.optimizedMaxSide,
    onRememberChoice: backgrounds.onRememberChoice,
    // The last background imported is chosen; it shows once the gallery is read again.
    onImported: (added) => {
      backgrounds.onGalleryChanged();
      const last = added.at(-1);
      if (last) setChosenBackground({ kind: 'imported', id: last.id });
    },
  });

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(unwrap(await window.api.profiles.create({ name, language, background })));
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
          onChange={(event) => setChosenLanguage(event.target.value as Language)}
        >
          {LANGUAGES.map((option) => (
            <option key={option} value={option}>
              {t(`language.${option}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="field" role="group" aria-labelledby={backgroundLabelId}>
        <span id={backgroundLabelId}>{t('profiles.form.background')}</span>
        <BackgroundPicker
          value={background}
          gallery={backgrounds.gallery ?? []}
          onChange={setChosenBackground}
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
        {backgroundImport.problems.map((problem) => (
          <p key={problem} className="field__error" role="alert">
            {problem}
          </p>
        ))}
      </div>
      {backgroundImport.dialog}
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
