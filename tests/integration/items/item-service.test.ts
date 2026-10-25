import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { knownUsageDate, UNKNOWN_USAGE_DATE } from '../../../src/core/dates/usage-period';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../../../src/core/errors';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { ItemKind } from '../../../src/shared/content';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

const draft = (overrides: Partial<ItemDraft> = {}): ItemDraft => ({
  ...EMPTY_ITEM_DRAFT,
  ...overrides,
});

function expectCode(run: () => unknown, type: typeof AppError, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(type);
    expect((error as AppError).code).toBe(code);
    return;
  }
  expect.fail(`Expected ${type.name} with code "${code}"`);
}

describe('ItemService', () => {
  let fx: ProfileFixture;
  let token: string;

  const create = (kind: ItemKind, overrides: Partial<ItemDraft> = {}) =>
    fx.items.create(token, kind, draft(overrides));
  const placeholders = (kind: ItemKind) =>
    fx.items.list(token, kind).map((item) => item.placeholderNumber);

  beforeEach(() => {
    fx = createProfileFixture();
    const { profile } = fx.profiles.create({ name: 'Ana' });
    token = fx.sessions.open(profile.id).token;
  });

  afterEach(() => {
    fx.cleanup();
  });

  describe('create and get', () => {
    it('stores every attribute and reads it back', () => {
      const created = create('game', {
        title: '  Chrono Trigger ',
        alternateTitles: ['クロノ・トリガー', 'Chrono Trigger DS'],
        description: 'RPG\nclásico',
        notes: 'Final 13 de 13',
        isFavorite: true,
        rating: 9,
        status: 'completed',
        isReplay: true,
        ownsPhysical: true,
        ownsDigital: false,
        startedOn: knownUsageDate({ year: 1995, month: 3 }),
        finishedOn: UNKNOWN_USAGE_DATE,
        minutesPlayed: 2730,
      });

      expect(fx.items.get(token, created.id)).toEqual(created);
      expect(created).toMatchObject({
        kind: 'game',
        title: 'Chrono Trigger',
        placeholderNumber: null,
        alternateTitles: ['クロノ・トリガー', 'Chrono Trigger DS'],
        description: 'RPG\nclásico',
        notes: 'Final 13 de 13',
        isFavorite: true,
        rating: 9,
        status: 'completed',
        isReplay: true,
        ownsPhysical: true,
        ownsDigital: false,
        startedOn: knownUsageDate({ year: 1995, month: 3 }),
        finishedOn: UNKNOWN_USAGE_DATE,
        minutesPlayed: 2730,
        seasonsCount: null,
        episodesCount: null,
        deletedAt: null,
      });
      expect(created.createdAt).toBe(created.updatedAt);
    });

    it('stores seasons and episodes for series', () => {
      const series = create('series', { title: 'Dark', seasonsCount: 3, episodesCount: 26 });

      expect(fx.items.get(token, series.id)).toMatchObject({ seasonsCount: 3, episodesCount: 26 });
    });

    it('rejects invalid drafts without storing anything', () => {
      expectCode(
        () => create('movie', { minutesPlayed: 90 }),
        ValidationError,
        'item.hours_only_for_games',
      );
      expect(fx.items.list(token, 'movie')).toEqual([]);
    });

    it('fails for an item that does not exist', () => {
      expectCode(() => fx.items.get(token, 999), NotFoundError, 'item.not_found');
    });
  });

  describe('placeholder titles', () => {
    it('numbers untitled items per kind', () => {
      create('game');
      create('game');
      create('movie');

      expect(placeholders('game')).toEqual([1, 2]);
      expect(placeholders('movie')).toEqual([1]);
    });

    it('keeps the numbers of items in the trash, so restoring never collides', () => {
      create('game');
      const second = create('game');
      fx.items.moveToTrash(token, second.id);

      expect(create('game').placeholderNumber).toBe(3);
      fx.items.restore(token, second.id);
      expect(placeholders('game')).toEqual([1, 2, 3]);
    });

    it('reuses the lowest number freed by permanent deletion or by giving a title', () => {
      const first = create('game');
      const second = create('game');
      create('game');
      fx.items.moveToTrash(token, second.id);
      fx.items.deletePermanently(token, second.id);
      fx.items.update(token, first.id, draft({ title: 'Ahora con título' }));

      expect(create('game').placeholderNumber).toBe(1);
      expect(create('game').placeholderNumber).toBe(2);
    });

    it('keeps the number of an item that stays untitled when edited', () => {
      create('game');
      const second = create('game');

      expect(fx.items.update(token, second.id, draft({ notes: 'x' })).placeholderNumber).toBe(2);
    });

    it('gives the lowest free number to an item whose title is removed', () => {
      const titled = create('game', { title: 'Zelda' });
      create('game');

      expect(fx.items.update(token, titled.id, draft({ title: '  ' }))).toMatchObject({
        title: null,
        placeholderNumber: 2,
      });
    });
  });

  describe('update', () => {
    it('replaces every attribute, including alternate titles, and keeps the creation date', () => {
      const item = create('game', {
        title: 'Old',
        alternateTitles: ['A', 'B'],
        rating: 4,
        minutesPlayed: 60,
      });

      const updated = fx.items.update(
        token,
        item.id,
        draft({ title: 'New', alternateTitles: ['C'], status: 'in_progress' }),
      );

      expect(updated).toMatchObject({
        title: 'New',
        alternateTitles: ['C'],
        rating: null,
        minutesPlayed: null,
        status: 'in_progress',
        createdAt: item.createdAt,
      });
      expect(updated.updatedAt > item.updatedAt).toBe(true);
    });

    it('updates series counts', () => {
      const series = create('series', { seasonsCount: 1 });

      expect(
        fx.items.update(token, series.id, draft({ seasonsCount: 2, episodesCount: 16 })),
      ).toMatchObject({ seasonsCount: 2, episodesCount: 16 });
    });

    it('refuses to edit an item in the trash', () => {
      const item = create('game');
      fx.items.moveToTrash(token, item.id);

      expectCode(
        () => fx.items.update(token, item.id, draft({ title: 'X' })),
        ConflictError,
        'item.in_trash',
      );
    });
  });

  describe('list', () => {
    it('sorts titles alphabetically ignoring case and accents, then untitled items by number', () => {
      create('game', { title: 'zelda' });
      create('game');
      create('game', { title: 'Ávalon' });
      create('game', { title: 'banjo' });
      create('game');

      expect(fx.items.list(token, 'game').map((i) => i.title ?? `#${i.placeholderNumber}`)).toEqual(
        ['Ávalon', 'banjo', 'zelda', '#1', '#2'],
      );
    });

    it('lists only items of the requested kind that are not in the trash', () => {
      const game = create('game', { title: 'Game' });
      const trashed = create('game', { title: 'Trashed' });
      create('movie', { title: 'Movie' });
      fx.items.moveToTrash(token, trashed.id);

      expect(fx.items.list(token, 'game').map((i) => i.id)).toEqual([game.id]);
    });
  });

  describe('trash', () => {
    it('moves items to the trash and restores them with all their data', () => {
      const item = create('game', { title: 'Zelda', alternateTitles: ['Hyrule'] });

      fx.items.moveToTrash(token, item.id);
      expect(fx.items.get(token, item.id).deletedAt).not.toBeNull();
      expect(fx.items.listTrash(token, 'game').map((i) => i.id)).toEqual([item.id]);

      fx.items.restore(token, item.id);
      expect(fx.items.get(token, item.id)).toMatchObject({
        deletedAt: null,
        alternateTitles: ['Hyrule'],
      });
      expect(fx.items.listTrash(token, null)).toEqual([]);
    });

    it('lists the trash per kind or all together, most recently deleted first', () => {
      const game = create('game', { title: 'Game' });
      const movie = create('movie', { title: 'Movie' });
      fx.items.moveToTrash(token, game.id);
      fx.items.moveToTrash(token, movie.id);

      expect(fx.items.listTrash(token, 'game').map((i) => i.id)).toEqual([game.id]);
      expect(fx.items.listTrash(token, null).map((i) => i.id)).toEqual([movie.id, game.id]);
    });

    it('deletes permanently only items in the trash, together with their related rows', () => {
      const series = create('series', { alternateTitles: ['Alt'], seasonsCount: 1 });
      expectCode(
        () => fx.items.deletePermanently(token, series.id),
        ConflictError,
        'item.not_in_trash',
      );

      fx.items.moveToTrash(token, series.id);
      fx.items.deletePermanently(token, series.id);

      expectCode(() => fx.items.get(token, series.id), NotFoundError, 'item.not_found');
      const db = fx.sessions.require(token).db;
      expect(db.prepare('SELECT COUNT(*) AS n FROM item_alt_title').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM series_details').get()).toEqual({ n: 0 });
    });

    it('empties the trash of one kind or entirely, and reports how many were deleted', () => {
      const ids = [create('game'), create('game'), create('movie'), create('series')].map(
        (item) => item.id,
      );
      const kept = create('game', { title: 'Not in the trash' });
      ids.forEach((id) => fx.items.moveToTrash(token, id));

      expect(fx.items.emptyTrash(token, 'game')).toBe(2);
      expect(fx.items.listTrash(token, null).map((i) => i.kind)).toEqual(['series', 'movie']);
      expect(fx.items.emptyTrash(token, null)).toBe(2);
      expect(fx.items.listTrash(token, null)).toEqual([]);
      expect(fx.items.list(token, 'game').map((i) => i.id)).toEqual([kept.id]);
    });

    it('fails for items that do not exist', () => {
      expectCode(() => fx.items.moveToTrash(token, 999), NotFoundError, 'item.not_found');
      expectCode(() => fx.items.restore(token, 999), NotFoundError, 'item.not_found');
    });
  });

  describe('sessions', () => {
    it('rejects a stale session token', () => {
      const stale = token;
      const { profile } = fx.profiles.create({ name: 'Bea' });
      token = fx.sessions.open(profile.id).token;

      expectCode(() => fx.items.list(stale, 'game'), AppError, 'session.stale');
      expectCode(() => fx.items.create(stale, 'game', draft()), AppError, 'session.stale');
    });

    it('rejects an unknown token', () => {
      expectCode(() => fx.items.list(randomUUID(), 'game'), AppError, 'session.stale');
    });

    it('keeps items isolated per profile', () => {
      create('game', { title: 'Only for Ana' });
      const { profile } = fx.profiles.create({ name: 'Bea' });
      token = fx.sessions.open(profile.id).token;

      expect(fx.items.list(token, 'game')).toEqual([]);
    });
  });
});
