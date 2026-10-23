import { useReducer, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionInfo } from '../../shared/ipc';
import type { AppSettings, SettingUpdate } from '../../shared/settings';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { ModeSelectionScreen } from '../features/modes/ModeSelectionScreen';
import { ProfileSelectionScreen } from '../features/profiles/ProfileSelectionScreen';
import { changeLanguage } from '../i18n';
import { errorMessage, unwrap } from '../lib/ipc';
import {
  canGoBack,
  currentScreen,
  initialNavigation,
  navigationReducer,
  type Screen,
} from './navigation';
import { SettingsDialog } from './SettingsDialog';
import { applyTheme } from './theme';
import { TopBar, type Breadcrumb } from './TopBar';

interface AppProps {
  initialSettings: AppSettings;
}

export function App({ initialSettings }: AppProps) {
  const { t } = useTranslation();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [navigation, dispatch] = useReducer(navigationReducer, initialNavigation);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run(action: () => Promise<void>): Promise<void> {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught);
    }
  }

  async function applySettings(next: AppSettings): Promise<void> {
    await changeLanguage(next.language);
    await applyTheme(next.theme);
    setSettings(next);
  }

  // Outside a profile, preferences are the global defaults; inside, the profile's own.
  const updateSetting = (update: SettingUpdate) =>
    run(async () => {
      unwrap(
        session
          ? await window.api.settings.setForProfile({ token: session.token, setting: update })
          : await window.api.settings.setGlobal({ setting: update }),
      );
      await applySettings({ ...settings, [update.key]: update.value } as AppSettings);
    });

  const openProfile = (profileId: string) =>
    run(async () => {
      const opened = unwrap(await window.api.session.open({ profileId }));
      await applySettings(unwrap(await window.api.settings.getForProfile({ token: opened.token })));
      dispatch({ type: 'reset' });
      setSession(opened);
    });

  const leaveProfile = () =>
    run(async () => {
      if (!session) return;
      unwrap(await window.api.session.close({ token: session.token }));
      setSession(null);
      await applySettings(unwrap(await window.api.settings.getGlobal()));
    });

  // "Back" on the first screen of a profile returns to the profile selection.
  const goBack = () => (canGoBack(navigation) ? dispatch({ type: 'back' }) : void leaveProfile());

  const screenLabel = (screen: Screen) =>
    screen.name === 'modes' ? (session?.profile.name ?? '') : t(`modes.${screen.kind}`);

  const breadcrumbs: Breadcrumb[] = session
    ? [
        { label: t('nav.profiles'), onSelect: () => void leaveProfile() },
        ...navigation.stack.map((screen, index) => ({
          label: screenLabel(screen),
          onSelect:
            index < navigation.stack.length - 1
              ? () => dispatch({ type: 'goTo', index })
              : undefined,
        })),
      ]
    : [];

  const screen = currentScreen(navigation);

  return (
    <div className="app-shell">
      <TopBar
        breadcrumbs={breadcrumbs}
        settings={settings}
        onBack={session ? goBack : null}
        onLanguageChange={(language) => void updateSetting({ key: 'language', value: language })}
        onThemeChange={(theme) => void updateSetting({ key: 'theme', value: theme })}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {error !== null && (
        <p className="banner banner--error" role="alert">
          {errorMessage(t, error)}
        </p>
      )}
      <main className="app-main">
        {!session ? (
          <ProfileSelectionScreen onOpen={(profileId) => void openProfile(profileId)} />
        ) : screen.name === 'modes' ? (
          <ModeSelectionScreen
            onSelect={(kind) => dispatch({ type: 'open', screen: { name: 'library', kind } })}
          />
        ) : (
          <LibraryScreen kind={screen.kind} />
        )}
      </main>
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          profileName={session?.profile.name ?? null}
          onChange={(update) => void updateSetting(update)}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
