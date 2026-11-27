import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EMPTY_ITEM_DRAFT, type ItemDraft } from '../../../src/core/items/item-draft';
import type { ItemKind } from '../../../src/shared/content';
import { createProfileFixture, type ProfileFixture } from '../../support/profile-fixture';

// Names no default catalog has, so each one is a new value.
const named = (...names: string[]) => names.map((name) => ({ kind: 'new' as const, name }));

describe('StatsService', () => {
  let fx: ProfileFixture;
  let token: string;

  const add = (kind: ItemKind, draft: Partial<ItemDraft> = {}) =>
    fx.items.create(token, kind, { ...EMPTY_ITEM_DRAFT, ...draft }).id;
  const trash = (id: number) => fx.items.moveToTrash(token, id);
  const stats = (kind: ItemKind | null = null) => fx.stats.get(token, kind);

  beforeEach(() => {
    fx = createProfileFixture();
    const profileId = fx.profiles.create({ name: 'Ana', language: 'es' }).profile.id;
    token = fx.sessions.open(profileId).token;
  });

  afterEach(() => fx.cleanup());

  it('counts nothing in an empty library, though the default catalogs exist', () => {
    expect(stats()).toEqual({
      total: 0,
      byKind: { game: 0, movie: 0, series: 0 },
      favorites: 0,
      replays: 0,
      physical: 0,
      digital: 0,
      statuses: { not_started: 0, in_progress: 0, completed: 0, abandoned: 0, none: 0 },
      ratings: { counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], unrated: 0, average: null },
      played: { minutes: 0, games: 0 },
      finishedByYear: [],
      finishedWithoutDate: 0,
      gameGenres: [],
      screenGenres: [],
      platforms: [],
    });
  });

  it('counts each kind, never the trash, and an item owned in both formats in both', () => {
    add('game', { isFavorite: true, ownsPhysical: true, ownsDigital: true });
    add('game', { isReplay: true, ownsDigital: true });
    add('movie', { isFavorite: true, ownsPhysical: true });
    trash(add('series', { isFavorite: true, isReplay: true, ownsPhysical: true }));

    expect(stats()).toMatchObject({
      total: 3,
      byKind: { game: 2, movie: 1, series: 0 },
      favorites: 2,
      replays: 1,
      physical: 2,
      digital: 2,
    });
    expect(stats('game')).toMatchObject({
      total: 2,
      byKind: { game: 2, movie: 0, series: 0 },
      favorites: 1,
      physical: 1,
      digital: 2,
    });
    expect(stats('series').total).toBe(0);
  });

  it('counts the statuses, the ratings in half stars and their average', () => {
    add('game', { status: 'completed', rating: 10 });
    add('game', { status: 'completed', rating: 7 });
    add('movie', { status: 'abandoned', rating: 1 });
    add('series', { status: 'in_progress' });
    add('series');
    trash(add('game', { status: 'not_started', rating: 2 }));

    const { statuses, ratings } = stats();
    expect(statuses).toEqual({
      not_started: 0,
      in_progress: 1,
      completed: 2,
      abandoned: 1,
      none: 1,
    });
    expect(ratings).toEqual({ counts: [1, 0, 0, 0, 0, 0, 1, 0, 0, 1], unrated: 2, average: 6 });
    expect(stats('game').ratings.average).toBe(8.5);
    expect(stats('series').ratings.average).toBeNull();
  });

  it('adds the minutes of the games played, leaving out those with none', () => {
    add('game', { minutesPlayed: 90 });
    add('game', { minutesPlayed: 2730 });
    add('game', { minutesPlayed: 0 });
    add('game');
    trash(add('game', { minutesPlayed: 600 }));

    expect(stats().played).toEqual({ minutes: 2820, games: 2 });
    expect(stats('game').played).toEqual({ minutes: 2820, games: 2 });
    expect(stats('movie').played).toBeNull();
    expect(stats('series').played).toBeNull();
  });

  it('counts the items completed by the year they ended, whatever the precision', () => {
    const ended = (year: number, month?: number, day?: number) => ({
      kind: 'known' as const,
      date: { year, month, day },
    });
    add('game', { status: 'completed', finishedOn: ended(2021, 3, 14) });
    add('movie', { status: 'completed', finishedOn: ended(2021) });
    add('series', { status: 'completed', finishedOn: ended(2019, 11) });
    add('game', { status: 'completed', finishedOn: ended(2023) });
    // Without a known end date.
    add('game', { status: 'completed', finishedOn: { kind: 'unknown' } });
    add('movie', { status: 'completed' });
    // Not completed, or in the trash: not counted.
    add('game', { status: 'abandoned', finishedOn: ended(2022) });
    add('game', { finishedOn: ended(2022) });
    trash(add('game', { status: 'completed', finishedOn: ended(2020) }));
    trash(add('game', { status: 'completed' }));

    expect(stats().finishedByYear).toEqual([
      { year: 2023, count: 1 },
      { year: 2021, count: 2 },
      { year: 2019, count: 1 },
    ]);
    expect(stats().finishedWithoutDate).toBe(2);
    expect(stats('game').finishedByYear).toEqual([
      { year: 2023, count: 1 },
      { year: 2021, count: 1 },
    ]);
    expect(stats('game').finishedWithoutDate).toBe(1);
  });

  it('counts the genres of each catalog and "my platforms", the most used first', () => {
    add('game', {
      relations: {
        genre: named('Zeta género', 'Alfa género'),
        owned_on: named('Consola B'),
        released_on: named('Consola lanzamiento'),
      },
    });
    const existing = (name: string) => {
      const entry = fx.catalogs
        .list(token, name === 'Consola B' ? 'platform' : 'game_genre')
        .find((each) => each.name === name);
      return { kind: 'existing' as const, id: entry!.id };
    };
    add('game', {
      relations: { genre: [existing('Zeta género')], owned_on: [existing('Consola B')] },
    });
    add('game', { relations: { owned_on: named('Consola A') } });
    add('movie', { relations: { genre: named('Cine género') } });
    add('series', { relations: { genre: named('Serie género') } });
    trash(add('game', { relations: { genre: named('Papelera género') } }));

    expect(stats()).toMatchObject({
      gameGenres: [
        { name: 'Zeta género', count: 2 },
        { name: 'Alfa género', count: 1 },
      ],
      screenGenres: [
        { name: 'Cine género', count: 1 },
        { name: 'Serie género', count: 1 },
      ],
      platforms: [
        { name: 'Consola B', count: 2 },
        { name: 'Consola A', count: 1 },
      ],
    });
    expect(stats('game')).toMatchObject({ screenGenres: null });
    expect(stats('movie')).toMatchObject({
      gameGenres: null,
      platforms: null,
      screenGenres: [{ name: 'Cine género', count: 1 }],
    });
  });
});
