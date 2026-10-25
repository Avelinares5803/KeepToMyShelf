import { describe, expect, it } from 'vitest';
import { knownUsageDate, UNKNOWN_USAGE_DATE } from '../../../core/dates/usage-period';
import { ValidationError } from '../../../core/errors';
import { EMPTY_ITEM_DRAFT } from '../../../core/items/item-draft';
import type { ItemDetails } from '../../../shared/items';
import {
  EMPTY_DATE_FIELDS,
  hasChanges,
  toFormState,
  toItemDraft,
  type ItemFormState,
} from './item-form';

const EMPTY_FORM = toFormState(null);
const form = (overrides: Partial<ItemFormState>): ItemFormState => ({
  ...EMPTY_FORM,
  ...overrides,
});

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

const details: ItemDetails = {
  ...EMPTY_ITEM_DRAFT,
  id: 1,
  kind: 'game',
  title: 'Chrono Trigger',
  placeholderNumber: null,
  alternateTitles: ['クロノ・トリガー'],
  description: null,
  notes: 'Final 13',
  rating: 9,
  status: 'completed',
  ownsPhysical: true,
  ownsDigital: true,
  startedOn: knownUsageDate({ year: 1995, month: 3 }),
  finishedOn: UNKNOWN_USAGE_DATE,
  minutesPlayed: 2730,
  createdAt: '2026-10-25T10:00:00.000Z',
  updatedAt: '2026-10-25T10:00:00.000Z',
  deletedAt: null,
};

describe('item form', () => {
  it('starts empty for a new item and converts to an empty draft', () => {
    expect(toItemDraft('game', EMPTY_FORM)).toEqual(EMPTY_ITEM_DRAFT);
  });

  it('round-trips an existing item through the form', () => {
    const state = toFormState(details);

    expect(state).toMatchObject({
      title: 'Chrono Trigger',
      format: 'both',
      startedOn: { day: '', month: '3', year: '1995', unknown: false },
      finishedOn: { ...EMPTY_DATE_FIELDS, unknown: true },
      hours: '45',
      minutes: '30',
    });
    expect(toItemDraft('game', state)).toEqual({
      ...EMPTY_ITEM_DRAFT,
      title: 'Chrono Trigger',
      alternateTitles: ['クロノ・トリガー'],
      description: '',
      notes: 'Final 13',
      rating: 9,
      status: 'completed',
      ownsPhysical: true,
      ownsDigital: true,
      startedOn: knownUsageDate({ year: 1995, month: 3 }),
      finishedOn: UNKNOWN_USAGE_DATE,
      minutesPlayed: 2730,
    });
  });

  describe('dates', () => {
    it('builds dates with year, month or day precision', () => {
      const draft = toItemDraft(
        'game',
        form({
          startedOn: { day: '', month: '', year: '2020', unknown: false },
          finishedOn: { day: '14', month: '3', year: '2021', unknown: false },
        }),
      );
      expect(draft.startedOn).toEqual(knownUsageDate({ year: 2020 }));
      expect(draft.finishedOn).toEqual(knownUsageDate({ year: 2021, month: 3, day: 14 }));
    });

    it('requires a year when day or month are given', () => {
      expectCode(
        () => toItemDraft('game', form({ startedOn: { ...EMPTY_DATE_FIELDS, month: '3' } })),
        'date.invalid_year',
      );
    });

    it.each([
      [{ day: '31', month: '4', year: '2021' }, 'date.invalid_day'],
      [{ day: '5', month: '', year: '2021' }, 'date.day_without_month'],
      [{ day: '', month: '', year: '20x1' }, 'date.invalid_year'],
    ])('rejects %j', (parts, code) => {
      expectCode(
        () => toItemDraft('game', form({ startedOn: { ...parts, unknown: false } })),
        code,
      );
    });

    it('ignores the typed parts when the date is marked as unknown', () => {
      const draft = toItemDraft(
        'movie',
        form({ finishedOn: { day: '99', month: '', year: '', unknown: true } }),
      );
      expect(draft.finishedOn).toEqual(UNKNOWN_USAGE_DATE);
    });

    it('rejects an end date before the start date', () => {
      expectCode(
        () =>
          toItemDraft(
            'game',
            form({
              startedOn: { ...EMPTY_DATE_FIELDS, year: '2021' },
              finishedOn: { ...EMPTY_DATE_FIELDS, year: '2020' },
            }),
          ),
        'date.end_before_start',
      );
    });
  });

  describe('kind-specific numbers', () => {
    it('combines hours and minutes for games, treating a blank part as zero', () => {
      expect(toItemDraft('game', form({ hours: '2', minutes: '' })).minutesPlayed).toBe(120);
      expect(toItemDraft('game', form({ hours: '', minutes: '45' })).minutesPlayed).toBe(45);
    });

    it.each([
      [{ hours: '1.5' }, 'item.invalid_hours'],
      [{ hours: '-2' }, 'item.invalid_hours'],
      [{ minutes: '75' }, 'item.invalid_minutes'],
    ])('rejects %j', (fields, code) => {
      expectCode(() => toItemDraft('game', form(fields)), code);
    });

    it('reads seasons and episodes for series only', () => {
      expect(toItemDraft('series', form({ seasons: '3', episodes: '26' }))).toMatchObject({
        seasonsCount: 3,
        episodesCount: 26,
      });
      expect(toItemDraft('movie', form({ seasons: '3', hours: '2' }))).toMatchObject({
        seasonsCount: null,
        minutesPlayed: null,
      });
    });

    it('rejects a series count that is not a whole number', () => {
      expectCode(() => toItemDraft('series', form({ seasons: 'tres' })), 'item.invalid_count');
    });
  });

  it('detects unsaved changes', () => {
    const saved = toFormState(details);

    expect(hasChanges(saved, toFormState(details))).toBe(false);
    expect(hasChanges({ ...saved, notes: 'Changed' }, saved)).toBe(true);
  });
});
