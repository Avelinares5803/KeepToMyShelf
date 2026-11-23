import { describe, expect, it } from 'vitest';
import { knownUsageDate, UNKNOWN_USAGE_DATE } from '../dates/usage-period';
import { ValidationError } from '../errors';
import {
  checkItemDraft,
  EMPTY_ITEM_DRAFT,
  ITEM_LIMITS,
  validateItemDraft,
  type ItemDraft,
} from './item-draft';

const draft = (overrides: Partial<ItemDraft>): ItemDraft => ({ ...EMPTY_ITEM_DRAFT, ...overrides });

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

describe('validateItemDraft', () => {
  it('accepts a completely empty draft, which gets a placeholder title', () => {
    expect(validateItemDraft('game', EMPTY_ITEM_DRAFT)).toEqual({
      ...EMPTY_ITEM_DRAFT,
      title: null,
      description: null,
      notes: null,
    });
  });

  it('cleans the title and treats a blank one as no title', () => {
    expect(validateItemDraft('game', draft({ title: '  Chrono   Trigger ' })).title).toBe(
      'Chrono Trigger',
    );
    expect(validateItemDraft('game', draft({ title: '   ' })).title).toBeNull();
  });

  it('keeps line breaks in description and notes, and empties become null', () => {
    const result = validateItemDraft(
      'movie',
      draft({ description: '\r\nPrimera línea\r\nSegunda\r\n', notes: '  ' }),
    );
    expect(result.description).toBe('Primera línea\nSegunda');
    expect(result.notes).toBeNull();
  });

  it('removes blank and repeated alternate titles, ignoring case and accents', () => {
    const result = validateItemDraft(
      'game',
      draft({ alternateTitles: ['Pokémon Oro', ' ', 'POKEMON ORO', 'Pocket Monsters Kin'] }),
    );
    expect(result.alternateTitles).toEqual(['Pokémon Oro', 'Pocket Monsters Kin']);
  });

  it.each<[string, Partial<ItemDraft>, string]>([
    ['a title with control characters', { title: 'Zel\u0000da' }, 'item.title_invalid_characters'],
    ['a too long title', { title: 'a'.repeat(ITEM_LIMITS.titleLength + 1) }, 'item.title_too_long'],
    [
      'a too long alternate title',
      { alternateTitles: ['a'.repeat(ITEM_LIMITS.titleLength + 1)] },
      'item.alternate_title_too_long',
    ],
    [
      'too many alternate titles',
      {
        alternateTitles: Array.from({ length: ITEM_LIMITS.alternateTitles + 1 }, (_, i) => `T${i}`),
      },
      'item.too_many_alternate_titles',
    ],
    [
      'a too long description',
      { description: 'a'.repeat(ITEM_LIMITS.longTextLength + 1) },
      'item.description_too_long',
    ],
    [
      'a too long note',
      { notes: 'a'.repeat(ITEM_LIMITS.longTextLength + 1) },
      'item.notes_too_long',
    ],
    ['a rating of 0', { rating: 0 }, 'item.invalid_rating'],
    ['a decimal rating', { rating: 4.5 }, 'item.invalid_rating'],
    ['negative minutes played', { minutesPlayed: -1 }, 'item.invalid_hours'],
    [
      'a start date that does not exist',
      { startedOn: knownUsageDate({ year: 2021, month: 4, day: 31 }) },
      'date.invalid_day',
    ],
    [
      'an end date with an invalid month',
      { finishedOn: knownUsageDate({ year: 2021, month: 13 }) },
      'date.invalid_month',
    ],
    [
      'a day without a month',
      { startedOn: knownUsageDate({ year: 2021, day: 5 }) },
      'date.day_without_month',
    ],
    [
      'an end date before the start date',
      { startedOn: knownUsageDate({ year: 2021 }), finishedOn: knownUsageDate({ year: 2020 }) },
      'date.end_before_start',
    ],
  ])('rejects %s', (_label, overrides, code) => {
    expectCode(() => validateItemDraft('game', draft(overrides)), code);
  });

  it('accepts exactly the maximum sizes', () => {
    expect(() =>
      validateItemDraft(
        'game',
        draft({
          title: 'a'.repeat(ITEM_LIMITS.titleLength),
          description: 'a'.repeat(ITEM_LIMITS.longTextLength),
        }),
      ),
    ).not.toThrow();
  });

  it('accepts unknown dates on either side', () => {
    expect(() =>
      validateItemDraft(
        'game',
        draft({ startedOn: UNKNOWN_USAGE_DATE, finishedOn: knownUsageDate({ year: 1990 }) }),
      ),
    ).not.toThrow();
  });

  it('reports the first error in the usual order when there are several', () => {
    // Alternate titles were always checked after dates; the title comes first.
    const broken = draft({
      alternateTitles: ['a'.repeat(ITEM_LIMITS.titleLength + 1)],
      startedOn: knownUsageDate({ year: 2021 }),
      finishedOn: knownUsageDate({ year: 2020 }),
    });
    expectCode(() => validateItemDraft('game', broken), 'date.end_before_start');
    expectCode(
      () => validateItemDraft('game', { ...broken, title: 'Zel\u0000da' }),
      'item.title_invalid_characters',
    );
  });

  describe('kind-specific attributes', () => {
    it('allows hours played only for video games', () => {
      expect(validateItemDraft('game', draft({ minutesPlayed: 90 })).minutesPlayed).toBe(90);
      expectCode(
        () => validateItemDraft('movie', draft({ minutesPlayed: 90 })),
        'item.hours_only_for_games',
      );
      expectCode(
        () => validateItemDraft('series', draft({ minutesPlayed: 90 })),
        'item.hours_only_for_games',
      );
    });

    it('allows seasons and episodes only for series', () => {
      const result = validateItemDraft('series', draft({ seasonsCount: 3, episodesCount: 26 }));
      expect(result).toMatchObject({ seasonsCount: 3, episodesCount: 26 });
      expectCode(
        () => validateItemDraft('game', draft({ seasonsCount: 1 })),
        'item.counts_only_for_series',
      );
      expectCode(
        () => validateItemDraft('movie', draft({ episodesCount: 1 })),
        'item.counts_only_for_series',
      );
    });

    it.each([-1, 1.5, ITEM_LIMITS.count + 1])('rejects %s as a series count', (count) => {
      expectCode(
        () => validateItemDraft('series', draft({ seasonsCount: count })),
        'item.invalid_count',
      );
    });
  });
});

