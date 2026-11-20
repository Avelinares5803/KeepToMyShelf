import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { rolesForKind, type ItemRole } from '../../../core/catalogs/catalogs';
import {
  filterFieldFor,
  NUMBER_LIMITS,
  NUMBER_MEASURES,
  type NumberMeasure,
} from '../../../core/filters/filter-fields';
import { ITEM_STATUSES } from '../../../core/items/item-draft';
import { RATING_MAX, RATING_MIN, ratingToStars } from '../../../core/items/rating';
import { normalizeForSearch } from '../../../core/text/normalize';
import type { ItemKind } from '../../../shared/content';
import type { ItemFilterRange, ItemFilterValue, ItemFilterValues } from '../../../shared/items';
import { measureLabel, replayPluralLabel, roleLabel, statusLabel } from '../items/labels';
import { useStarsText } from '../items/StarRating';
import {
  FORMAT_OPTIONS,
  isInvalidBound,
  parseBound,
  toggled,
  type NumberRangeText,
  type SimpleFilters as Filters,
} from './simple-filters';

/** With more values than this, an attribute gets its own search box. */
const SEARCH_FROM_VALUES = 10;
/** Most values drawn at once: a long list is narrowed down by searching. */
const MAX_SHOWN_VALUES = 100;

const RATINGS = Array.from({ length: RATING_MAX - RATING_MIN + 1 }, (_, i) => RATING_MAX - i);

interface SimpleFiltersProps {
  kind: ItemKind;
  filters: Filters;
  /** Null until they have loaded. */
  values: ItemFilterValues | null;
  onChange: (filters: Filters) => void;
}

