import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  CATALOG_MAX_ALIASES,
  CATALOG_NAME_MAX_LENGTH,
  catalogForRole,
  isScopeCompatible,
  normalizeAliases,
  normalizeCatalogName,
  rolesForKind,
} from './catalogs';

describe('roles per kind', () => {
  it('lists the roles of each kind in form order', () => {
    expect(rolesForKind('game')).toEqual([
      'franchise',
      'owned_on',
      'released_on',
      'genre',
      'publisher',
      'developer',
      'composer',
      'origin_country',
      'tag',
    ]);
    expect(rolesForKind('movie')).toEqual([
      'franchise',
      'genre',
      'producer',
      'director',
      'actor',
      'composer',
      'origin_country',
      'tag',
    ]);
    expect(rolesForKind('series')).toEqual(rolesForKind('movie'));
  });

  it('maps each role to its catalog depending on the kind', () => {
    expect(catalogForRole('game', 'genre')).toBe('game_genre');
    expect(catalogForRole('series', 'origin_country')).toBe('country');
    expect(catalogForRole('movie', 'genre')).toBe('screen_genre');
    expect(catalogForRole('game', 'developer')).toBe('company');
    expect(catalogForRole('series', 'producer')).toBe('company');
    expect(catalogForRole('movie', 'composer')).toBe('person');
    expect(catalogForRole('game', 'tag')).toBe('tag');
  });

  it('rejects roles that do not apply to the kind', () => {
    expect(catalogForRole('movie', 'developer')).toBeNull();
    expect(catalogForRole('movie', 'owned_on')).toBeNull();
    expect(catalogForRole('game', 'actor')).toBeNull();
    expect(catalogForRole('game', 'producer')).toBeNull();
  });

  it('limits scoped movie/series genres to their kind', () => {
    expect(isScopeCompatible(null, 'movie')).toBe(true);
    expect(isScopeCompatible('series', 'series')).toBe(true);
    expect(isScopeCompatible('series', 'movie')).toBe(false);
    expect(isScopeCompatible('movie', 'series')).toBe(false);
  });
});

describe('normalizeAliases', () => {
  it('drops blank names, exact repetitions and the value’s own name, keeping order', () => {
    expect(
      normalizeAliases('Super Nintendo', [' SNES ', '', 'Super Famicom', 'SNES', 'Super Nintendo']),
    ).toEqual(['SNES', 'Super Famicom']);
  });

  it('keeps names that differ in case or accents', () => {
    expect(normalizeAliases('Pokémon', ['Pokemon', 'POKÉMON'])).toEqual(['Pokemon', 'POKÉMON']);
  });

  it('validates every name and limits how many there are', () => {
    expect(() => normalizeAliases('X', ['a'.repeat(CATALOG_NAME_MAX_LENGTH + 1)])).toThrow(
      ValidationError,
    );
    const tooMany = Array.from({ length: CATALOG_MAX_ALIASES + 1 }, (_, i) => `Alias ${i}`);
    expect(() => normalizeAliases('X', tooMany)).toThrow(ValidationError);
  });
});

describe('normalizeCatalogName', () => {
  it('trims spaces but keeps case and accents as typed', () => {
    expect(normalizeCatalogName('  Hipó  ')).toBe('Hipó');
    expect(normalizeCatalogName('HIPO')).toBe('HIPO');
  });

  it.each([
    ['   ', 'catalog.name_empty'],
    ['Nin\u0000tendo', 'catalog.name_invalid_characters'],
    ['a'.repeat(CATALOG_NAME_MAX_LENGTH + 1), 'catalog.name_too_long'],
  ])('rejects %j', (raw, code) => {
    try {
      normalizeCatalogName(raw);
      expect.fail('Expected ValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).code).toBe(code);
    }
  });
});
