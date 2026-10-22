import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  normalizeProfileName,
  PROFILE_NAME_MAX_LENGTH,
  profileNameKey,
  resolveUniqueProfileName,
} from './profile-name';

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

describe('normalizeProfileName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeProfileName('  Carlos   Pérez \t')).toBe('Carlos Pérez');
  });

  it('keeps case, accents and symbols as typed', () => {
    expect(normalizeProfileName('Adrián_99 ★')).toBe('Adrián_99 ★');
  });

  it('unifies precomposed and decomposed accents', () => {
    expect(normalizeProfileName('Adrián')).toBe('Adrián');
  });

  it.each(['', '   ', '\t\n'])('rejects a blank name %j', (raw) => {
    expectValidationError(() => normalizeProfileName(raw), 'profile.name_empty');
  });

  it('accepts names up to the maximum length, counting emoji as one character', () => {
    const maxLength = 'a'.repeat(PROFILE_NAME_MAX_LENGTH);
    expect(normalizeProfileName(maxLength)).toBe(maxLength);
    const emojiName = '🎮'.repeat(PROFILE_NAME_MAX_LENGTH);
    expect(normalizeProfileName(emojiName)).toBe(emojiName);
  });

  it('rejects names longer than the maximum', () => {
    expectValidationError(
      () => normalizeProfileName('a'.repeat(PROFILE_NAME_MAX_LENGTH + 1)),
      'profile.name_too_long',
    );
  });

  it.each(['Car\u0000los', 'Carlos\u0007', 'Car\u001blos'])(
    'rejects control characters in %j',
    (raw) => {
      expectValidationError(() => normalizeProfileName(raw), 'profile.name_invalid_characters');
    },
  );
});

describe('profileNameKey', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(profileNameKey('Adrián')).toBe(profileNameKey('ADRIAN'));
    expect(profileNameKey(' carlos ')).toBe(profileNameKey('Carlos'));
  });
});

describe('resolveUniqueProfileName', () => {
  it('keeps a free name unchanged', () => {
    expect(resolveUniqueProfileName('Carlos', ['Ana'])).toEqual({ name: 'Carlos', renamed: false });
  });

  it('adds (1) when the name is taken', () => {
    expect(resolveUniqueProfileName('Carlos', ['Carlos'])).toEqual({
      name: 'Carlos (1)',
      renamed: true,
    });
  });

  it('uses the lowest free suffix', () => {
    expect(resolveUniqueProfileName('Carlos', ['Carlos', 'Carlos (1)', 'Carlos (3)']).name).toBe(
      'Carlos (2)',
    );
  });

  it('treats names that differ only in case or accents as taken', () => {
    expect(resolveUniqueProfileName('adrian', ['Adrián'])).toEqual({
      name: 'adrian (1)',
      renamed: true,
    });
    expect(resolveUniqueProfileName('Carlos', ['carlos', 'CARLOS (1)']).name).toBe('Carlos (2)');
  });

  it('accepts a name with a suffix typed by the user if it is free', () => {
    expect(resolveUniqueProfileName('Carlos (1)', ['Carlos'])).toEqual({
      name: 'Carlos (1)',
      renamed: false,
    });
  });
});
