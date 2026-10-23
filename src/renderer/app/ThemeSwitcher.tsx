import { useTranslation } from 'react-i18next';
import { THEMES, type Theme } from '../../shared/settings';
import { MonitorIcon, MoonIcon, SunIcon } from '../components/icons';

interface ThemeSwitcherProps {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

const ICONS: Record<Theme, () => React.JSX.Element> = {
  system: MonitorIcon,
  light: SunIcon,
  dark: MoonIcon,
};

/** One button that cycles system → light → dark. */
export function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  const { t } = useTranslation();
  const next = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? 'system';
  const ThemeIcon = ICONS[theme];
  const label = t('theme.toggle', { current: t(`theme.${theme}`) });

  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={() => onChange(next)}
    >
      <ThemeIcon />
    </button>
  );
}