/** Checkboxes to filter a library: any mark of an attribute, and all attributes with marks. */
export function SimpleFilters({ kind, filters, values, onChange }: SimpleFiltersProps) {
  const { t } = useTranslation();
  const id = useId();
  const formatStars = useStarsText();

  const change = (next: Partial<Filters>) => onChange({ ...filters, ...next });
  const changeRole = (role: ItemRole, ids: readonly number[]) =>
    change({ roles: { ...filters.roles, [role]: ids } });
  const ratingMarks = Number(filters.minRating !== null) + Number(filters.unrated);

  return (
    <section className="simple-filters" aria-label={t('library.filters.panel')}>
      <div className="simple-filters__top">
        <Checkbox
          label={t('library.filters.favorite')}
          checked={filters.favorite}
          onChange={() => change({ favorite: !filters.favorite })}
        />
        <Checkbox
          label={replayPluralLabel(t, kind)}
          checked={filters.replay}
          onChange={() => change({ replay: !filters.replay })}
        />
      </div>

      <div className="simple-filters__sections">
        <Section label={t('items.fields.status')} marks={filters.status.length}>
          {ITEM_STATUSES.map((status) => (
            <Checkbox
              key={status}
              label={statusLabel(t, kind, status)}
              checked={filters.status.includes(status)}
              onChange={() => change({ status: toggled(filters.status, status) })}
            />
          ))}
        </Section>

        <Section label={t('items.rating.label')} marks={ratingMarks}>
          <div className="inline-field">
            <label htmlFor={`${id}-rating`}>{t('library.filters.atLeast')}</label>
            <select
              id={`${id}-rating`}
              value={filters.minRating ?? ''}
              onChange={(event) =>
                change({
                  minRating: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            >
              <option value="">{t('library.filters.anyRating')}</option>
              {RATINGS.map((rating) => {
                const stars = ratingToStars(rating);
                return (
                  <option key={rating} value={rating}>
                    {t('items.rating.set', { count: stars, stars: formatStars(stars) })}
                  </option>
                );
              })}
            </select>
          </div>
          <Checkbox
            label={t('library.filters.unrated')}
            checked={filters.unrated}
            onChange={() => change({ unrated: !filters.unrated })}
          />
        </Section>

        <Section label={t('items.fields.format')} marks={filters.format.length}>
          {FORMAT_OPTIONS.map((format) => (
            <Checkbox
              key={format}
              label={t(`items.format.${format}`)}
              checked={filters.format.includes(format)}
              onChange={() => change({ format: toggled(filters.format, format) })}
            />
          ))}
        </Section>

        {NUMBER_MEASURES.filter((measure) => filterFieldFor(kind, measure) !== null).map(
          (measure) => {
            const range = values?.ranges[measure];
            const typed = filters.ranges[measure] ?? { from: '', to: '' };
            // Hidden while no item has the number, unless something is typed to undo.
            if (range === undefined && typed.from === '' && typed.to === '') return null;
            const marks =
              Number(parseBound(measure, typed.from) !== null) +
              Number(parseBound(measure, typed.to) !== null);
            return (
              <Section key={measure} label={measureLabel(t, kind, measure)} marks={marks}>
                <RangeFields
                  label={measureLabel(t, kind, measure)}
                  measure={measure}
                  range={range}
                  typed={typed}
                  onChange={(next) => change({ ranges: { ...filters.ranges, [measure]: next } })}
                />
              </Section>
            );
          },
        )}

        {rolesForKind(kind).map((role) => {
          const options = values?.roles[role];
          if (options === undefined || options.length === 0) return null;
          const marked = filters.roles[role] ?? [];
          return (
            <Section key={role} label={roleLabel(t, role)} marks={marked.length}>
              <ValueList
                label={roleLabel(t, role)}
                options={options}
                marked={marked}
                onChange={(ids) => changeRole(role, ids)}
              />
            </Section>
          );
        })}

        {values !== null && values.collections.length > 0 && (
          <Section label={t('collections.title')} marks={filters.collections.length}>
            <ValueList
              label={t('collections.title')}
              options={values.collections}
              marked={filters.collections}
              onChange={(ids) => change({ collections: ids })}
            />
          </Section>
        )}
      </div>
    </section>
  );
}

/** A folded attribute. Its content only exists while open, so long lists cost nothing. */
function Section({
  label,
  marks,
  children,
}: {
  label: string;
  marks: number;
  children: ReactNode;
}) {
  // What is marked must be in sight when the panel appears again.
  const [open, setOpen] = useState(marks > 0);
  return (
    <details
      className="simple-filters__section"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {label}
        {marks > 0 && <span className="library__count"> ({marks})</span>}
      </summary>
      {open && <div className="simple-filters__options">{children}</div>}
    </details>
  );
}

function Checkbox({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  /** Shown beside the name without being part of what the option is called. */
  detail?: string | undefined;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="simple-filters__option">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>
        {label}
        {detail !== undefined && <span className="muted"> ({detail})</span>}
      </span>
    </label>
  );
}

/** "From" and "to" boxes; each applies on its own when it holds a valid number. */
function RangeFields({
  label,
  measure,
  range,
  typed,
  onChange,
}: {
  label: string;
  measure: NumberMeasure;
  /** What the library's items have, shown as a hint. */
  range: ItemFilterRange | undefined;
  typed: NumberRangeText;
  onChange: (typed: NumberRangeText) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const { min, max } = NUMBER_LIMITS[measure];
  const bound = (side: 'from' | 'to', hint: number | undefined) => (
    <div className="inline-field">
      <label htmlFor={`${id}-${side}`}>{t(`library.filters.${side}`)}</label>
      <input
        id={`${id}-${side}`}
        type="number"
        inputMode="numeric"
        className="simple-filters__number"
        // "From" alone would not say which number, among several sections.
        aria-label={t(`library.filters.${side}Field`, { field: label })}
        min={min}
        max={max}
        step={1}
        placeholder={hint === undefined ? undefined : String(hint)}
        aria-invalid={isInvalidBound(measure, typed[side])}
        value={typed[side]}
        onChange={(event) => onChange({ ...typed, [side]: event.target.value })}
      />
    </div>
  );
  return (
    <div className="simple-filters__range">
      {bound('from', range?.min)}
      {bound('to', range?.max)}
    </div>
  );
}

function ValueList({
  label,
  options,
  marked,
  onChange,
}: {
  label: string;
  options: readonly ItemFilterValue[];
  marked: readonly number[];
  onChange: (ids: readonly number[]) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const key = normalizeForSearch(query);

  const matchingAlias = (option: ItemFilterValue) =>
    key.length > 0 && !normalizeForSearch(option.name).includes(key)
      ? option.aliases.find((alias) => normalizeForSearch(alias).includes(key))
      : undefined;
  // What is marked stays in sight, so that it can always be unmarked.
  const matching = options.filter(
    (option) =>
      marked.includes(option.id) ||
      key.length === 0 ||
      normalizeForSearch(option.name).includes(key) ||
      matchingAlias(option) !== undefined,
  );
  const shown = matching.slice(0, MAX_SHOWN_VALUES);

  return (
    <>
      {options.length > SEARCH_FROM_VALUES && (
        <input
          type="search"
          className="simple-filters__search"
          aria-label={t('library.filters.searchValues', { field: label })}
          placeholder={t('library.filters.searchValues', { field: label })}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <div className="simple-filters__values">
        {shown.map((option) => (
          <Checkbox
            key={option.id}
            label={option.name}
            detail={matchingAlias(option)}
            checked={marked.includes(option.id)}
            onChange={() => onChange(toggled(marked, option.id))}
          />
        ))}
      </div>
      {matching.length === 0 && <p className="muted">{t('library.filters.noMatches')}</p>}
      {matching.length > shown.length && (
        <p className="muted">
          {t('library.filters.tooMany', { shown: shown.length, total: matching.length })}
        </p>
      )}
    </>
  );
}
