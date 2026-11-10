import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { BackgroundService } from '../../src/main/application/background-service';
import { CatalogService } from '../../src/main/application/catalog-service';
import { CollectionService } from '../../src/main/application/collection-service';
import { ItemService } from '../../src/main/application/item-service';
import { DEFAULT_MEDIA_LIMITS } from '../../src/core/media/import-rules';
import { MediaService } from '../../src/main/application/media-service';
import { ProfileService } from '../../src/main/application/profile-service';
import { SessionManager } from '../../src/main/application/session-manager';
import { SettingsService } from '../../src/main/application/settings-service';
import { openAppDatabase } from '../../src/main/infrastructure/db/app-database';
import type { SqliteDatabase } from '../../src/main/infrastructure/db/connection';
import { createDataPaths, type DataPaths } from '../../src/main/infrastructure/paths';
import {
  BACKGROUND_SETTING_DEFAULTS,
  MEDIA_SETTING_DEFAULTS,
  type AppSettings,
} from '../../src/shared/settings';
import { createTempDir } from './temp-dir';

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'es',
  theme: 'system',
  ...MEDIA_SETTING_DEFAULTS,
  ...BACKGROUND_SETTING_DEFAULTS,
};

export interface ProfileFixture {
  readonly paths: DataPaths;
  readonly appDb: SqliteDatabase;
  readonly settings: SettingsService;
  readonly sessions: SessionManager;
  readonly profiles: ProfileService;
  readonly items: ItemService;
  readonly catalogs: CatalogService;
  readonly collections: CollectionService;
  readonly media: MediaService;
  readonly backgrounds: BackgroundService;
  /** Temporary folder for test files outside the app's data folder (e.g. files to import). */
  readonly scratchDir: string;
  /** Where the copies of opened documents go. */
  readonly openedDocumentsDir: string;
  /** Files "opened in the system viewer", in order. */
  readonly openedFiles: string[];
  /** What the system viewer answers next: '' when it opens the file, or an error message. */
  setViewerAnswer(answer: string): void;
  readonly cleanup: () => void;
}

/** Wires the profile services exactly like the app does, inside a temporary data folder. */
export function createProfileFixture(): ProfileFixture {
  const tempDir = createTempDir();
  const paths = createDataPaths(join(tempDir.path, 'data'));
  const scratchDir = join(tempDir.path, 'scratch');
  mkdirSync(paths.profilesDir, { recursive: true });
  mkdirSync(scratchDir);
  const appDb = openAppDatabase(paths.appDatabase);

  // Deterministic clock: each call advances one second.
  let tick = Date.parse('2026-10-22T10:00:00.000Z');
  const now = () => new Date((tick += 1000));

  const settings = new SettingsService(appDb, DEFAULT_SETTINGS);
  const sessions = new SessionManager({
    appDb,
    paths,
    now,
    newId: randomUUID,
    languageOf: (profileId) => settings.getForProfile(profileId).language,
    onOpen: (session) => media.onSessionOpened(session),
    onClose: (session) => media.onSessionClosing(session),
  });
  const profiles = new ProfileService({ appDb, paths, sessions, settings, now, newId: randomUUID });
  // Wired like the app: the optimized size and the PDF limit are the profile's preferences.
  // The system viewer is replaced by a recorder.
  const openedDocumentsDir = join(tempDir.path, 'opened-documents');
  const openedFiles: string[] = [];
  let viewerAnswer = '';
  const media = new MediaService({
    sessions,
    paths,
    now,
    limitsFor: (profileId) => {
      const preferences = settings.getForProfile(profileId);
      return {
        ...DEFAULT_MEDIA_LIMITS,
        optimizedMaxSide: preferences.optimizedMaxSide,
        maxDocumentBytes: preferences.maxDocumentMegabytes * 1024 * 1024,
      };
    },
    openedDocumentsDir,
    openWithSystem: (path) => {
      openedFiles.push(path);
      return Promise.resolve(viewerAnswer);
    },
  });
  const items = new ItemService({ sessions, now, newId: randomUUID, media });
  const catalogs = new CatalogService({ sessions });
  const collections = new CollectionService({ sessions, now, newId: randomUUID, media });
  const backgrounds = new BackgroundService({
    appDb,
    dir: paths.backgroundsDir,
    sessions,
    settings,
    now,
  });

  return {
    backgrounds,
    catalogs,
    collections,
    media,
    scratchDir,
    openedDocumentsDir,
    openedFiles,
    setViewerAnswer: (answer) => {
      viewerAnswer = answer;
    },
    paths,
    appDb,
    settings,
    sessions,
    profiles,
    items,
    cleanup: () => {
      sessions.closeCurrent();
      appDb.close();
      tempDir.remove();
    },
  };
}
