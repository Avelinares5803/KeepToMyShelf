import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  COLLECTION_NAME_MAX_LENGTH,
  collectionNameKey,
  normalizeCollectionName,
} from './collection-name';

function expectValidationError(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe(code);
    return;
  }
  expect.fail(`Expected ValidationError with code "${code}"`);
}

describe('normalizeCollectionName', () => {
  it('trims and collapses whitespace, keeping case and accents', () => {
    expect(normalizeCollectionName('  RPG   que quiero\tcompletar ')).toBe(
      'RPG que quiero completar',
    );
    expect(normalizeCollectionName('Películas ★')).toBe('Películas ★');
  });

  it.each(['', '   ', '\t\n'])('rejects a blank name %j', (raw) => {
    expectValidationError(() => normalizeCollectionName(raw), 'collection.name_empty');
  });

  it('accepts names up to the maximum length, counting emoji as one character', () => {
    const longest = '🎮'.repeat(COLLECTION_NAME_MAX_LENGTH);
    expect(normalizeCollectionName(longest)).toBe(longest);
    expectValidationError(() => normalizeCollectionName(`${longest}a`), 'collection.name_too_long');
  });

  it('rejects control characters', () => {
    expectValidationError(
      () => normalizeCollectionName('Mis\u0007 juegos'),
      'collection.name_invalid_characters',
    );
  });
});

describe('collectionNameKey', () => {
  it('ignores case and accents', () => {
    expect(collectionNameKey('Películas PENDIENTES')).toBe(
      collectionNameKey('peliculas pendientes'),
    );
    expect(collectionNameKey('Favoritas')).not.toBe(collectionNameKey('Favoritos'));
  });
});
