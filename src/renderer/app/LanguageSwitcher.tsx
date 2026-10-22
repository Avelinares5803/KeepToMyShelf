import { useTranslation } from 'react-i18next';
import { LANGUAGES, type Language } from '../../shared/settings';

interface LanguageSwitcherProps {
  onChange: (language: Language) => void;
}

export function LanguageSwitcher({ onChange }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className="segmented" role="group" aria-label={t('language.label')}>
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          className="segmented__option"
          aria-pressed={i18n.language === language}
          aria-label={t(`language.${language}`)}
          title={t(`language.${language}`)}
          onClick={() => onChange(language)}
        >
          {language.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
