import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntrySummary } from '../../../shared/catalogs';
import type { ItemKind } from '../../../shared/content';
import { EntryPicker } from './EntryPicker';
import { EMPTY_RELEASE_FIELDS, type ReleaseFields } from './item-form';

interface ReleaseDatesInputProps {
  legend: string;
  regions: readonly CatalogEntrySummary[];
  kind: ItemKind;
  value: readonly ReleaseFields[];
  onChange: (value: ReleaseFields[]) => void;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** Rows of release dates, each with an optional region and a date with optional day and month. */
export function ReleaseDatesInput({
  legend,
  regions,
  kind,
  value,
  onChange,
}: ReleaseDatesInputProps) {
  const { t } = useTranslation();
  const update = (index: number, changes: Partial<ReleaseFields>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...changes } : row)));

  return (
    <fieldset className="fieldset">
      <legend>{legend}</legend>
      {value.map((row, index) => (
        <ReleaseRow
          key={index}
          number={index + 1}
          row={row}
          regions={regions}
          kind={kind}
          onChange={(changes) => update(index, changes)}
          onRemove={() => onChange(value.filter((_, i) => i !== index))}
        />
      ))}
      <button
        type="button"
        className="button button--ghost"
        onClick={() => onChange([...value, EMPTY_RELEASE_FIELDS])}
      >
        {t('items.releases.add')}
      </button>
    </fieldset>
  );
}

interface ReleaseRowProps {
  number: number;
  row: ReleaseFields;
  regions: readonly CatalogEntrySummary[];
  kind: ItemKind;
  onChange: (changes: Partial<ReleaseFields>) => void;
  onRemove: () => void;
}

function ReleaseRow({ number, row, regions, kind, onChange, onRemove }: ReleaseRowProps) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long' });

  return (
    <fieldset className="date-input release-row">
      <legend>{t('items.releases.row', { number })}</legend>
      <div className="date-input__parts">
        <div className="release-row__region">
          <EntryPicker
            label={t('items.releases.region')}
            entries={regions}
            kind={kind}
            value={row.region === null ? [] : [row.region]}
            onChange={(choices) => onChange({ region: choices[0] ?? null })}
            single
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-day`}>{t('items.dates.day')}</label>
          <input
            id={`${id}-day`}
            type="text"
            inputMode="numeric"
            maxLength={2}
            size={2}
            value={row.day}
            onChange={(event) => onChange({ day: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-month`}>{t('items.dates.month')}</label>
          <select
            id={`${id}-month`}
            value={row.month}
            onChange={(event) => onChange({ month: event.target.value })}
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
            value={row.year}
            onChange={(event) => onChange({ year: event.target.value })}
          />
        </div>
        <button
          type="button"
          className="link-button link-button--danger"
          aria-label={t('items.releases.remove', { number })}
          onClick={onRemove}
        >
          {t('items.fields.remove')}
        </button>
      </div>
    </fieldset>
  );
}
