import type { PartialDate } from './partial-date';

export type DateDisplayLanguage = 'es' | 'en';

// Fixed list instead of Intl: some English locales abbreviate September as "Sept".
const ENGLISH_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const pad2 = (value: number) => String(value).padStart(2, '0');

/**
 * Formats a partial date for display, showing only the components it has.
 * Spanish: "14/03/2021", "03/2021", "2021". English uses the month's name so the order
 * of day and month is never ambiguous: "14 Mar 2021", "Mar 2021", "2021".
 */
export function formatPartialDate(date: PartialDate, language: DateDisplayLanguage): string {
  const year = String(date.year).padStart(4, '0');
  if (date.month === undefined) return year;

  if (language === 'en') {
    const month = ENGLISH_MONTHS[date.month - 1] ?? '';
    return date.day === undefined ? `${month} ${year}` : `${date.day} ${month} ${year}`;
  }
  return date.day === undefined
    ? `${pad2(date.month)}/${year}`
    : `${pad2(date.day)}/${pad2(date.month)}/${year}`;
}

/** Local calendar day of a moment in time (e.g. the date an item was added). */
export function localDayOf(moment: Date): PartialDate {
  return { year: moment.getFullYear(), month: moment.getMonth() + 1, day: moment.getDate() };
}
