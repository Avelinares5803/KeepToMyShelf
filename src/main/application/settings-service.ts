import { NotFoundError, ValidationError } from '../../core/errors';
import {
  isSettingKey,
  settingSchemas,
  settingUpdateSchema,
  type AppSettings,
  type SettingUpdate,
} from '../../shared/settings';
import type { SqliteDatabase } from '../infrastructure/db/connection';

interface SettingRow {
  key: string;
  value: string;
}

/**
 * Preferences resolve as: profile value → global value → built-in default.
 * Values are stored as JSON and validated against `settingSchemas` on read and write.
 */
export class SettingsService {
  constructor(
    private readonly appDb: SqliteDatabase,
    private readonly defaults: AppSettings,
  ) {}

  getGlobal(): AppSettings {
    const rows = this.appDb.prepare('SELECT key, value FROM app_setting').all() as SettingRow[];
    return overlay(this.defaults, rows);
  }

  getForProfile(profileId: string): AppSettings {
    const rows = this.appDb
      .prepare('SELECT key, value FROM profile_setting WHERE profile_id = ?')
      .all(profileId) as SettingRow[];
    return overlay(this.getGlobal(), rows);
  }

  setGlobal(update: SettingUpdate): void {
    const { key, value } = parseUpdate(update);
    this.appDb
      .prepare(
        'INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(value));
  }

  setForProfile(profileId: string, update: SettingUpdate): void {
    const { key, value } = parseUpdate(update);
    if (!this.appDb.prepare('SELECT 1 FROM profile WHERE id = ?').get(profileId)) {
      throw new NotFoundError('profile.not_found', `Profile ${profileId} does not exist`);
    }
    this.appDb
      .prepare(
        `INSERT INTO profile_setting (profile_id, key, value) VALUES (?, ?, ?)
         ON CONFLICT (profile_id, key) DO UPDATE SET value = excluded.value`,
      )
      .run(profileId, key, JSON.stringify(value));
  }

  /** Sets the global value and removes every profile's own value for that preference. */
  applyToAllProfiles(update: SettingUpdate): void {
    this.appDb.transaction(() => {
      this.setGlobal(update);
      this.appDb.prepare('DELETE FROM profile_setting WHERE key = ?').run(update.key);
    })();
  }
}

function parseUpdate(update: SettingUpdate): SettingUpdate {
  const parsed = settingUpdateSchema.safeParse(update);
  if (!parsed.success) {
    throw new ValidationError(
      'settings.invalid_value',
      `Invalid setting: ${JSON.stringify(update)}`,
    );
  }
  return parsed.data;
}

function overlay(base: AppSettings, rows: readonly SettingRow[]): AppSettings {
  const result: Record<string, unknown> = { ...base };
  for (const { key, value } of rows) {
    if (!isSettingKey(key)) continue; // Preference from a newer app version: ignore it.
    const parsed = settingSchemas[key].safeParse(parseJson(value));
    if (parsed.success) {
      result[key] = parsed.data;
    } else {
      // A corrupt preference must not prevent the app from starting: keep the fallback value.
      console.warn(`Ignoring invalid stored value for setting "${key}": ${value}`);
    }
  }
  return result as AppSettings;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
