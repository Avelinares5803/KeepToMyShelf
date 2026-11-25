import { formatPartialDate, localDayOf } from '../../../core/dates/format-date';
import type { Language } from '../../../shared/settings';

/** "14/11/2026, 18:30" or "14 Nov 2026, 18:30", in local time. */
export function formatMoment(iso: string, language: Language): string {
  const moment = new Date(iso);
  const time = `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`;
  return `${formatPartialDate(localDayOf(moment), language)}, ${time}`;
}
