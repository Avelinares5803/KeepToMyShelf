import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors';
import { formatDuration, MAX_HOURS_PLAYED, toHoursAndMinutes, toTotalMinutes } from './duration';

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

describe('duration', () => {
  it('combines hours and minutes into total minutes and back', () => {
    expect(toTotalMinutes({ hours: 45, minutes: 30 })).toBe(2730);
    expect(toHoursAndMinutes(2730)).toEqual({ hours: 45, minutes: 30 });
    expect(toTotalMinutes({ hours: 0, minutes: 0 })).toBe(0);
  });

  it('accepts the maximum number of hours', () => {
    expect(toTotalMinutes({ hours: MAX_HOURS_PLAYED, minutes: 59 })).toBe(
      MAX_HOURS_PLAYED * 60 + 59,
    );
  });

  it.each([-1, 1.5, MAX_HOURS_PLAYED + 1, Number.NaN])('rejects %s hours', (hours) => {
    expectCode(() => toTotalMinutes({ hours, minutes: 0 }), 'item.invalid_hours');
  });

  it.each([-1, 60, 2.5])('rejects %s minutes', (minutes) => {
    expectCode(() => toTotalMinutes({ hours: 1, minutes }), 'item.invalid_minutes');
  });

  it.each([
    [0, '00:00'],
    [5, '00:05'],
    [2730, '45:30'],
    [7205, '120:05'],
  ])('formats %s minutes as %s', (minutes, text) => {
    expect(formatDuration(minutes)).toBe(text);
  });
});
