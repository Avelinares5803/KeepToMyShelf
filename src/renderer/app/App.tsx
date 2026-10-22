import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionInfo } from '../../shared/ipc';
import type { Language, SettingUpdate } from '../../shared/settings';
import { HomeScreen } from '../features/home/HomeScreen';
import { ProfileSelectionScreen } from '../features/profiles/ProfileSelectionScreen';
import { changeLanguage } from '../i18n';
import { errorMessage, unwrap } from '../lib/ipc';
import { LanguageSwitcher } from './LanguageSwitcher';

export function App() {
  const { t } = useTranslation();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(t, caught));
    }
  }

  // Outside a profile the language is the global default; inside, the profile's own choice.
  const selectLanguage = (language: Language) =>
    run(async () => {
      const setting: SettingUpdate = { key: 'language', value: language };
      unwrap(
        session
          ? await window.api.settings.setForProfile({ token: session.token, setting })
          : await window.api.settings.setGlobal({ setting }),
      );
      await changeLanguage(language);
    });

  const openProfile = (profileId: string) =>
    run(async () => {
      const opened = unwrap(await window.api.session.open({ profileId }));
      const settings = unwrap(await window.api.settings.getForProfile({ token: opened.token }));
      await changeLanguage(settings.language);
      setSession(opened);
    });

  const leaveProfile = () =>
    run(async () => {
      if (!session) return;
      unwrap(await window.api.session.close({ token: session.token }));
      setSession(null);
      const settings = unwrap(await window.api.settings.getGlobal());
      await changeLanguage(settings.language);
    });

  return (
    <div className="app-shell">
      <header className="top-bar">
        <span className="top-bar__brand">KeepToMyShelf</span>
        <LanguageSwitcher onChange={(language) => void selectLanguage(language)} />
      </header>
      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}
      <main className="app-main">
        {session ? (
          <HomeScreen
            profileName={session.profile.name}
            onSwitchProfile={() => void leaveProfile()}
          />
        ) : (
          <ProfileSelectionScreen onOpen={(profileId) => void openProfile(profileId)} />
        )}
      </main>
    </div>
  );
}
