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

  it('tells apart the preferences a profile has of its own', () => {
    fx.settings.setGlobal({ key: 'theme', value: 'dark' });
    fx.settings.setForProfile(anaId, { key: 'language', value: 'en' });

    expect(fx.settings.getOwnForProfile(anaId)).toEqual({ language: 'en' });
    expect(fx.settings.getOwnForProfile(beaId)).toEqual({});
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

    expect(fx.settings.getForProfile(anaId)).toEqual({
      ...DEFAULT_SETTINGS,
      language: 'es',
      theme: 'light',
    });
    expect(fx.settings.getForProfile(beaId).language).toBe('es');
    expect(fx.settings.getGlobal().language).toBe('es');
  });

  it('stores the image import preferences, by default asking and optimizing to 2000 px', () => {
    expect(fx.settings.getGlobal()).toMatchObject({
      imageImportChoice: 'ask',
      optimizedMaxSide: 2000,
    });
    fx.settings.setForProfile(anaId, { key: 'imageImportChoice', value: 'optimized_only' });
    fx.settings.setForProfile(anaId, { key: 'optimizedMaxSide', value: 2560 });

    expect(fx.settings.getForProfile(anaId)).toMatchObject({
      imageImportChoice: 'optimized_only',
      optimizedMaxSide: 2560,
    });
    expect(fx.settings.getForProfile(beaId).imageImportChoice).toBe('ask');
  });

  it('stores the background preferences, by default no background and 3840 px', () => {
    expect(fx.settings.getGlobal()).toMatchObject({
      background: { kind: 'none' },
      backgroundBlur: 8,
      backgroundDimLight: 40,
      backgroundDimDark: 62,
      backgroundImportChoice: 'ask',
      backgroundMaxSide: 3840,
    });
    fx.settings.setForProfile(anaId, { key: 'background', value: { kind: 'preset', id: 'dusk' } });
    fx.settings.setForProfile(anaId, { key: 'backgroundBlur', value: 0 });
    fx.settings.setForProfile(anaId, { key: 'backgroundImportChoice', value: 'optimized_only' });
    fx.settings.setForProfile(anaId, { key: 'backgroundMaxSide', value: 5120 });

    expect(fx.settings.getForProfile(anaId)).toMatchObject({
      background: { kind: 'preset', id: 'dusk' },
      backgroundBlur: 0,
      backgroundImportChoice: 'optimized_only',
      backgroundMaxSide: 5120,
      // The import choice of covers is a separate preference.
      imageImportChoice: 'ask',
    });
    expect(fx.settings.getForProfile(beaId).background).toEqual({ kind: 'none' });
  });

  it('keeps a dimming for each theme, each with its own value per profile', () => {
    fx.settings.setForProfile(anaId, { key: 'backgroundDimLight', value: 0 });
    fx.settings.setGlobal({ key: 'backgroundDimDark', value: 90 });

    expect(fx.settings.getForProfile(anaId)).toMatchObject({
      backgroundDimLight: 0,
      backgroundDimDark: 90,
    });
    expect(fx.settings.getForProfile(beaId)).toMatchObject({
      backgroundDimLight: 40,
      backgroundDimDark: 90,
    });
  });

  it.each([
    { key: 'imageImportChoice', value: 'always' },
    { key: 'optimizedMaxSide', value: 2001 },
    { key: 'optimizedMaxSide', value: '2000' },
    { key: 'background', value: { kind: 'preset', id: 'unknown' } },
    { key: 'background', value: { kind: 'imported', id: 0 } },
    { key: 'background', value: 'none' },
    { key: 'backgroundBlur', value: -1 },
    { key: 'backgroundBlur', value: 41 },
    { key: 'backgroundBlur', value: 2.5 },
    { key: 'backgroundMaxSide', value: 4000 },
    { key: 'backgroundDimLight', value: -1 },
    { key: 'backgroundDimDark', value: 91 },
    { key: 'backgroundDimDark', value: 62.5 },
    { key: 'backgroundImportChoice', value: 'always' },
  ])('rejects the invalid value %j', (update) => {
    expect(() => fx.settings.setGlobal(update as unknown as SettingUpdate)).toThrow(
      ValidationError,
    );
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
