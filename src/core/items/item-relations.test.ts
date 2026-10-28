import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import {
  RELATION_LIMITS,
  validateRelations,
  validateReleases,
  type EntryRef,
} from './item-relations';

function expectCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe(code);
    return;
  }
  expect.fail(`Expected ValidationError with code "${code}"`);
}

const existing = (id: number): EntryRef => ({ kind: 'existing', id });
const added = (name: string): EntryRef => ({ kind: 'new', name });

describe('validateRelations', () => {
  it('keeps the chosen order and cleans new names', () => {
    expect(
      validateRelations('movie', { actor: [existing(5), added('  Keanu   Reeves '), existing(2)] }),
    ).toEqual({ actor: [existing(5), added('Keanu Reeves'), existing(2)] });
  });

  it('drops values repeated in the same role, but not across roles', () => {
    expect(
      validateRelations('game', {
        developer: [existing(1), existing(1), added('Capcom'), added(' Capcom')],
        publisher: [existing(1)],
      }),
    ).toEqual({ developer: [existing(1), added('Capcom')], publisher: [existing(1)] });
  });

  it('keeps names that differ only in case as different values', () => {
    expect(validateRelations('game', { tag: [added('Hipo'), added('HIPO')] })).toEqual({
      tag: [added('Hipo'), added('HIPO')],
    });
  });

  it('rejects roles that do not apply to the kind, ignoring empty ones', () => {
    expectCode(
      () => validateRelations('movie', { owned_on: [existing(1)] }),
      'item.role_not_allowed',
    );
    expectCode(() => validateRelations('game', { actor: [added('X')] }), 'item.role_not_allowed');
    expect(validateRelations('movie', { owned_on: [] })).toEqual({});
  });

  it('validates new names', () => {
    expectCode(() => validateRelations('game', { tag: [added('   ')] }), 'catalog.name_empty');
  });

  it('limits the number of values per role', () => {
    const many = Array.from({ length: RELATION_LIMITS.valuesPerRole + 1 }, (_, i) =>
      existing(i + 1),
    );
    expectCode(() => validateRelations('game', { tag: many }), 'item.too_many_values');
  });
});

describe('validateReleases', () => {
  it('accepts dates with or without a region, even repeated regions', () => {
    const releases = [
      { region: existing(1), date: { year: 1996, month: 2, day: 27 } },
      { region: existing(1), date: { year: 1998 } },
      { region: null, date: { year: 1999, month: 10 } },
      { region: added(' Japón '), date: { year: 2000 } },
    ];
    expect(validateReleases(releases)).toEqual([
      ...releases.slice(0, 3),
      { region: added('Japón'), date: { year: 2000 } },
    ]);
  });

  it('rejects dates that do not exist', () => {
    expectCode(
      () => validateReleases([{ region: null, date: { year: 2021, month: 2, day: 30 } }]),
      'date.invalid_day',
    );
  });

  it('limits the number of release dates', () => {
    const many = Array.from({ length: RELATION_LIMITS.releases + 1 }, () => ({
      region: null,
      date: { year: 2000 },
    }));
    expectCode(() => validateReleases(many), 'item.too_many_releases');
  });
});
