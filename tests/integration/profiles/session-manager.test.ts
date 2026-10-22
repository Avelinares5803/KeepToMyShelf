import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppError, NotFoundError } from '../../../src/core/errors';
import type { SqliteDatabase } from '../../../src/main/infrastructure/db/connection';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

function insertGame(db: SqliteDatabase, title: string): void {
  db.prepare(
    `INSERT INTO item (uuid, kind, title, title_norm, created_at, updated_at)
     VALUES (?, 'game', ?, lower(?), '2026-10-22', '2026-10-22')`,
  ).run(randomUUID(), title, title);
}

const titles = (db: SqliteDatabase) =>
  (db.prepare('SELECT title FROM item ORDER BY title').all() as { title: string }[]).map(
    (row) => row.title,
  );

describe('SessionManager', () => {
  let fx: ProfileFixture;

  beforeEach(() => {
    fx = createProfileFixture();
  });

  afterEach(() => {
    fx.cleanup();
  });

  it('opens a profile and records when it was last opened', () => {
    const { profile } = fx.profiles.create({ name: 'Ana' });

    const { token, profileId } = fx.sessions.open(profile.id);

    expect(profileId).toBe(profile.id);
    expect(fx.sessions.require(token).profileId).toBe(profile.id);
    expect(fx.sessions.isOpen(profile.id)).toBe(true);
    expect(fx.profiles.get(profile.id).lastOpenedAt).not.toBeNull();
  });

  it('fails to open a profile that does not exist', () => {
    expect(() => fx.sessions.open('00000000-0000-4000-8000-000000000000')).toThrow(NotFoundError);
  });

  it('keeps each profile’s library isolated from the others', () => {
    const { profile: ana } = fx.profiles.create({ name: 'Ana' });
    const { profile: bea } = fx.profiles.create({ name: 'Bea' });

    const anaSession = fx.sessions.open(ana.id);
    insertGame(fx.sessions.require(anaSession.token).db, 'Chrono Trigger');

    const beaSession = fx.sessions.open(bea.id);
    const beaDb = fx.sessions.require(beaSession.token).db;
    expect(titles(beaDb)).toEqual([]);
    insertGame(beaDb, 'Hollow Knight');

    const anaAgain = fx.sessions.open(ana.id);
    expect(titles(fx.sessions.require(anaAgain.token).db)).toEqual(['Chrono Trigger']);
  });

  it('closes the previous profile when another one is opened', () => {
    const { profile: ana } = fx.profiles.create({ name: 'Ana' });
    const { profile: bea } = fx.profiles.create({ name: 'Bea' });
    const anaSession = fx.sessions.open(ana.id);
    const anaDb = fx.sessions.require(anaSession.token).db;

    fx.sessions.open(bea.id);

    expect(anaDb.open).toBe(false);
    expect(fx.sessions.isOpen(ana.id)).toBe(false);
  });

  it('rejects tokens from a previous session, even for the same profile', () => {
    const { profile } = fx.profiles.create({ name: 'Ana' });
    const first = fx.sessions.open(profile.id);
    const second = fx.sessions.open(profile.id);

    expect(first.token).not.toBe(second.token);
    expect(() => fx.sessions.require(first.token)).toThrow(AppError);
    try {
      fx.sessions.require(first.token);
    } catch (error) {
      expect((error as AppError).code).toBe('session.stale');
    }
  });

  it('closes the session with its own token only', () => {
    const { profile } = fx.profiles.create({ name: 'Ana' });
    const { token } = fx.sessions.open(profile.id);

    expect(() => fx.sessions.close(randomUUID())).toThrow(AppError);
    expect(fx.sessions.isOpen(profile.id)).toBe(true);

    fx.sessions.close(token);
    expect(fx.sessions.isOpen(profile.id)).toBe(false);
    expect(() => fx.sessions.require(token)).toThrow(AppError);
  });
});
