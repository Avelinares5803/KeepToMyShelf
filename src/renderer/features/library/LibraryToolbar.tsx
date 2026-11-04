import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ITEM_SORT_FIELDS,
  type ItemSort,
  type ItemSortField,
} from '../../../core/filters/item-sort';
import type { ItemKind } from '../../../shared/content';
import { reversedSort, sortByField } from './library-view';

interface LibraryToolbarProps {
  kind: ItemKind;
  search: string;
  sort: ItemSort;
  onSearch: (search: string) => void;
  onSort: (sort: ItemSort) => void;
}

/** What each direction means depends on what is being sorted. */
const directionGroup = (field: ItemSortField) => {
  if (field === 'title') return 'text';
  return field === 'rating' ? 'number' : 'date';
};

/** The search box and the sort controls of a library. */
export function LibraryToolbar({ kind, search, sort, onSearch, onSort }: LibraryToolbarProps) {
  const { t } = useTranslation();
  const id = useId();

  const fieldLabel = (field: ItemSortField) =>
    field === 'releaseDate' && kind !== 'game'
      ? t('library.sort.premiereDate')
      : t(`library.sort.${field}`);

  return (
    <div className="library__toolbar inline-field">
      <input
        type="search"
        className="library__search"
        aria-label={t('library.search')}
        placeholder={t('library.search')}
        value={search}
        onChange={(event) => onSearch(event.target.value)}
      />
      <div className="inline-field">
        <label htmlFor={`${id}-sort`}>{t('library.sort.label')}</label>
        <select
          id={`${id}-sort`}
          value={sort.field}
          onChange={(event) => onSort(sortByField(event.target.value as ItemSortField))}
        >
          {ITEM_SORT_FIELDS.map((field) => (
            <option key={field} value={field}>
              {fieldLabel(field)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="button button--ghost"
          title={t('library.sort.reverse')}
          onClick={() => onSort(reversedSort(sort))}
        >
          {t(`library.sort.direction.${directionGroup(sort.field)}.${sort.direction}`)}
        </button>
      </div>
    </div>
  );
}
