import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldErrorMessage, invalidProps } from '../../components/FieldErrorMessage';
import type { DateFields } from './item-form';

/** The error shown for each part of a date, if any. */
export type DateErrors = Readonly<Partial<Record<keyof Omit<DateFields, 'unknown'>, string>>>;

interface UsageDateInputProps {
  legend: string;
  value: DateFields;
  onChange: (value: DateFields) => void;
  errors?: DateErrors;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);
const PARTS = ['day', 'month', 'year'] as const;

/** Day, month and year, each optional (the year is needed if any other part is given), or "unknown". */
export function UsageDateInput({ legend, value, onChange, errors = {} }: UsageDateInputProps) {
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
            {...invalidProps(`${id}-day-error`, errors.day)}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-month`}>{t('items.dates.month')}</label>
          <select
            id={`${id}-month`}
            value={value.month}
            disabled={value.unknown}
            onChange={(event) => set({ month: event.target.value })}
            {...invalidProps(`${id}-month-error`, errors.month)}
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
            {...invalidProps(`${id}-year-error`, errors.year)}
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
      <DateErrorMessages id={id} errors={errors} />
    </fieldset>
  );
}

/** The messages of a date's parts, below the parts; each input points at its own message. */
export function DateErrorMessages({ id, errors }: { id: string; errors: DateErrors }) {
  return PARTS.map((part) => (
    <FieldErrorMessage key={part} id={`${id}-${part}-error`} message={errors[part]} />
  ));
}
