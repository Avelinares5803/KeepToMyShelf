import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ITEM_SORT_FIELDS,
  type ItemSort,
  type ItemSortField,
} from '../../../core/filters/item-sort';
import type { ItemKind } from '../../../shared/content';
import { reversedSort, sortByField } from './library-view';

interface LibraryToolbarProps {
  /** The kind listed; null when every kind is (e.g. in a collection). */
  kind: ItemKind | null;
  search: string;
  sort: ItemSort;
  /** The button of the filters; left out where there are none (e.g. in a collection). */
  filters?: {
    /** How many filters are marked, shown in the button that opens them. */
    readonly marks: number;
    readonly open: boolean;
    readonly onToggle: () => void;
  };
  /** More controls, between the search box and the sort controls. */
  children?: ReactNode;
  onSearch: (search: string) => void;
  onSort: (sort: ItemSort) => void;
}

/** What each direction means depends on what is being sorted. */
const directionGroup = (field: ItemSortField) => {
  if (field === 'title') return 'text';
  return field === 'rating' ? 'number' : 'date';
};

/** "Release date" for games, "premiere date" for movies and series, both for every kind. */
function releaseDateKey(kind: ItemKind | null): string {
  if (kind === null) return 'library.sort.releaseOrPremiereDate';
  return kind === 'game' ? 'library.sort.releaseDate' : 'library.sort.premiereDate';
}

/** The search box, the button of the filters and the sort controls of a library. */
export function LibraryToolbar({
  kind,
  search,
  sort,
  filters,
  children,
  onSearch,
  onSort,
}: LibraryToolbarProps) {
  const { t } = useTranslation();
  const id = useId();

  const fieldLabel = (field: ItemSortField) =>
    field === 'releaseDate' ? t(releaseDateKey(kind)) : t(`library.sort.${field}`);

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
      {filters && (
        <button
          type="button"
          className="button button--ghost"
          aria-expanded={filters.open}
          onClick={filters.onToggle}
        >
          {filters.marks > 0
            ? t('library.filters.openWithCount', { count: filters.marks })
            : t('library.filters.open')}
        </button>
      )}
      {children}
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
