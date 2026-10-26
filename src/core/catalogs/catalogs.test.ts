import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  CATALOG_NAME_MAX_LENGTH,
  catalogForRole,
  isScopeCompatible,
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
      'developer',
      'publisher',
      'composer',
      'tag',
    ]);
    expect(rolesForKind('movie')).toEqual([
      'franchise',
      'genre',
      'director',
      'actor',
      'composer',
      'producer',
      'tag',
    ]);
    expect(rolesForKind('series')).toEqual(rolesForKind('movie'));
  });

  it('maps each role to its catalog depending on the kind', () => {
    expect(catalogForRole('game', 'genre')).toBe('game_genre');
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
