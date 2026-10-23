import { useTranslation } from 'react-i18next';
import type { AppSettings, Language, Theme } from '../../shared/settings';
import { ArrowLeftIcon, GearIcon } from '../components/icons';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';

export interface Breadcrumb {
  label: string;
  /** Absent for the current (last) crumb. */
  onSelect?: () => void;
}

interface TopBarProps {
  breadcrumbs: Breadcrumb[];
  settings: AppSettings;
  onBack: (() => void) | null;
  onLanguageChange: (language: Language) => void;
  onThemeChange: (theme: Theme) => void;
  onOpenSettings: () => void;
}

export function TopBar({
  breadcrumbs,
  settings,
  onBack,
  onLanguageChange,
  onThemeChange,
  onOpenSettings,
}: TopBarProps) {
  const { t } = useTranslation();

  return (
    <header className="top-bar">
      <div className="top-bar__start">
        {onBack && (
          <button
            type="button"
            className="icon-button"
            aria-label={t('nav.back')}
            title={t('nav.back')}
            onClick={onBack}
          >
            <ArrowLeftIcon />
          </button>
        )}
        {breadcrumbs.length > 0 ? (
          <nav aria-label={t('nav.breadcrumbs')}>
            <ol className="breadcrumbs">
              {breadcrumbs.map((crumb, index) => (
                <li key={`${index}-${crumb.label}`} className="breadcrumbs__item">
                  {crumb.onSelect ? (
                    <button type="button" className="breadcrumbs__link" onClick={crumb.onSelect}>
                      {crumb.label}
                    </button>
                  ) : (
                    <span aria-current="page">{crumb.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : (
          <span className="top-bar__brand">KeepToMyShelf</span>
        )}
      </div>
      <div className="top-bar__end">
        <LanguageSwitcher onChange={onLanguageChange} />
        <ThemeSwitcher theme={settings.theme} onChange={onThemeChange} />
        <button
          type="button"
          className="icon-button"
          aria-label={t('settings.open')}
          title={t('settings.open')}
          onClick={onOpenSettings}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
