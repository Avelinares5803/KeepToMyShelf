import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../src/core/errors';
import { openDatabase } from '../../../src/main/infrastructure/db/connection';
import { getSchemaVersion } from '../../../src/main/infrastructure/db/migrator';
import { libraryMigrations } from '../../../src/main/infrastructure/db/migrations/library';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

function expectAppError(run: () => unknown, type: typeof AppError, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(type);
    expect((error as AppError).code).toBe(code);
    return;
  }
  expect.fail(`Expected ${type.name} with code "${code}"`);
}

describe('ProfileService', () => {
  let fx: ProfileFixture;

  beforeEach(() => {
    fx = createProfileFixture();
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('create', () => {
    it('registers the profile and creates its library at the latest schema version', () => {
      const { profile, renamed } = fx.profiles.create({ name: '  Adrián  ' });

      expect(renamed).toBe(false);
      expect(profile.name).toBe('Adrián');
      expect(profile.lastOpenedAt).toBeNull();
      expect(fx.profiles.list()).toEqual([profile]);

      const library = openDatabase(fx.paths.libraryDatabase(profile.id));
      try {
        expect(getSchemaVersion(library)).toBe(libraryMigrations.length);
      } finally {
        library.close();
      }
    });

    it('adds the lowest free suffix to a duplicate name, ignoring case and accents', () => {
      fx.profiles.create({ name: 'Carlos' });

      expect(fx.profiles.create({ name: 'carlos' })).toMatchObject({
        profile: { name: 'carlos (1)' },
        renamed: true,
      });
      expect(fx.profiles.create({ name: 'CÁRLOS' }).profile.name).toBe('CÁRLOS (2)');
    });

    it('stores the language chosen at creation as the profile preference', () => {
      const { profile } = fx.profiles.create({ name: 'Ana', language: 'en' });

      expect(fx.settings.getForProfile(profile.id).language).toBe('en');
      expect(fx.settings.getGlobal().language).toBe('es');
    });

    it('rejects an invalid name without leaving anything behind', () => {
      expectAppError(
        () => fx.profiles.create({ name: '   ' }),
        ValidationError,
        'profile.name_empty',
      );

      expect(fx.profiles.list()).toEqual([]);
      expect(readdirSync(fx.paths.profilesDir)).toEqual([]);
    });
  });

  describe('list', () => {
    it('sorts profiles by name, ignoring case and accents', () => {
      for (const name of ['zoe', 'Álvaro', 'beatriz']) fx.profiles.create({ name });

      expect(fx.profiles.list().map((p) => p.name)).toEqual(['Álvaro', 'beatriz', 'zoe']);
    });
  });

  describe('rename', () => {
    it('renames a profile', () => {
      const { profile } = fx.profiles.create({ name: 'Carlos' });

      expect(fx.profiles.rename(profile.id, 'Carla')).toEqual({
        profile: { ...profile, name: 'Carla' },
        renamed: false,
      });
      expect(fx.profiles.get(profile.id).name).toBe('Carla');
    });

    it('allows changing only the case or accents of its own name', () => {
      const { profile } = fx.profiles.create({ name: 'adrian' });

      expect(fx.profiles.rename(profile.id, 'Adrián')).toMatchObject({
        profile: { name: 'Adrián' },
        renamed: false,
      });
    });

    it('adds a suffix when the new name belongs to another profile', () => {
      fx.profiles.create({ name: 'Carlos' });
      const { profile } = fx.profiles.create({ name: 'Ana' });

      expect(fx.profiles.rename(profile.id, 'Carlos')).toMatchObject({
        profile: { name: 'Carlos (1)' },
        renamed: true,
      });
    });

    it('fails for a profile that does not exist', () => {
      expectAppError(() => fx.profiles.rename(MISSING_ID, 'X'), NotFoundError, 'profile.not_found');
    });
  });

  describe('delete', () => {
    it('removes the profile, its folder and its preferences', () => {
      const { profile } = fx.profiles.create({ name: 'Ana', language: 'en' });

      fx.profiles.delete(profile.id);

      expect(fx.profiles.list()).toEqual([]);
      expect(readdirSync(fx.paths.profilesDir)).toEqual([]);
      expect(fx.appDb.prepare('SELECT COUNT(*) AS n FROM profile_setting').get()).toEqual({ n: 0 });
    });

    it('keeps other profiles untouched', () => {
      const { profile: ana } = fx.profiles.create({ name: 'Ana' });
      const { profile: bea } = fx.profiles.create({ name: 'Bea' });

      fx.profiles.delete(ana.id);

      expect(fx.profiles.list()).toEqual([bea]);
      expect(existsSync(fx.paths.libraryDatabase(bea.id))).toBe(true);
    });

    it('refuses to delete the open profile', () => {
      const { profile } = fx.profiles.create({ name: 'Ana' });
      fx.sessions.open(profile.id);

      expectAppError(() => fx.profiles.delete(profile.id), ConflictError, 'profile.in_use');
      expect(fx.profiles.list()).toHaveLength(1);
    });

    it('fails for a profile that does not exist', () => {
      expectAppError(() => fx.profiles.delete(MISSING_ID), NotFoundError, 'profile.not_found');
    });

    it('works even if the profile folder was removed outside the app', () => {
      const { profile } = fx.profiles.create({ name: 'Ana' });
      rmSync(fx.paths.profileDir(profile.id), { recursive: true });

      fx.profiles.delete(profile.id);

      expect(fx.profiles.list()).toEqual([]);
    });
  });

  describe('removeDeletedProfileFolders', () => {
    it('removes leftover folders of deleted profiles and nothing else', () => {
      const { profile } = fx.profiles.create({ name: 'Ana' });
      const leftover = join(fx.paths.profilesDir, '.deleted-11111111-1111-4111-8111-111111111111');
      mkdirSync(leftover);
      writeFileSync(join(leftover, 'library.db'), 'old data');

      fx.profiles.removeDeletedProfileFolders();

      expect(readdirSync(fx.paths.profilesDir)).toEqual([profile.id]);
    });
  });
});
