import { Fragment, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImageStorageChoice } from '../../core/media/import-rules';
import type { ScheduledBackupFailure } from '../../shared/backups';
import type { SessionInfo } from '../../shared/ipc';
import type { ItemSummary } from '../../shared/items';
import { BACKGROUND_DIM_KEYS, type AppSettings, type SettingUpdate } from '../../shared/settings';
import { AppBackground } from '../features/backgrounds/AppBackground';
import type { BackupSettingsProps } from '../features/backups/BackupSettings';
import { backgroundSource } from '../features/backgrounds/presets';
import type { ImportSettingsProps } from '../features/imports/ImportSettings';
import { CatalogsScreen } from '../features/catalogs/CatalogsScreen';
import {
  collectionViewOf,
  withCollectionView,
  withoutCollectionView,
  type CollectionViews,
} from '../features/collections/collection-view';
import { CollectionScreen } from '../features/collections/CollectionScreen';
import { CollectionsScreen } from '../features/collections/CollectionsScreen';
import { ItemDetailScreen } from '../features/items/ItemDetailScreen';
import { ItemEditScreen, type EditorGuard } from '../features/items/ItemEditScreen';
import { UnsavedChangesDialog } from '../features/items/UnsavedChangesDialog';
import { libraryViewOf, type LibraryViews } from '../features/library/library-view';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { ModeSelectionScreen } from '../features/modes/ModeSelectionScreen';
import { ProfileSelectionScreen } from '../features/profiles/ProfileSelectionScreen';
import { TrashScreen } from '../features/trash/TrashScreen';
import { changeLanguage } from '../i18n';
import { errorMessage, unwrap } from '../lib/ipc';
import { SCROLL_AREA_ID } from '../lib/scroll-area';
import { useLoad } from '../lib/use-load';
import {
  canGoBack,
  currentScreen,
  initialNavigation,
  navigationReducer,
  type Screen,
} from './navigation';
import { SettingsDialog, type BackgroundSettingsOptions } from './SettingsDialog';
import { applyTheme, useShownTheme } from './theme';
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
  const [libraryViews, setLibraryViews] = useState<LibraryViews>({});
  const [collectionViews, setCollectionViews] = useState<CollectionViews>({});
  // The common gallery of imported backgrounds, and the blur shown while its slider moves.
  const gallery = useLoad(() => window.api.backgrounds.list(), []);
  const [blurPreview, setBlurPreview] = useState<number | null>(null);
  // Each theme has its own dimming: the one of the theme shown applies, and its slider changes it.
  const shownTheme = useShownTheme(settings.theme);
  const dimKey = BACKGROUND_DIM_KEYS[shownTheme];
  const [dimPreview, setDimPreview] = useState<number | null>(null);
  const shownDim = dimPreview ?? settings[dimKey];

  // A scheduled backup runs unseen; if it fails, the main process says so on its own.
  const [failedBackup, setFailedBackup] = useState<ScheduledBackupFailure | null>(null);
  useEffect(() => window.api.backups.onScheduledFailure(setFailedBackup), []);

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

  // Closing the window with unsaved changes asks too. In Electron, cancelling "beforeunload"
  // silently keeps the window open, so the app shows its own dialog instead.
  const closeConfirmed = useRef(false);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (closeConfirmed.current || !editorGuard.current?.isDirty()) return;
      event.preventDefault();
      setPendingLeave({
        run: () => {
          closeConfirmed.current = true;
          window.close();
        },
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

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
  // The new value shows at once (a control never jumps back while it is being saved) and is
  // undone if it cannot be saved.
  const storeSetting = async (update: SettingUpdate) =>
    unwrap(
      session
        ? await window.api.settings.setForProfile({ token: session.token, setting: update })
        : await window.api.settings.setGlobal({ setting: update }),
    );

  const updateSetting = (update: SettingUpdate) =>
    attempt(async () => {
      const next = { ...settings, [update.key]: update.value } as AppSettings;
      setSettings(next);
      try {
        await storeSetting(update);
      } catch (caught) {
        setSettings(settings);
        throw caught;
      }
      await applySettings(next);
    });

  /** The preferences in force: the open profile's, or the global ones outside a profile. */
  const reloadSettings = async () =>
    applySettings(
      unwrap(
        session
          ? await window.api.settings.getForProfile({ token: session.token })
          : await window.api.settings.getGlobal(),
      ),
    );

  const background: BackgroundSettingsOptions = {
    token: session?.token ?? null,
    gallery: gallery.data,
    galleryError: gallery.error,
    blur: blurPreview ?? settings.backgroundBlur,
    onBlurPreview: setBlurPreview,
    onBlurCommit: (blur) =>
      void (async () => {
        if (blur !== settings.backgroundBlur) {
          await updateSetting({ key: 'backgroundBlur', value: blur });
        }
        // Only now, so the background never jumps back to the old blur while saving.
        setBlurPreview(null);
      })(),
    dimTheme: shownTheme,
    dim: shownDim,
    onDimPreview: setDimPreview,
    onDimCommit: (dim) =>
      void (async () => {
        if (dim !== settings[dimKey]) await updateSetting({ key: dimKey, value: dim });
        setDimPreview(null);
      })(),
    // The last background imported becomes the background; it shows once the gallery reloads.
    onImported: (added) => {
      gallery.reload();
      const last = added.at(-1);
      if (last) void updateSetting({ key: 'background', value: { kind: 'imported', id: last.id } });
    },
    // Deleting a background may have sent this profile (or the global value) back to none.
    onDeleted: () => {
      gallery.reload();
      void attempt(reloadSettings);
    },
  };

  /** Starts a profile's session on its first screen, with its own preferences. */
  async function enterSession(opened: SessionInfo): Promise<void> {
    await applySettings(unwrap(await window.api.settings.getForProfile({ token: opened.token })));
    dispatch({ type: 'reset' });
    setLibraryViews({});
    setCollectionViews({});
    setSession(opened);
  }

  const openProfile = (profileId: string) =>
    attempt(async () => enterSession(unwrap(await window.api.session.open({ profileId }))));

  // Restoring a backup over the open profile replaces its library and preferences, so it starts
  // again from its first screen with the new session. If it fails, its data has not changed, but
  // its session may have been opened again with a token the UI does not know: it is opened again
  // here, staying on the same screen.
  const backups: BackupSettingsProps | null = session && {
    token: session.token,
    profileName: session.profile.name,
    beforeRestore: leaveEditor,
    onRestored: enterSession,
    onSessionLost: async () => {
      setSession(unwrap(await window.api.session.open({ profileId: session.profile.id })));
    },
  };

  // Importing only adds to the library: the screen shown is loaded again (a new key mounts it
  // anew), keeping where the user is. The editor, if open, is asked about first.
  const [importRevision, setImportRevision] = useState(0);
  const imports: ImportSettingsProps | null = session && {
    token: session.token,
    profileName: session.profile.name,
    beforeImport: leaveEditor,
    onImported: () => setImportRevision((revision) => revision + 1),
  };

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

  // The image import preferences of the open profile, for covers and galleries.
  const imageImport = {
    importChoice: settings.imageImportChoice,
    optimizedMaxSide: settings.optimizedMaxSide,
    onRememberChoice: (choice: ImageStorageChoice) =>
      void updateSetting({ key: 'imageImportChoice', value: choice }),
  };
  // The size of the covers, shared by the libraries and the collections. Its slider can send
  // several values in a row, so each one only changes this preference: a late answer must not
  // bring back an older value. If saving fails, the stored preferences are shown again.
  const libraryColumns = {
    columns: settings.libraryColumns,
    onColumnsChange: (columns: number) =>
      void attempt(async () => {
        setSettings((current) => ({ ...current, libraryColumns: columns }));
        try {
          await storeSetting({ key: 'libraryColumns', value: columns });
        } catch (caught) {
          await reloadSettings();
          throw caught;
        }
      }),
  };
  const openItem = (item: ItemSummary) =>
    dispatch({
      type: 'open',
      screen: { name: 'item', kind: item.kind, itemId: item.id, label: '' },
    });

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
      case 'catalogs':
        return t('catalogs.title');
      case 'collections':
        return t('collections.title');
      case 'collection':
        return screen.label;
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
            onOpenCollections={() => dispatch({ type: 'open', screen: { name: 'collections' } })}
            onOpenCatalogs={() =>
              dispatch({ type: 'open', screen: { name: 'catalogs', kind: null } })
            }
          />
        );
      case 'library':
        return (
          <LibraryScreen
            token={token}
            kind={screen.kind}
            view={libraryViewOf(libraryViews, screen.kind)}
            onViewChange={(change) =>
              setLibraryViews((views) => ({
                ...views,
                [screen.kind]: { ...libraryViewOf(views, screen.kind), ...change },
              }))
            }
            {...libraryColumns}
            onAdd={() =>
              dispatch({ type: 'open', screen: { name: 'edit', kind: screen.kind, itemId: null } })
            }
            onOpenTrash={() =>
              dispatch({ type: 'open', screen: { name: 'trash', kind: screen.kind } })
            }
            onOpenCatalogs={() =>
              dispatch({ type: 'open', screen: { name: 'catalogs', kind: screen.kind } })
            }
            onOpenItem={openItem}
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
            onOpenCollection={({ id, name }) =>
              dispatch({
                type: 'open',
                screen: { name: 'collection', collectionId: id, label: name },
              })
            }
          />
        );
      case 'edit':
        return (
          <ItemEditScreen
            key={`${screen.kind}:${screen.itemId ?? 'new'}`}
            token={token}
            kind={screen.kind}
            itemId={screen.itemId}
            imageImport={{
              choice: imageImport.importChoice,
              optimizedMaxSide: imageImport.optimizedMaxSide,
              onRemember: imageImport.onRememberChoice,
            }}
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
      case 'catalogs':
        return (
          <CatalogsScreen
            token={token}
            profileId={session?.profile.id ?? null}
            initialKind={screen.kind}
          />
        );
      case 'collections':
        return (
          <CollectionsScreen
            token={token}
            imageImport={imageImport}
            onOpen={({ id, name }) =>
              dispatch({
                type: 'open',
                screen: { name: 'collection', collectionId: id, label: name },
              })
            }
          />
        );
      case 'collection':
        return (
          <CollectionScreen
            key={screen.collectionId}
            token={token}
            collectionId={screen.collectionId}
            view={collectionViewOf(collectionViews, screen.collectionId)}
            onViewChange={(change) =>
              setCollectionViews((views) => withCollectionView(views, screen.collectionId, change))
            }
            {...libraryColumns}
            imageImport={imageImport}
            onTitle={relabel}
            onOpenItem={openItem}
            onDeleted={() => {
              setCollectionViews((views) => withoutCollectionView(views, screen.collectionId));
              dispatch({ type: 'back' });
            }}
          />
        );
    }
  }

  return (
    <div className="app-shell">
      <AppBackground
        src={backgroundSource(settings.background, gallery.data ?? [])}
        blur={blurPreview ?? settings.backgroundBlur}
        dim={shownDim}
      />
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
      {failedBackup !== null && (
        <div className="banner banner--error banner--closable" role="alert">
          <p>{t('backups.schedule.failed', { name: failedBackup.profileName })}</p>
          <button
            type="button"
            className="button button--ghost"
            onClick={() => setFailedBackup(null)}
          >
            {t('backups.schedule.dismiss')}
          </button>
        </div>
      )}
      <main className="app-main" id={SCROLL_AREA_ID}>
        {session ? (
          <Fragment key={importRevision}>
            {renderScreen(currentScreen(navigation), session.token)}
          </Fragment>
        ) : (
          <ProfileSelectionScreen
            // Outside a profile, the preferences in force are the global ones.
            backgrounds={{
              gallery: gallery.data,
              globalBackground: settings.background,
              importChoice: settings.backgroundImportChoice,
              optimizedMaxSide: settings.backgroundMaxSide,
              onRememberChoice: (choice) =>
                void updateSetting({ key: 'backgroundImportChoice', value: choice }),
              onGalleryChanged: gallery.reload,
            }}
            onOpen={(profileId) => void openProfile(profileId)}
          />
        )}
      </main>
      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          profileName={session?.profile.name ?? null}
          background={background}
          backups={backups}
          imports={imports}
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
