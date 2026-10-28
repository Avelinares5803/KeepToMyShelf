import { describe, expect, it } from 'vitest';
import type { GenreScope } from '../../../core/catalogs/catalogs';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import {
  exactChoice,
  moveChoice,
  nameToCreate,
  suggestionsFor,
  type EntryChoice,
} from './entry-picker';

let nextId = 1;
const entry = (
  name: string,
  aliases: string[] = [],
  scope: GenreScope | null = null,
): CatalogEntrySummary => ({
  id: nextId++,
  catalog: 'platform',
  name,
  aliases,
  scope,
  usage: { total: 0, game: 0, movie: 0, series: 0 },
});

const megaDrive = entry('Mega Drive', ['Sega Genesis']);
const snes = entry('SNES', ['Super Famicom']);
const superGameBoy = entry('Super Game Boy');
const platforms = [megaDrive, snes, superGameBoy];
const chose = (e: CatalogEntrySummary): EntryChoice => ({
  kind: 'existing',
  id: e.id,
  name: e.name,
});

describe('suggestionsFor', () => {
  it('suggests values by name or other name, ignoring case and accents', () => {
    expect(suggestionsFor(platforms, [], 'game', 'génesis')).toEqual([
      { entry: megaDrive, match: { by: 'alias', alias: 'Sega Genesis' } },
    ]);
    expect(suggestionsFor(platforms, [], 'game', 'snes').map((s) => s.entry)).toEqual([snes]);
  });

  it('lists values whose name starts with the text first', () => {
    expect(suggestionsFor(platforms, [], 'game', 'super').map((s) => s.entry.name)).toEqual([
      'Super Game Boy',
      'SNES',
    ]);
  });

  it('suggests every value when nothing is typed, except the chosen ones', () => {
    expect(suggestionsFor(platforms, [chose(snes)], 'game', '').map((s) => s.entry)).toEqual([
      megaDrive,
      superGameBoy,
    ]);
  });

  it('only suggests movie/series genres available for the kind', () => {
    const genres = [entry('Drama'), entry('Sitcom', [], 'series'), entry('Corto', [], 'movie')];
    expect(suggestionsFor(genres, [], 'movie', '').map((s) => s.entry.name)).toEqual([
      'Drama',
      'Corto',
    ]);
  });
});

describe('nameToCreate', () => {
  it('offers to create the typed name, cleaned, when no value has exactly that name', () => {
    expect(nameToCreate(platforms, [], '  Neo   Geo ')).toBe('Neo Geo');
    expect(nameToCreate(platforms, [], 'snes')).toBe('snes');
  });

  it('offers nothing for an empty text, an existing name or a new value already chosen', () => {
    expect(nameToCreate(platforms, [], '   ')).toBeNull();
    expect(nameToCreate(platforms, [], 'SNES')).toBeNull();
    expect(nameToCreate(platforms, [{ kind: 'new', name: 'Neo Geo' }], 'Neo Geo')).toBeNull();
  });
});

describe('exactChoice', () => {
  it('chooses only a value whose name is exactly the typed text', () => {
    expect(exactChoice(platforms, [], ' SNES ')).toEqual(chose(snes));
    expect(exactChoice(platforms, [], 'snes')).toBeNull();
    expect(exactChoice(platforms, [], 'Mega')).toBeNull();
  });

  it('never creates a value or repeats a chosen one', () => {
    expect(exactChoice(platforms, [], 'Neo Geo')).toBeNull();
    expect(exactChoice(platforms, [chose(snes)], 'SNES')).toBeNull();
  });
});

describe('moveChoice', () => {
  it('moves a value one place, staying within the list', () => {
    expect(moveChoice(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveChoice(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveChoice(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveChoice(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
