import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { DateFields } from './item-form';

interface UsageDateInputProps {
  legend: string;
  value: DateFields;
  onChange: (value: DateFields) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** Day, month and year, each optional (the year is needed if any other part is given), or "unknown". */
export function UsageDateInput({ legend, value, onChange }: UsageDateInputProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long' });
  const set = (changes: Partial<DateFields>) => onChange({ ...value, ...changes });

  return (
    <fieldset className="date-input">
      <legend>{legend}</legend>
      <div className="date-input__parts">
        <div className="field">
          <label htmlFor={`${id}-day`}>{t('items.dates.day')}</label>
          <input
            id={`${id}-day`}
            type="text"
            inputMode="numeric"
            maxLength={2}
            size={2}
            value={value.day}
            disabled={value.unknown}
            onChange={(event) => set({ day: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-month`}>{t('items.dates.month')}</label>
          <select
            id={`${id}-month`}
            value={value.month}
            disabled={value.unknown}
            onChange={(event) => set({ month: event.target.value })}
          >
            <option value="">{t('items.dates.noMonth')}</option>
            {MONTHS.map((month) => (
              <option key={month} value={String(month)}>
                {monthName.format(new Date(2000, month - 1, 1))}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${id}-year`}>{t('items.dates.year')}</label>
          <input
            id={`${id}-year`}
            type="text"
            inputMode="numeric"
            maxLength={4}
            size={4}
            value={value.year}
            disabled={value.unknown}
            onChange={(event) => set({ year: event.target.value })}
          />
        </div>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={value.unknown}
            onChange={(event) => set({ unknown: event.target.checked })}
          />
          {t('items.dates.unknown')}
        </label>
      </div>
    </fieldset>
  );
}
