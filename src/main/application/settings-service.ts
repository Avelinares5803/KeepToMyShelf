import { NotFoundError, ValidationError } from '../../core/errors';
import {
  isSettingKey,
  NO_BACKGROUND,
  settingSchemas,
  settingUpdateSchema,
  type AppSettings,
  type BackgroundChoice,
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
 * An imported background must exist in the common gallery (`background_file`).
 */
export class SettingsService {
  constructor(
    private readonly appDb: SqliteDatabase,
    private readonly defaults: AppSettings,
  ) {}

  getGlobal(): AppSettings {
    const rows = this.appDb.prepare('SELECT key, value FROM app_setting').all() as SettingRow[];
    return this.overlay(this.defaults, rows);
  }

  getForProfile(profileId: string): AppSettings {
    const rows = this.appDb
      .prepare('SELECT key, value FROM profile_setting WHERE profile_id = ?')
      .all(profileId) as SettingRow[];
    return this.overlay(this.getGlobal(), rows);
  }

  /** Only the preferences a profile has of its own, without the global ones. */
  getOwnForProfile(profileId: string): Partial<AppSettings> {
    const rows = this.appDb
      .prepare('SELECT key, value FROM profile_setting WHERE profile_id = ?')
      .all(profileId) as SettingRow[];
    return this.overlay({} as AppSettings, rows);
  }

  setGlobal(update: SettingUpdate): void {
    const { key, value } = this.parseUpdate(update);
    this.appDb
      .prepare(
        'INSERT INTO app_setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(value));
  }

  setForProfile(profileId: string, update: SettingUpdate): void {
    const { key, value } = this.parseUpdate(update);
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

  /**
   * The global value and the profiles' own values that use a background are set to no
   * background. Called when it is deleted, inside the same transaction.
   */
  resetBackground(backgroundId: number): void {
    const none = JSON.stringify(NO_BACKGROUND);
    const uses = `key = 'background' AND json_extract(value, '$.kind') = 'imported'
                  AND json_extract(value, '$.id') = ?`;
    this.appDb.prepare(`UPDATE app_setting SET value = ? WHERE ${uses}`).run(none, backgroundId);
    this.appDb
      .prepare(`UPDATE profile_setting SET value = ? WHERE ${uses}`)
      .run(none, backgroundId);
  }

  private parseUpdate(update: SettingUpdate): SettingUpdate {
    const parsed = settingUpdateSchema.safeParse(update);
    if (!parsed.success) {
      throw new ValidationError(
        'settings.invalid_value',
        `Invalid setting: ${JSON.stringify(update)}`,
      );
    }
    const { data } = parsed;
    if (data.key === 'background' && data.value.kind === 'imported') {
      if (!this.backgroundExists(data.value.id)) {
        throw new NotFoundError('background.not_found', `Background ${data.value.id} is gone`);
      }
    }
    return data;
  }

  private backgroundExists(id: number): boolean {
    return (
      this.appDb
        .prepare("SELECT 1 FROM background_file WHERE id = ? AND store = 'files'")
        .get(id) !== undefined
    );
  }

  private overlay(base: AppSettings, rows: readonly SettingRow[]): AppSettings {
    const result: Record<string, unknown> = { ...base };
    for (const { key, value } of rows) {
      if (!isSettingKey(key)) continue; // Preference from a newer app version: ignore it.
      const parsed = settingSchemas[key].safeParse(parseJson(value));
      if (!parsed.success) {
        // A corrupt preference must not prevent the app from starting: keep the fallback value.
        console.warn(`Ignoring invalid stored value for setting "${key}": ${value}`);
        continue;
      }
      result[key] = parsed.data;
      // Deleting a background resets its users, so this only happens if app.db was edited.
      const background = key === 'background' ? (parsed.data as BackgroundChoice) : null;
      if (background?.kind === 'imported' && !this.backgroundExists(background.id)) {
        console.warn(`Ignoring missing background ${background.id}`);
        result[key] = NO_BACKGROUND;
      }
    }
    return result as AppSettings;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
