import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { ItemService } from '../../src/main/application/item-service';
import { ProfileService } from '../../src/main/application/profile-service';
import { SessionManager } from '../../src/main/application/session-manager';
import { SettingsService } from '../../src/main/application/settings-service';
import { openAppDatabase } from '../../src/main/infrastructure/db/app-database';
import type { SqliteDatabase } from '../../src/main/infrastructure/db/connection';
import { createDataPaths, type DataPaths } from '../../src/main/infrastructure/paths';
import type { AppSettings } from '../../src/shared/settings';
import { createTempDir } from './temp-dir';

export const DEFAULT_SETTINGS: AppSettings = { language: 'es', theme: 'system' };

export interface ProfileFixture {
  readonly paths: DataPaths;
  readonly appDb: SqliteDatabase;
  readonly settings: SettingsService;
  readonly sessions: SessionManager;
  readonly profiles: ProfileService;
  readonly items: ItemService;
  readonly cleanup: () => void;
}

/** Wires the profile services exactly like the app does, inside a temporary data folder. */
export function createProfileFixture(): ProfileFixture {
  const tempDir = createTempDir();
  const paths = createDataPaths(tempDir.path);
  mkdirSync(paths.profilesDir, { recursive: true });
  const appDb = openAppDatabase(paths.appDatabase);

  // Deterministic clock: each call advances one second.
  let tick = Date.parse('2026-10-22T10:00:00.000Z');
  const now = () => new Date((tick += 1000));

  const settings = new SettingsService(appDb, DEFAULT_SETTINGS);
  const sessions = new SessionManager({ appDb, paths, now, newId: randomUUID });
  const profiles = new ProfileService({ appDb, paths, sessions, settings, now, newId: randomUUID });
  const items = new ItemService({ sessions, now, newId: randomUUID });

  return {
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
