import { useTranslation } from 'react-i18next';

interface HomeScreenProps {
  profileName: string;
  onSwitchProfile: () => void;
}

/** Temporary landing screen; the content mode selection arrives in phase F3. */
export function HomeScreen({ profileName, onSwitchProfile }: HomeScreenProps) {
  const { t } = useTranslation();

  return (
    <section className="home">
      <h1>{t('home.greeting', { name: profileName })}</h1>
      <p className="muted">{t('home.comingSoon')}</p>
      <button type="button" className="button" onClick={onSwitchProfile}>
        {t('home.switchProfile')}
      </button>
    </section>
  );
}