describe('checkItemDraft', () => {
  const errorsOf = (kind: 'game' | 'series', overrides: Partial<ItemDraft>) => {
    const result = checkItemDraft(kind, draft(overrides));
    return result.ok ? [] : result.errors.map(({ field, code }) => ({ field, code }));
  };

  it('returns the clean draft when there are no errors', () => {
    expect(checkItemDraft('game', draft({ title: ' Zelda ' }))).toEqual({
      ok: true,
      value: validateItemDraft('game', draft({ title: ' Zelda ' })),
    });
  });

  it('gathers every error, each with its field', () => {
    expect(
      errorsOf('series', {
        title: 'a'.repeat(ITEM_LIMITS.titleLength + 1),
        alternateTitles: ['Bien', 'Ma\u0000l', 'a'.repeat(ITEM_LIMITS.titleLength + 1)],
        notes: 'a'.repeat(ITEM_LIMITS.longTextLength + 1),
        startedOn: knownUsageDate({ year: 2021, month: 4, day: 31 }),
        seasonsCount: -1,
        episodesCount: 1.5,
        releases: [
          { region: null, date: { year: 2000 } },
          { region: null, date: { year: 2000, month: 2, day: 30 } },
        ],
      }),
    ).toEqual([
      { field: 'title', code: 'item.title_too_long' },
      { field: 'startedOn', code: 'date.invalid_day' },
      { field: 'seasonsCount', code: 'item.invalid_count' },
      { field: 'episodesCount', code: 'item.invalid_count' },
      { field: 'alternateTitles.1', code: 'item.alternate_title_invalid_characters' },
      { field: 'alternateTitles.2', code: 'item.alternate_title_too_long' },
      { field: 'notes', code: 'item.notes_too_long' },
      { field: 'releases.1', code: 'date.invalid_day' },
    ]);
  });

  it('puts an end before the start on the end date, and only if both dates exist', () => {
    expect(
      errorsOf('game', {
        startedOn: knownUsageDate({ year: 2021 }),
        finishedOn: knownUsageDate({ year: 2020 }),
      }),
    ).toEqual([{ field: 'finishedOn', code: 'date.end_before_start' }]);
    expect(
      errorsOf('game', {
        startedOn: knownUsageDate({ year: 2021, month: 13 }),
        finishedOn: knownUsageDate({ year: 2020 }),
      }),
    ).toEqual([{ field: 'startedOn', code: 'date.invalid_month' }]);
  });
});
