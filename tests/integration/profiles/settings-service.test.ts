import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../../src/core/errors';
import type { SettingUpdate } from '../../../src/shared/settings';
import {
  createProfileFixture,
  DEFAULT_SETTINGS,
  type ProfileFixture,
} from '../../support/profile-fixture';

describe('SettingsService', () => {
  let fx: ProfileFixture;
  let anaId: string;
  let beaId: string;

  beforeEach(() => {
    fx = createProfileFixture();
    anaId = fx.profiles.create({ name: 'Ana' }).profile.id;
    beaId = fx.profiles.create({ name: 'Bea' }).profile.id;
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('returns the built-in defaults when nothing is stored', () => {
    expect(fx.settings.getGlobal()).toEqual(DEFAULT_SETTINGS);
    expect(fx.settings.getForProfile(anaId)).toEqual(DEFAULT_SETTINGS);
  });

  it('applies a global value to every profile without its own value', () => {
    fx.settings.setGlobal({ key: 'theme', value: 'dark' });

    expect(fx.settings.getGlobal().theme).toBe('dark');
    expect(fx.settings.getForProfile(anaId).theme).toBe('dark');
  });

  it('lets a profile value take precedence over the global one', () => {
    fx.settings.setGlobal({ key: 'language', value: 'en' });
    fx.settings.setForProfile(anaId, { key: 'language', value: 'es' });

    expect(fx.settings.getForProfile(anaId).language).toBe('es');
    expect(fx.settings.getForProfile(beaId).language).toBe('en');
  });

  it('overwrites a previous value', () => {
    fx.settings.setForProfile(anaId, { key: 'theme', value: 'light' });
    fx.settings.setForProfile(anaId, { key: 'theme', value: 'dark' });

    expect(fx.settings.getForProfile(anaId).theme).toBe('dark');
  });

  it('applies a value to all profiles, removing their own values for that preference only', () => {
    fx.settings.setForProfile(anaId, { key: 'language', value: 'en' });
    fx.settings.setForProfile(anaId, { key: 'theme', value: 'light' });

    fx.settings.applyToAllProfiles({ key: 'language', value: 'es' });

    expect(fx.settings.getForProfile(anaId)).toEqual({ language: 'es', theme: 'light' });
    expect(fx.settings.getForProfile(beaId).language).toBe('es');
    expect(fx.settings.getGlobal().language).toBe('es');
  });

  it('rejects invalid values', () => {
    const invalid = { key: 'language', value: 'fr' } as unknown as SettingUpdate;

    expect(() => fx.settings.setGlobal(invalid)).toThrow(ValidationError);
    expect(() => fx.settings.setForProfile(anaId, invalid)).toThrow(ValidationError);
  });

  it('fails to set a value for a profile that does not exist', () => {
    expect(() =>
      fx.settings.setForProfile('00000000-0000-4000-8000-000000000000', {
        key: 'theme',
        value: 'dark',
      }),
    ).toThrow(NotFoundError);
  });

  it('ignores corrupt or unknown stored values instead of failing', () => {
    const insert = fx.appDb.prepare('INSERT INTO app_setting (key, value) VALUES (?, ?)');
    insert.run('theme', '"purple"');
    insert.run('language', 'not json');
    insert.run('setting_from_future_version', '1');

    expect(fx.settings.getGlobal()).toEqual(DEFAULT_SETTINGS);
  });
});
