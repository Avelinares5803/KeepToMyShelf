import { ValidationError } from '../errors';

/** Hours played are stored as total minutes. */
export const MAX_HOURS_PLAYED = 99_999;

export interface HoursAndMinutes {
  readonly hours: number;
  readonly minutes: number;
}

/** Combines hours (0..99999) and minutes (0..59) into total minutes. */
export function toTotalMinutes({ hours, minutes }: HoursAndMinutes): number {
  if (!Number.isInteger(hours) || hours < 0 || hours > MAX_HOURS_PLAYED) {
    throw new ValidationError('item.invalid_hours', `Invalid hours: ${hours}`);
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    throw new ValidationError('item.invalid_minutes', `Invalid minutes: ${minutes}`);
  }
  return hours * 60 + minutes;
}

export function toHoursAndMinutes(totalMinutes: number): HoursAndMinutes {
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/** "HH:MM", e.g. 2730 → "45:30", 5 → "00:05", 7205 → "120:05". */
export function formatDuration(totalMinutes: number): string {
  const { hours, minutes } = toHoursAndMinutes(totalMinutes);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
