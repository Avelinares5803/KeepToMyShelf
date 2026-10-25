import { useCallback, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionInfo } from '../../shared/ipc';
import type { AppSettings, SettingUpdate } from '../../shared/settings';
import { ItemDetailScreen } from '../features/items/ItemDetailScreen';
import { ItemEditScreen, type EditorGuard } from '../features/items/ItemEditScreen';
import { UnsavedChangesDialog } from '../features/items/UnsavedChangesDialog';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { ModeSelectionScreen } from '../features/modes/ModeSelectionScreen';
import { ProfileSelectionScreen } from '../features/profiles/ProfileSelectionScreen';
import { TrashScreen } from '../features/trash/TrashScreen';
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

  // The item editor registers a guard; leaving it with unsaved changes asks first.
  const editorGuard = useRef<EditorGuard | null>(null);
  const registerGuard = useCallback((guard: EditorGuard | null) => {
    editorGuard.current = guard;
  }, []);
  const [pendingLeave, setPendingLeave] = useState<{ run: () => void } | null>(null);
  const leaveEditor = (run: () => void) => {
    if (editorGuard.current?.isDirty()) setPendingLeave({ run });
    else run();
  };

  async function attempt(action: () => Promise<void>): Promise<void> {
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
    attempt(async () => {
      unwrap(
        session
          ? await window.api.settings.setForProfile({ token: session.token, setting: update })
          : await window.api.settings.setGlobal({ setting: update }),
      );
      await applySettings({ ...settings, [update.key]: update.value } as AppSettings);
    });

  const openProfile = (profileId: string) =>
    attempt(async () => {
      const opened = unwrap(await window.api.session.open({ profileId }));
      await applySettings(unwrap(await window.api.settings.getForProfile({ token: opened.token })));
      dispatch({ type: 'reset' });
      setSession(opened);
    });

  const leaveProfile = () =>
    attempt(async () => {
      if (!session) return;
      unwrap(await window.api.session.close({ token: session.token }));
      setSession(null);
      await applySettings(unwrap(await window.api.settings.getGlobal()));
    });

  // "Back" on the first screen of a profile returns to the profile selection.
  const goBack = () =>
    leaveEditor(() => (canGoBack(navigation) ? dispatch({ type: 'back' }) : void leaveProfile()));

  const relabel = useCallback((label: string) => dispatch({ type: 'relabel', label }), []);

  const screenLabel = (screen: Screen): string => {
    switch (screen.name) {
      case 'modes':
        return session?.profile.name ?? '';
      case 'library':
        return t(`modes.${screen.kind}`);
      case 'item':
        return screen.label;
      case 'edit':
        return screen.itemId === null ? t(`items.new.${screen.kind}`) : t('items.edit');
      case 'trash':
        return t('trash.title');
    }
  };

  const breadcrumbs: Breadcrumb[] = session
    ? [
        { label: t('nav.profiles'), onSelect: () => leaveEditor(() => void leaveProfile()) },
        ...navigation.stack.map((screen, index) => ({
          label: screenLabel(screen),
          onSelect:
            index < navigation.stack.length - 1
              ? () => leaveEditor(() => dispatch({ type: 'goTo', index }))
              : undefined,
        })),
      ]
    : [];

  function renderScreen(screen: Screen, token: string) {
    switch (screen.name) {
      case 'modes':
        return (
          <ModeSelectionScreen
            onSelect={(kind) => dispatch({ type: 'open', screen: { name: 'library', kind } })}
          />
        );
      case 'library':
        return (
          <LibraryScreen
            token={token}
            kind={screen.kind}
            onAdd={() =>
              dispatch({ type: 'open', screen: { name: 'edit', kind: screen.kind, itemId: null } })
            }
            onOpenTrash={() =>
              dispatch({ type: 'open', screen: { name: 'trash', kind: screen.kind } })
            }
            onOpenItem={(item) =>
              dispatch({
                type: 'open',
                screen: { name: 'item', kind: item.kind, itemId: item.id, label: '' },
              })
            }
          />
        );
      case 'item':
        return (
          <ItemDetailScreen
            token={token}
            kind={screen.kind}
            itemId={screen.itemId}
            onTitle={relabel}
            onEdit={() =>
              dispatch({
                type: 'open',
                screen: { name: 'edit', kind: screen.kind, itemId: screen.itemId },
              })
            }
            onTrashed={() => dispatch({ type: 'back' })}
          />
        );
      case 'edit':
        return (
          <ItemEditScreen
            key={`${screen.kind}:${screen.itemId ?? 'new'}`}
            token={token}
            kind={screen.kind}
            itemId={screen.itemId}
            registerGuard={registerGuard}
            onCancel={goBack}
            onSaved={(item) =>
              // A new item's editor becomes its detail view; an edited one returns to it.
              screen.itemId === null
                ? dispatch({
                    type: 'replace',
                    screen: { name: 'item', kind: item.kind, itemId: item.id, label: '' },
                  })
                : dispatch({ type: 'back' })
            }
          />
        );
      case 'trash':
        return <TrashScreen token={token} initialKind={screen.kind} />;
    }
  }

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
        {session ? (
          renderScreen(currentScreen(navigation), session.token)
        ) : (
          <ProfileSelectionScreen onOpen={(profileId) => void openProfile(profileId)} />
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
      {pendingLeave && (
        <UnsavedChangesDialog
          onKeepEditing={() => setPendingLeave(null)}
          onDiscard={() => {
            setPendingLeave(null);
            pendingLeave.run();
          }}
          onSave={async () => {
            const saved = (await editorGuard.current?.save()) ?? false;
            if (saved) {
              setPendingLeave(null);
              pendingLeave.run();
            }
            return saved;
          }}
        />
      )}
    </div>
  );
}
